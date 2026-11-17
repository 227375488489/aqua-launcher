//! Сборки Modrinth (.mrpack): поиск, скачивание файлов и оверрайдов в изолированный профиль.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

use super::install::{self, Installer};
use super::{fabric, mods};
use crate::net::{self, Job};
use crate::state::{now_secs, Profile, Settings};

const API: &str = "https://api.modrinth.com/v2";
const UA: &str = "AquaLauncher/3.0.0 (github.com/227375488489/aqua-launcher)";

#[derive(Deserialize)]
struct PackVersion {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version_number: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    files: Vec<FileEntry>,
}

#[derive(Deserialize, Default)]
struct FileEntry {
    #[serde(default)]
    url: String,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    hashes: Hashes,
}

#[derive(Deserialize, Default)]
struct Hashes {
    #[serde(default)]
    sha1: Option<String>,
}

#[derive(Deserialize, Default)]
struct Index {
    #[serde(default)]
    name: String,
    #[serde(default, rename = "versionId")]
    version_id: String,
    #[serde(default)]
    dependencies: HashMap<String, String>,
    #[serde(default)]
    files: Vec<PackFile>,
}

#[derive(Deserialize, Default)]
struct PackFile {
    #[serde(default)]
    path: String,
    #[serde(default)]
    hashes: Hashes,
    #[serde(default)]
    downloads: Vec<String>,
    #[serde(default, rename = "fileSize")]
    file_size: u64,
    #[serde(default)]
    env: Option<Env>,
}

#[derive(Deserialize, Default)]
struct Env {
    #[serde(default)]
    client: Option<String>,
}

pub async fn search(client: &reqwest::Client, query: &str) -> Result<Vec<mods::Hit>> {
    #[derive(Deserialize)]
    struct Res {
        #[serde(default)]
        hits: Vec<mods::Hit>,
    }
    let facets = r#"[["project_type:modpack"]]"#;
    let response: Res = client
        .get(format!("{API}/search"))
        .query(&[
            ("query", query),
            ("facets", facets),
            ("limit", "24"),
            ("index", "relevance"),
        ])
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(response.hits)
}

async fn versions(client: &reqwest::Client, project: &str) -> Result<Vec<PackVersion>> {
    Ok(client
        .get(format!("{API}/project/{project}/version"))
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()
        .context("Modrinth: сборка не найдена")?
        .json()
        .await?)
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    let short: String = trimmed.chars().take(42).collect();
    if short.is_empty() {
        "pack".into()
    } else {
        short
    }
}

/// Собирает безопасный путь внутри профиля, отбрасывая `..` и абсолютные компоненты.
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let mut out = base.to_path_buf();
    for component in Path::new(rel).components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(out)
}

fn read_index(archive: &mut zip::ZipArchive<std::fs::File>) -> Result<Index> {
    let mut file = archive
        .by_name("modrinth.index.json")
        .context("Это не сборка Modrinth: нет modrinth.index.json")?;
    if file.size() > 8 * 1024 * 1024 {
        return Err(anyhow!("Индекс сборки слишком большой"));
    }
    let mut raw = String::new();
    file.read_to_string(&mut raw)?;
    serde_json::from_str(&raw).context("Не удалось разобрать индекс сборки")
}

fn extract_overrides(
    archive: &mut zip::ZipArchive<std::fs::File>,
    base: &Path,
) -> Result<usize> {
    let mut count = 0;
    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let rest = ["overrides/", "client-overrides/"]
            .iter()
            .find_map(|prefix| name.strip_prefix(prefix));
        let Some(rest) = rest else { continue };
        let Some(dest) = safe_join(base, rest) else { continue };
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&dest)?;
        std::io::copy(&mut entry, &mut out)?;
        count += 1;
    }
    Ok(count)
}

