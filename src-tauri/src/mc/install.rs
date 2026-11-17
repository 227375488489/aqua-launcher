use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::assets::{self, AssetIndexFile};
use super::rules::{self, Features};
use super::version::{Artifact, MavenName, VersionMeta};
use super::{java, manifest};
use crate::net::{self, Job};
use crate::state::Settings;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub stage: &'static str,
    pub label: String,
    pub current: usize,
    pub total: usize,
    pub bytes: u64,
    pub total_bytes: u64,
}

pub struct Installer {
    pub app: AppHandle,
    pub client: reqwest::Client,
    pub root: PathBuf,
    pub version: String,
    pub settings: Settings,
    pub workers: usize,
}

impl Installer {
    pub fn new(
        app: AppHandle,
        client: &reqwest::Client,
        root: PathBuf,
        settings: Settings,
        version: String,
    ) -> Self {
        Self {
            app,
            client: client.clone(),
            root,
            version,
            workers: settings.download_workers.clamp(1, 64) as usize,
            settings,
        }
    }

    fn emit(&self, stage: &'static str, current: usize, total: usize, bytes: u64, total_bytes: u64) {
        let _ = self.app.emit(
            "install://progress",
            Progress {
                stage,
                label: self.version.clone(),
                current,
                total: total.max(1),
                bytes,
                total_bytes,
            },
        );
    }

    fn progress(
        &self,
        stage: &'static str,
        total: usize,
        total_bytes: u64,
        acc: Arc<AtomicU64>,
    ) -> Arc<dyn Fn(usize, u64) + Send + Sync> {
        let app = self.app.clone();
        let label = self.version.clone();
        let total = total.max(1);
        let gate = Arc::new(Mutex::new(Instant::now() - Duration::from_secs(30)));
        Arc::new(move |done, bytes| {
            acc.store(bytes, Ordering::Relaxed);
            let now = Instant::now();
            let mut last = gate.lock().unwrap();
            if *last + Duration::from_millis(100) > now && done < total {
                return;
            }
            *last = now;
            drop(last);
            let _ = app.emit(
                "install://progress",
                Progress {
                    stage,
                    label: label.clone(),
                    current: done,
                    total,
                    bytes,
                    total_bytes,
                },
            );
        })
    }

    async fn download(&self, jobs: Vec<Job>, stage: &'static str, total_bytes: u64) -> Result<()> {
        if jobs.is_empty() {
            self.emit(stage, 1, 1, 0, total_bytes);
            return Ok(());
        }
        let total = jobs.len();
        self.emit(stage, 0, total, 0, total_bytes);
        let acc = Arc::new(AtomicU64::new(0));
        let progress = self.progress(stage, total, total_bytes, acc.clone());
        net::run(&self.client, jobs, self.workers, progress).await?;
        self.emit(stage, total, total, acc.load(Ordering::Relaxed), total_bytes);
        Ok(())
    }

