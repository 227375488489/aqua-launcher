//! Forge и NeoForge: загрузка официального установщика и запуск его в headless-режиме.

use anyhow::{anyhow, Context, Result};
use std::path::Path;
use std::process::Stdio;

use super::install::{self, Installer};
use super::java;
use super::version;
use crate::state::Settings;

const FORGE_PROMOS: &str =
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
const NEO_MAVEN: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Forge,
    NeoForge,
}

impl Flavor {
    pub fn id(self) -> &'static str {
        match self {
            Flavor::Forge => "forge",
            Flavor::NeoForge => "neoforge",
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Flavor::Forge => "Forge",
            Flavor::NeoForge => "NeoForge",
        }
    }
}

async fn text(client: &reqwest::Client, url: &str) -> Result<String> {
    Ok(client
        .get(url)
        .header("User-Agent", "AquaLauncher/0.1.0")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?)
}

fn tags(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<version>") {
        let after = &rest[start + 9..];
        let Some(end) = after.find("</version>") else { break };
        out.push(after[..end].trim().to_string());
        rest = &after[end + 10..];
    }
    out
}

async fn forge_version(client: &reqwest::Client, game: &str, wanted: Option<&str>) -> Result<String> {
    if let Some(exact) = wanted.map(str::trim).filter(|v| !v.is_empty()) {
        return Ok(exact.to_string());
    }
    if let Ok(body) = text(client, FORGE_PROMOS).await {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
            for key in [format!("{game}-recommended"), format!("{game}-latest")] {
                if let Some(value) = json.get("promos").and_then(|p| p.get(&key)).and_then(|v| v.as_str()) {
                    if !value.is_empty() {
                        return Ok(value.to_string());
                    }
                }
            }
        }
    }
    let xml = text(client, &format!("{FORGE_MAVEN}/maven-metadata.xml")).await?;
    let prefix = format!("{game}-");
    let found = tags(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .filter_map(|v| v.strip_prefix(&prefix).map(str::to_string))
        .last()
        .ok_or_else(|| anyhow!("forge_not_found:{game}"))?;
    Ok(found)
}

async fn neo_version(client: &reqwest::Client, game: &str, wanted: Option<&str>) -> Result<String> {
    if let Some(exact) = wanted.map(str::trim).filter(|v| !v.is_empty()) {
        return Ok(exact.to_string());
    }
    let prefix = format!("{}.", game.trim_start_matches("1."));
    let xml = text(client, &format!("{NEO_MAVEN}/maven-metadata.xml")).await?;
    tags(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .last()
        .ok_or_else(|| anyhow!("forge_not_found:{game}"))
}

fn find_installed(root: &Path, game: &str, flavor: Flavor, loader: &str) -> Option<String> {
    let dir = root.join("versions");
    let entries = std::fs::read_dir(dir).ok()?;
    let mut best: Option<String> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        let matches = match flavor {
            Flavor::Forge => lower.contains("forge") && !lower.contains("neoforge"),
            Flavor::NeoForge => lower.contains("neoforge"),
        };
        if !matches {
            continue;
        }
        if let Some(meta) = version::load(root, &name) {
            if meta.inherits_from.as_deref() == Some(game) || name.contains(loader) || lower.contains(game) {
                let size = entry.path().join(format!("{name}.json")).metadata().map(|m| m.len()).unwrap_or(0);
                if size > 0 && best.as_ref().map_or(true, |current| name > *current) {
                    best = Some(name);
                }
            }
        }
    }
    best
}

/// Ставит Forge/NeoForge через официальный installer jar. Возвращает id версии.
pub async fn install(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    root: &Path,
    game: &str,
    flavor: Flavor,
    wanted: Option<&str>,
    settings: &Settings,
) -> Result<String> {
    use tauri::Emitter;

    if !install::is_installed(root, game) {
        Installer::new(
            app.clone(),
            client,
            root.to_path_buf(),
            settings.clone(),
            game.to_string(),
        )
        .run()
        .await
        .context("Не удалось установить базовую версию")?;
    }

    let loader = match flavor {
        Flavor::Forge => forge_version(client, game, wanted).await?,
        Flavor::NeoForge => neo_version(client, game, wanted).await?,
    };

    if let Some(id) = find_installed(root, game, flavor, &loader) {
        if id.contains(&loader) {
            return Ok(id);
        }
    }

    let (file_name, url) = match flavor {
        Flavor::Forge => (
            format!("forge-{game}-{loader}-installer.jar"),
            format!("{FORGE_MAVEN}/{game}-{loader}/forge-{game}-{loader}-installer.jar"),
        ),
        Flavor::NeoForge => (
            format!("neoforge-{loader}-installer.jar"),
            format!("{NEO_MAVEN}/{loader}/neoforge-{loader}-installer.jar"),
        ),
    };

    let cache = root.join("cache").join("installers");
    std::fs::create_dir_all(&cache)?;
    let jar = cache.join(&file_name);
    let _ = app.emit(
        "install://progress",
        serde_json::json!({
            "stage": "loader",
            "label": flavor.label(),
            "current": 0,
            "total": 2,
            "bytes": 0,
            "totalBytes": 0
        }),
    );
    crate::net::download_to(client, &url, jar.clone(), None).await?;

    let meta = version::resolve(root, game).map(|(m, _)| m).ok();
    let major = meta.map(|m| m.java_major()).unwrap_or(17);
    let exe = java::ensure(app, client, root, settings, major).await?;

    let profiles_file = root.join("launcher_profiles.json");
    if !profiles_file.exists() {
        let _ = std::fs::write(
            &profiles_file,
            r#"{"profiles":{},"settings":{"language":"en_us"},"version":3}"#,
        );
    }

    let output = tokio::process::Command::new(&exe)
        .arg("-Djava.awt.headless=true")
        .arg("-jar")
        .arg(&jar)
        .arg("--installClient")
        .arg(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        let detail = format!("{err}\n{out}");
        let tail: String = detail.chars().rev().take(400).collect::<String>().chars().rev().collect();
        return Err(anyhow!("forge_install_failed:{}", tail.trim()));
    }

    let id = find_installed(root, game, flavor, &loader)
        .ok_or_else(|| anyhow!("forge_install_failed:version not created"))?;
    let _ = app.emit(
        "install://progress",
        serde_json::json!({
            "stage": "loader",
            "label": flavor.label(),
            "current": 2,
            "total": 2,
            "bytes": 0,
            "totalBytes": 0
        }),
    );
    Ok(id)
}