/// Ставит сборку и создаёт для неё отдельный профиль. Возвращает профиль.
pub async fn install(
    app: &AppHandle,
    client: &reqwest::Client,
    root: &Path,
    project: &str,
    version: Option<&str>,
    settings: &Settings,
) -> Result<Profile> {
    let list = versions(client, project).await?;
    let chosen = match version.map(str::trim).filter(|v| !v.is_empty()) {
        Some(id) => list
            .iter()
            .find(|v| v.id == id)
            .or_else(|| list.first())
            .ok_or_else(|| anyhow!("У сборки нет версий"))?,
        None => list
            .iter()
            .find(|v| v.files.iter().any(|f| f.filename.ends_with(".mrpack")))
            .or_else(|| list.first())
            .ok_or_else(|| anyhow!("У сборки нет версий"))?,
    };
    let file = chosen
        .files
        .iter()
        .find(|f| f.filename.ends_with(".mrpack"))
        .ok_or_else(|| anyhow!("В версии сборки нет .mrpack файла"))?;

    let cache = root.join("cache").join("packs");
    std::fs::create_dir_all(&cache)?;
    let archive_path = cache.join(format!(
        "{}-{}.mrpack",
        slugify(&chosen.name),
        slugify(&chosen.version_number)
    ));
    net::download_to(client, &file.url, archive_path.clone(), file.hashes.sha1.clone()).await?;

    let file_handle = std::fs::File::open(&archive_path)?;
    let mut archive = zip::ZipArchive::new(file_handle)?;
    let index = read_index(&mut archive)?;

    let game = index
        .dependencies
        .get("minecraft")
        .or_else(|| chosen.game_versions.first())
        .cloned()
        .ok_or_else(|| anyhow!("В сборке не указана версия Minecraft"))?;

    for unsupported in ["forge", "neoforge", "quilt-loader"] {
        if index.dependencies.contains_key(unsupported) {
            return Err(anyhow!("modpack_loader_unsupported:{unsupported}"));
        }
    }

    let name = if index.name.trim().is_empty() {
        if chosen.name.trim().is_empty() {
            project.to_string()
        } else {
            chosen.name.clone()
        }
    } else {
        index.name.clone()
    };

    let profiles_dir = root.join("profiles");
    let base_id = format!("pack-{}", slugify(&name));
    let mut id = base_id.clone();
    let mut counter = 2;
    while profiles_dir.join(&id).exists() {
        id = format!("{base_id}-{counter}");
        counter += 1;
    }
    let profile_dir = profiles_dir.join(&id);
    std::fs::create_dir_all(&profile_dir)?;

    // Загрузчик (пока поддерживается Fabric; ванильные сборки тоже работают).
    let version_id = match index.dependencies.get("fabric-loader") {
        Some(loader) => {
            fabric::install(app, client, root, &game, Some(loader), settings).await?
        }
        None => {
            if !install::is_installed(root, &game) {
                Installer::new(
                    app.clone(),
                    client,
                    root.to_path_buf(),
                    settings.clone(),
                    game.clone(),
                )
                .run()
                .await?;
            }
            game.clone()
        }
    };

    // Файлы сборки.
    let mut jobs: Vec<Job> = Vec::new();
    for entry in &index.files {
        if entry
            .env
            .as_ref()
            .and_then(|e| e.client.as_deref())
            .map(|c| c == "unsupported")
            .unwrap_or(false)
        {
            continue;
        }
        let Some(url) = entry.downloads.first() else { continue };
        let Some(dest) = safe_join(&profile_dir, &entry.path) else { continue };
        jobs.push(Job::new(url.clone(), dest).sha1(entry.hashes.sha1.clone()).size(Some(entry.file_size)));
    }
    let total = jobs.len();
    if total > 0 {
        let handle = app.clone();
        let label = name.clone();
        let progress = Arc::new(move |done: usize, bytes: u64| {
            let _ = handle.emit(
                "install://progress",
                serde_json::json!({
                    "stage": "pack",
                    "label": label,
                    "current": done,
                    "total": total.max(1),
                    "bytes": bytes,
                    "totalBytes": 0,
                }),
            );
        });
        net::run(client, jobs, settings.download_workers.clamp(1, 32) as usize, progress).await?;
    }

    extract_overrides(&mut archive, &profile_dir)?;

    let icon = async {
        let response = client
            .get(format!("{API}/project/{project}"))
            .header("User-Agent", UA)
            .send()
            .await
            .ok()?;
        let value: serde_json::Value = response.json().await.ok()?;
        value
            .get("icon_url")
            .and_then(|i| i.as_str())
            .map(str::to_string)
    }
    .await;

    Ok(Profile {
        id: id.clone(),
        name,
        version_id,
        loader: "modpack".into(),
        dir: format!("profiles/{id}"),
        icon,
        created_at: now_secs(),
    })
}