    /// Скачивает библиотеки и распаковывает нативы из готового манифеста.
    /// Используется и для ванильных версий, и для профилей загрузчиков.
    pub async fn install_libraries(&self, meta: &VersionMeta) -> Result<()> {
        let features = Features { custom_resolution: true, ..Default::default() };
        let library_dir = self.root.join("libraries");
        let mut jobs: Vec<Job> = Vec::new();
        let mut natives: Vec<(PathBuf, Vec<String>)> = Vec::new();
        let mut lib_bytes = 0u64;

        for lib in &meta.libraries {
            if !rules::allow(&lib.rules, &features) {
                continue;
            }
            match &lib.downloads {
                Some(downloads) => {
                    if let Some(artifact) = &downloads.artifact {
                        if let Some(rel) = artifact
                            .path
                            .clone()
                            .or_else(|| MavenName::parse(&lib.name).map(|m| m.path()))
                        {
                            if !artifact.url.is_empty() {
                                lib_bytes += artifact.size.unwrap_or(0);
                                jobs.push(artifact_job(&library_dir, &rel, artifact));
                            }
                        }
                    }
                    if let Some(natives_map) = &lib.natives {
                        if let Some(classifier) = natives_map.get(rules::os_name()) {
                            let classifier = classifier.replace(
                                "${arch}",
                                if cfg!(target_pointer_width = "64") { "64" } else { "32" },
                            );
                            if let Some(artifact) = downloads
                                .classifiers
                                .as_ref()
                                .and_then(|c| c.get(&classifier))
                            {
                                let rel = artifact.path.clone().or_else(|| {
                                    MavenName::parse(&lib.name).map(|mut m| {
                                        m.classifier = Some(classifier.clone());
                                        m.path()
                                    })
                                });
                                if let (Some(rel), false) = (rel, artifact.url.is_empty()) {
                                    lib_bytes += artifact.size.unwrap_or(0);
                                    let dest = library_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
                                    jobs.push(artifact_job(&library_dir, &rel, artifact));
                                    natives.push((
                                        dest,
                                        lib.extract
                                            .as_ref()
                                            .map(|e| e.exclude.clone())
                                            .unwrap_or_default(),
                                    ));
                                }
                            }
                        }
                    }
                }
                None => {
                    if let (Some(base), Some(maven)) = (&lib.url, MavenName::parse(&lib.name)) {
                        let rel = maven.path();
                        jobs.push(Job::new(
                            format!("{base}{rel}"),
                            library_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)),
                        ));
                    }
                }
            }
        }
        self.download(jobs, "libraries", lib_bytes).await?;

        if !natives.is_empty() {
            let natives_dir = self.root.join("natives").join(&self.version);
            std::fs::create_dir_all(&natives_dir)?;
            for (jar, exclude) in natives {
                extract_natives(&jar, &natives_dir, &exclude)?;
            }
        }
        Ok(())
    }

    pub async fn run(&self) -> Result<VersionMeta> {
        let entries = manifest::get(&self.client, false).await?;
        let entry = entries
            .iter()
            .find(|e| e.id == self.version)
            .ok_or_else(|| anyhow!("Версия {} не найдена в списке Mojang", self.version))?
            .clone();

        self.emit("version", 0, 1, 0, 0);
        let raw = self
            .client
            .get(&entry.url)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        if let Some(want) = &entry.sha1 {
            let got = net::hex(&Sha1::digest(&raw));
            if !got.eq_ignore_ascii_case(want) {
                return Err(anyhow!("Манифест версии повреждён (SHA-1 не совпал)"));
            }
        }
        let meta: VersionMeta = serde_json::from_slice(&raw).context("Не удалось разобрать манифест версии")?;

        let version_dir = self.root.join("versions").join(&self.version);
        std::fs::create_dir_all(&version_dir)?;
        std::fs::write(version_dir.join(format!("{}.json", self.version)), &raw)?;
        self.emit("version", 1, 1, 0, 0);

        // Client jar
        if let Some(artifact) = meta.downloads.as_ref().and_then(|d| d.client.as_ref()) {
            let job = Job::new(
                artifact.url.clone(),
                version_dir.join(format!("{}.jar", self.version)),
            )
            .sha1(artifact.sha1.clone())
            .size(artifact.size);
            self.download(vec![job], "client", artifact.size.unwrap_or(0)).await?;
        }

        // Libraries + natives
        self.install_libraries(&meta).await?;

        // Assets
        if let Some(index) = &meta.asset_index {
            if !index.url.is_empty() {
                let total = index.total_size.unwrap_or(0);
                let dest = assets::index_path(&self.root, &index.id);
                self.download(
                    vec![Job::new(index.url.clone(), dest.clone())
                        .sha1(index.sha1.clone())
                        .size(index.size)],
                    "assets",
                    index.size.unwrap_or(0),
                )
                .await?;
                let file: AssetIndexFile = serde_json::from_slice(&std::fs::read(&dest)?)
                    .context("Не удалось разобрать индекс ресурсов")?;
                let objects = assets::jobs(&self.root, &file);
                self.download(objects, "assets", total).await?;
                assets::map_legacy(&self.root, &index.id, &file)?;
            }
        }

        // Log4j configuration
        if let Some(log) = meta.logging.as_ref().and_then(|l| l.client.as_ref()) {
            if !log.file.url.is_empty() {
                let name = log
                    .file
                    .id
                    .clone()
                    .unwrap_or_else(|| format!("{}.xml", self.version));
                let dest = self.root.join("assets").join("log_configs").join(name);
                self.download(
                    vec![Job::new(log.file.url.clone(), dest)
                        .sha1(log.file.sha1.clone())
                        .size(log.file.size)],
                    "assets",
                    0,
                )
                .await?;
            }
        }

        // Java runtime
        self.emit("java", 0, 1, 0, 0);
        java::ensure(
            &self.app,
            &self.client,
            &self.root,
            &self.settings,
            meta.java_major(),
        )
        .await?;
        self.emit("java", 1, 1, 0, 0);

        self.emit("done", 1, 1, 0, 0);
        Ok(meta)
    }
}

fn artifact_job(base: &Path, rel: &str, artifact: &Artifact) -> Job {
    Job::new(
        artifact.url.clone(),
        base.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR)),
    )
    .sha1(artifact.sha1.clone())
    .size(artifact.size)
}

fn extract_natives(jar: &Path, dir: &Path, exclude: &[String]) -> Result<()> {
    let file = std::fs::File::open(jar)
        .with_context(|| format!("Не найден архив нативов {}", jar.display()))?;
    let mut archive = zip::ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        let Some(path) = entry.enclosed_name() else { continue };
        let name = path.to_string_lossy().replace('\\', "/");
        if name.starts_with("META-INF/") || exclude.iter().any(|ex| name.starts_with(ex)) {
            continue;
        }
        let target = dir.join(&*path);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&target)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

pub fn is_installed(root: &Path, id: &str) -> bool {
    fn check(root: &Path, id: &str, depth: u32) -> bool {
        let dir = root.join("versions").join(id);
        if !dir.join(format!("{id}.json")).exists() {
            return false;
        }
        if dir.join(format!("{id}.jar")).exists() {
            return true;
        }
        if depth > 3 {
            return false;
        }
        match super::version::load(root, id).and_then(|m| m.inherits_from) {
            Some(parent) => check(root, &parent, depth + 1),
            None => false,
        }
    }
    check(root, id, 0)
}

pub fn installed_size(root: &Path, id: &str) -> u64 {
    fn walk(dir: &Path, acc: &mut u64) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        walk(&entry.path(), acc);
                    } else {
                        *acc += meta.len();
                    }
                }
            }
        }
    }
    let mut total = 0;
    walk(&root.join("versions").join(id), &mut total);
    total
}
