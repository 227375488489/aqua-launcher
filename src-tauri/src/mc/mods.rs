//! Modrinth: поиск, установка с зависимостями, чтение установленных модов.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

use crate::net::{self, Job};

const API: &str = "https://api.modrinth.com/v2";
const UA: &str = "AquaLauncher/3.0.0 (github.com/227375488489/aqua-launcher)";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    #[serde(rename = "project_id")]
    pub id: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    #[serde(default, rename = "icon_url")]
    pub icon: Option<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default, rename = "project_type")]
    pub kind: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Deserialize)]
struct SearchRes {
    #[serde(default)]
    hits: Vec<Hit>,
}

#[derive(Deserialize, Default)]
struct Hashes {
    #[serde(default)]
    sha1: Option<String>,
}

#[derive(Deserialize, Default)]
struct FileEntry {
    #[serde(default)]
    url: String,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    primary: bool,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    hashes: Hashes,
}

#[derive(Deserialize, Default)]
struct Dependency {
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    dependency_type: String,
}

#[derive(Deserialize, Default)]
struct Version {
    #[serde(default)]
    dependencies: Vec<Dependency>,
    #[serde(default)]
    files: Vec<FileEntry>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    pub installed: Vec<String>,
    pub notes: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub file: String,
    pub name: String,
    pub id: String,
    pub version: String,
    pub loader: String,
    pub size: u64,
    pub depends: Vec<String>,
    pub risk: String,
    pub notes: Vec<String>,
}

pub async fn search(
    client: &reqwest::Client,
    query: &str,
    kind: &str,
    game_version: Option<&str>,
    loader: Option<&str>,
) -> Result<Vec<Hit>> {
    let mut facets: Vec<Vec<String>> = vec![vec![format!("project_type:{}", kind)]];
    if let Some(v) = game_version {
        facets.push(vec![format!("versions:{}", v)]);
    }
    if let Some(l) = loader {
        facets.push(vec![format!("categories:{}", l)]);
    }
    let facets = serde_json::to_string(&facets)?;
    let mut last_error = None;
    for attempt in 0..3u64 {
        let response = client
            .get(format!("{}/search", API))
            .header("User-Agent", UA)
            .query(&[
                ("query", query.to_string()),
                ("limit", "30".to_string()),
                ("facets", facets.clone()),
            ])
            .send()
            .await;
        match response {
            Ok(res) if res.status().is_success() => match res.json::<SearchRes>().await {
                Ok(mut body) => {
                    for hit in &mut body.hits {
                        hit.provider = "modrinth".into();
                        hit.sources = vec!["modrinth".into()];
                    }
                    return Ok(body.hits);
                }
                Err(err) => last_error = Some(anyhow!("Не удалось прочитать ответ Modrinth: {err}")),
            },
            Ok(res) => last_error = Some(anyhow!("Modrinth вернул ошибку {}", res.status())),
            Err(err) => last_error = Some(anyhow!("Modrinth недоступен: {err}")),
        }
        tokio::time::sleep(std::time::Duration::from_millis(350 * (attempt + 1))).await;
    }
    Err(last_error.unwrap_or_else(|| anyhow!("Modrinth недоступен")))
}

async fn versions(
    client: &reqwest::Client,
    project: &str,
    game_version: &str,
    loader: &str,
) -> Result<Vec<Version>> {
    let gv = serde_json::to_string(&[game_version])?;
    let ld = serde_json::to_string(&[loader])?;
    let res = client
        .get(format!("{}/project/{}/version", API, project))
        .header("User-Agent", UA)
        .query(&[("game_versions", gv), ("loaders", ld)])
        .send()
        .await
        .context("Modrinth недоступен")?
        .error_for_status()
        .context("Modrinth вернул ошибку")?;
    Ok(res.json().await.context("Не удалось прочитать версии мода")?)
}

