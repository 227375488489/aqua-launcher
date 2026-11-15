use anyhow::{anyhow, Context, Result};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

use super::install::Progress;
use crate::state::Settings;

#[cfg(windows)]
fn hide(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000);
}
#[cfg(not(windows))]
fn hide(_cmd: &mut Command) {}

pub fn java_bin(home: &Path) -> PathBuf {
    home.join("bin").join(if cfg!(windows) { "java.exe" } else { "java" })
}

pub fn parse_major(output: &str) -> Option<u32> {
    let start = output.find("version \"")? + "version \"".len();
    let rest = &output[start..];
    let end = rest.find('"')?;
    let version = &rest[..end];
    let first: u32 = version.split('.').next()?.parse().ok()?;
    if first == 1 {
        version.split('.').nth(1)?.parse().ok()
    } else {
        Some(first)
    }
}

/// Runs `java -version` and returns the major version.
pub fn probe(java: &Path) -> Option<u32> {
    let mut cmd = Command::new(java);
    cmd.arg("-version");
    hide(&mut cmd);
    let output = cmd.output().ok()?;
    let mut text = String::from_utf8_lossy(&output.stderr).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stdout));
    parse_major(&text)
}

fn global_candidates() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    out.push(PathBuf::from(if cfg!(windows) { "java.exe" } else { "java" }));

    if let Some(home) = std::env::var_os("JAVA_HOME") {
        out.push(java_bin(Path::new(&home)));
    }

    #[cfg(windows)]
    {
        let roots = [
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\Java",
            r"C:\Program Files\Zulu",
            r"C:\Program Files\BellSoft",
            r"C:\Program Files\Microsoft",
            r"C:\Program Files\Amazon Corretto",
            r"C:\Program Files\Semeru",
            r"C:\Program Files (x86)\Java",
        ];
        for root in roots {
            let Ok(entries) = std::fs::read_dir(root) else { continue };
            for entry in entries.flatten() {
                let bin = java_bin(&entry.path());
                if bin.exists() {
                    out.push(bin);
                }
            }
        }
    }

    out
}

fn cached_system() -> Vec<(PathBuf, u32)> {
    static CACHE: Mutex<Option<(Instant, Vec<(PathBuf, u32)>)>> = Mutex::new(None);
    if let Some((at, list)) = CACHE.lock().unwrap().as_ref() {
        if at.elapsed() < Duration::from_secs(120) {
            return list.clone();
        }
    }
    let mut found: Vec<(PathBuf, u32)> = Vec::new();
    for candidate in global_candidates() {
        if let Some(major) = probe(&candidate) {
            if !found.iter().any(|(p, _)| p == &candidate) {
                found.push((candidate, major));
            }
        }
    }
    *CACHE.lock().unwrap() = Some((Instant::now(), found.clone()));
    found
}

fn bundled(root: &Path) -> Vec<(PathBuf, u32)> {
    let mut found = Vec::new();
    let java_root = root.join("java");
    let Ok(entries) = std::fs::read_dir(&java_root) else { return found };
    for entry in entries.flatten() {
        let path = entry.path();
        let direct = java_bin(&path);
        if direct.exists() {
            if let Some(major) = probe(&direct) {
                found.push((direct, major));
            }
            continue;
        }
        if let Ok(children) = std::fs::read_dir(&path) {
            for child in children.flatten() {
                let bin = java_bin(&child.path());
                if bin.exists() {
                    if let Some(major) = probe(&bin) {
                        found.push((bin, major));
                    }
                }
            }
        }
    }
    found
}

pub fn find(root: &Path, major: u32) -> Option<PathBuf> {
    let mut all = bundled(root);
    all.extend(cached_system());
    if let Some((path, _)) = all.iter().find(|(_, v)| *v == major) {
        return Some(path.clone());
    }
    all.iter()
        .filter(|(_, v)| *v >= major)
        .min_by_key(|(_, v)| *v)
        .map(|(p, _)| p.clone())
}

pub async fn ensure(
    app: &AppHandle,
    client: &reqwest::Client,
    root: &Path,
    settings: &Settings,
    major: u32,
) -> Result<PathBuf> {
    if let Some(raw) = settings.java_path.as_ref().filter(|s| !s.trim().is_empty()) {
        let path = PathBuf::from(raw);
        if path.exists() {
            return Ok(path);
        }
    }
    if let Some(path) = find(root, major) {
        return Ok(path);
    }
    if !settings.auto_java {
        return Err(anyhow!(
            "Нужна Java {major}, но она не найдена. Включите авто-загрузку или укажите путь к java.exe."
        ));
    }
    download_runtime(app, client, root, major).await
}

fn platform() -> (&'static str, &'static str) {
    let os = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else {
        "linux"
    };
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86"
    };
    (os, arch)
}

async fn download_runtime(
    app: &AppHandle,
    client: &reqwest::Client,
    root: &Path,
    major: u32,
) -> Result<PathBuf> {
    let (os, arch) = platform();
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{major}/ga/{os}/{arch}/jre/hotspot/normal/eclipse"
    );
    let java_root = root.join("java");
    std::fs::create_dir_all(&java_root)?;
    let archive = java_root.join(format!("jre-{major}.zip"));

    let emit = |current: usize, total: usize, bytes: u64, total_bytes: u64| {
        let _ = app.emit(
            "install://progress",
            Progress {
                stage: "java",
                label: format!("Java {major}"),
                current,
                total: total.max(1),
                bytes,
                total_bytes,
            },
        );
    };

    emit(0, 1, 0, 0);
    let response = client
        .get(&url)
        .send()
        .await?
        .error_for_status()
        .context("Adoptium недоступен")?;
    let total_bytes = response.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(&archive)?;
    let mut stream = response.bytes_stream();
    use futures::StreamExt;
    let mut written = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        use std::io::Write;
        file.write_all(&chunk)?;
        written += chunk.len() as u64;
        emit(0, 1, written, total_bytes);
    }
    drop(file);

    let target = java_root.join(format!("temurin-{major}"));
    std::fs::create_dir_all(&target)?;
    extract_zip(&archive, &target)?;
    let _ = std::fs::remove_file(&archive);

    let bin = find_java_in(&target)
        .ok_or_else(|| anyhow!("В скачанном архиве Java {major} нет java.exe"))?;
    emit(1, 1, written, total_bytes);
    Ok(bin)
}

fn extract_zip(archive: &Path, target: &Path) -> Result<()> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let Some(path) = entry.enclosed_name() else { continue };
        let dest = target.join(&*path);
        if entry.is_dir() {
            std::fs::create_dir_all(&dest)?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
    }
    Ok(())
}

fn find_java_in(dir: &Path) -> Option<PathBuf> {
    for depth in 0..3 {
        if let Some(found) = walk_for_java(dir, depth) {
            return Some(found);
        }
    }
    None
}

fn walk_for_java(dir: &Path, depth: u32) -> Option<PathBuf> {
    let bin = java_bin(dir);
    if bin.exists() {
        return Some(bin);
    }
    if depth == 0 {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = walk_for_java(&path, depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

#[allow(dead_code)]
fn _unused(_: &mut dyn Read) {}