/// Ставит проект и все обязательные зависимости. `progress(done, bytes)` — прогресс загрузки.
pub async fn install(
    client: &reqwest::Client,
    root: &Path,
    project: &str,
    game_version: &str,
    loader: &str,
    workers: usize,
    folder: &str,
    progress: Arc<dyn Fn(usize, u64) + Send + Sync>,
) -> Result<InstallOutcome> {
    let dir = root.join(folder);
    std::fs::create_dir_all(&dir).with_context(|| format!("Не удалось создать {}", dir.display()))?;

    let mut queue = VecDeque::from([(project.to_string(), true)]);
    let mut seen: HashSet<String> = HashSet::new();
    let mut jobs: Vec<Job> = Vec::new();
    let mut notes = Vec::new();
    let mut installed = Vec::new();

    while let Some((id, required)) = queue.pop_front() {
        if !seen.insert(id.clone()) {
            continue;
        }
        if seen.len() > 40 {
            notes.push("Слишком глубокая цепочка зависимостей — установка остановлена".into());
            break;
        }
        let list = versions(client, &id, game_version, loader).await?;
        let Some(version) = list.into_iter().next() else {
            if required {
                return Err(anyhow!(
                    "Для версии {} нет сборки под {} — выберите другую версию или загрузчик",
                    game_version,
                    loader
                ));
            }
            notes.push(format!("Пропущена зависимость {}: нет сборки", id));
            continue;
        };
        let file = version
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| version.files.first());
        let Some(file) = file else {
            notes.push(format!("У проекта {} нет файлов", id));
            continue;
        };
        installed.push(file.filename.clone());
        jobs.push(
            Job::new(file.url.clone(), dir.join(&file.filename))
                .sha1(file.hashes.sha1.clone())
                .size(if file.size > 0 { Some(file.size) } else { None }),
        );
        for dep in version.dependencies {
            if dep.dependency_type != "required" {
                continue;
            }
            if let Some(pid) = dep.project_id {
                queue.push_back((pid, false));
            }
        }
    }

    net::run(client, jobs, workers, progress).await?;
    Ok(InstallOutcome { installed, notes })
}

pub fn list(root: &Path) -> Vec<InstalledMod> {
    let dir = root.join("mods");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jar") {
            continue;
        }
        let file = entry.file_name().to_string_lossy().to_string();
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let meta = read_meta(&path);
        let (risk, notes) = scan(&path);
        out.push(InstalledMod {
            file,
            name: meta.0,
            id: meta.1,
            version: meta.2,
            loader: meta.3,
            size,
            depends: meta.4,
            risk,
            notes,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

pub fn remove(root: &Path, file: &str) -> Result<()> {
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err(anyhow!("Недопустимое имя файла"));
    }
    let path = root.join("mods").join(file);
    std::fs::remove_file(&path).with_context(|| format!("Не удалось удалить {}", file))?;
    Ok(())
}

/// (name, id, version, loader, depends)
fn read_meta(path: &Path) -> (String, String, String, String, Vec<String>) {
    let fallback = (
        path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        String::new(),
        String::new(),
        String::new(),
        Vec::new(),
    );
    let Ok(file) = std::fs::File::open(path) else {
        return fallback;
    };
    let Ok(mut zip) = zip::ZipArchive::new(file) else {
        return fallback;
    };

    if let Some(text) = read_entry(&mut zip, "fabric.mod.json").or_else(|| read_entry(&mut zip, "quilt.mod.json")) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            let quilt = v.get("quilt_loader");
            let src = quilt.unwrap_or(&v);
            let id = src.get("id").and_then(|x| x.as_str()).unwrap_or_default();
            let name = src
                .get("name")
                .and_then(|x| x.as_str())
                .or_else(|| v.get("name").and_then(|x| x.as_str()))
                .unwrap_or(id);
            let version = src
                .get("version")
                .and_then(|x| x.as_str())
                .unwrap_or_default();
            let mut depends = Vec::new();
            if let Some(map) = src.get("depends").and_then(|x| x.as_object()) {
                for key in map.keys() {
                    if !matches!(key.as_str(), "minecraft" | "java" | "fabricloader" | "fabric-loader" | "quilt_loader") {
                        depends.push(key.clone());
                    }
                }
            }
            return (
                name.to_string(),
                id.to_string(),
                version.to_string(),
                "fabric".into(),
                depends,
            );
        }
    }

    if let Some(text) = read_entry(&mut zip, "META-INF/neoforge.mods.toml")
        .or_else(|| read_entry(&mut zip, "META-INF/mods.toml"))
    {
        let mut ids = Vec::new();
        let mut name = String::new();
        let mut version = String::new();
        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("modId") {
                if let Some(val) = quoted(rest) {
                    ids.push(val);
                }
            } else if let Some(rest) = line.strip_prefix("displayName") {
                if let Some(val) = quoted(rest) {
                    if name.is_empty() && !val.contains("${") {
                        name = val;
                    }
                }
            } else if let Some(rest) = line.strip_prefix("version") {
                if version.is_empty() {
                    if let Some(val) = quoted(rest) {
                        if !val.contains("${") {
                            version = val;
                        }
                    }
                }
            }
        }
        if !ids.is_empty() {
            let self_id = ids.remove(0);
            let mut depends: Vec<String> = ids
                .into_iter()
                .filter(|d| !matches!(d.as_str(), "minecraft" | "forge" | "neoforge"))
                .collect();
            depends.dedup();
            return (
                if name.is_empty() { self_id.clone() } else { name },
                self_id,
                version,
                "forge".into(),
                depends,
            );
        }
    }

    fallback
}

fn quoted(line: &str) -> Option<String> {
    let start = line.find('"')?;
    let end = line[start + 1..].find('"')? + start + 1;
    Some(line[start + 1..end].to_string())
}

fn read_entry(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut file = zip.by_name(name).ok()?;
    let mut text = String::new();
    file.read_to_string(&mut text).ok()?;
    Some(text)
}

const EXEC_EXT: [&str; 8] = ["dll", "exe", "so", "dylib", "bat", "cmd", "ps1", "vbs"];
const SUSPECT: [(&str, &str); 4] = [
    ("java/lang/ProcessBuilder", "запускает сторонние процессы"),
    ("Runtime/getRuntime", "может запускать команды системы"),
    ("URLClassLoader", "загружает код извне"),
    ("sun/misc/Unsafe", "работает с памятью напрямую"),
];

const PLATFORM: [&str; 6] = ["minecraft", "java", "fabricloader", "fabric-api", "neoforge", "forge"];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Missing {
    pub mod_name: String,
    pub mod_id: String,
    pub need: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub total: usize,
    pub missing: Vec<Missing>,
}

/// Ищет зависимости, которых нет среди установленных jar.
pub fn health(root: &Path) -> Health {
    let list = list(root);
    let ids: HashSet<String> = list
        .iter()
        .filter(|m| !m.id.is_empty())
        .map(|m| m.id.to_lowercase())
        .collect();
    let mut missing = Vec::new();
    for item in &list {
        for dep in &item.depends {
            let key = dep.to_lowercase();
            if PLATFORM.contains(&key.as_str()) || ids.contains(&key) {
                continue;
            }
            missing.push(Missing {
                mod_name: item.name.clone(),
                mod_id: item.id.clone(),
                need: dep.clone(),
            });
        }
    }
    Health {
        total: list.len(),
        missing,
    }
}

/// Пытается доставить отсутствующие зависимости: ищет проект по slug мода.
pub async fn repair(
    client: &reqwest::Client,
    root: &Path,
    game_version: &str,
    loader: &str,
    workers: usize,
    progress: Arc<dyn Fn(usize, u64) + Send + Sync>,
) -> Result<InstallOutcome> {
    let mut outcome = InstallOutcome {
        installed: Vec::new(),
        notes: Vec::new(),
    };
    let pending: Vec<String> = health(root).missing.into_iter().map(|m| m.need).collect();
    for need in pending {
        let known = client
            .get(format!("{}/project/{}", API, need))
            .header("User-Agent", UA)
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);
        if !known {
            outcome.notes.push(format!("{} — нет в Modrinth, поставьте вручную", need));
            continue;
        }
        match install(client, root, &need, game_version, loader, workers, "mods", progress.clone()).await {
            Ok(done) => {
                outcome.installed.extend(done.installed);
                outcome.notes.extend(done.notes);
            }
            Err(e) => outcome.notes.push(format!("{}: {}", need, e)),
        }
    }
    outcome.installed.sort();
    outcome.installed.dedup();
    Ok(outcome)
}

/// Оценка безопасности: читает содержимое jar без запуска кода.
fn scan(path: &Path) -> (String, Vec<String>) {
    let Ok(file) = std::fs::File::open(path) else {
        return ("medium".into(), vec!["Архив повреждён или недоступен для проверки".into()]);
    };
    let Ok(mut zip) = zip::ZipArchive::new(file) else {
        return ("medium".into(), vec!["Архив повреждён или недоступен для проверки".into()]);
    };
    let mut notes: Vec<String> = Vec::new();
    let mut level = 0u8; // 0 низкий, 1 средний, 2 высокий
    let mut budget = 32u64 * 1024 * 1024;

    for i in 0..zip.len() {
        let Ok(mut entry) = zip.by_index(i) else { continue };
        let name = entry.name().to_string();
        let lower = name.to_lowercase();
        if let Some(ext) = lower.rsplit('.').next() {
            if EXEC_EXT.contains(&ext) {
                level = level.max(2);
                notes.push(format!("Исполняемый файл внутри архива: {}", name));
            }
        }
        if !lower.ends_with(".class") || entry.size() > 2 * 1024 * 1024 || budget == 0 {
            continue;
        }
        let mut bytes = Vec::new();
        if entry.read_to_end(&mut bytes).is_err() {
            continue;
        }
        budget = budget.saturating_sub(bytes.len() as u64);
        let text = String::from_utf8_lossy(&bytes);
        for (needle, why) in SUSPECT {
            if text.contains(needle) {
                level = level.max(1);
                let note = format!("{} — {}", name.rsplit('/').next().unwrap_or(&name), why);
                if !notes.contains(&note) && notes.len() < 6 {
                    notes.push(note);
                }
            }
        }
    }

    let risk = match level {
        2 => "high",
        1 => "medium",
        _ => "low",
    };
    (risk.into(), notes)
}
