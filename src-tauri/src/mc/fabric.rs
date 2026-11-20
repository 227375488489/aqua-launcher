//! Fabric: официальный meta API, профиль загрузчика и библиотеки с maven.fabricmc.net.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

use super::install::{self, Installer};
use super::version::{self, VersionMeta};
use crate::state::Settings;

const META: &str = "https://meta.fabricmc.net/v2";
const QUILT_META: &str = "https://meta.quiltmc.org/v3";
const UA: &str = "AquaLauncher/3.0.0 (github.com/227375488489/aqua-launcher)";

#[derive(Deserialize)]
struct LoaderEntry {
    loader: LoaderInfo,
}

#[derive(Deserialize)]
struct LoaderInfo {
    version: String,
    #[serde(default)]
    stable: bool,
}

async fn pick_loader(client: &reqwest::Client, game: &str) -> Result<String> {
    pick_from(client, META, game).await
}

async fn pick_from(client: &reqwest::Client, base: &str, game: &str) -> Result<String> {
    let url = format!("{base}/versions/loader/{game}");
    let list: Vec<LoaderEntry> = client
        .get(&url)
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()
        .with_context(|| format!("Fabric: нет данных для версии {game}"))?
        .json()
        .await?;
    list.iter()
        .find(|e| e.loader.stable)
        .or_else(|| {
            list.iter().find(|e| {
                let value = e.loader.version.to_ascii_lowercase();
                !value.contains("beta") && !value.contains("alpha") && !value.contains("pre")
            })
        })
        .or_else(|| list.first())
        .map(|e| e.loader.version.clone())
        .ok_or_else(|| anyhow!("fabric_no_loader:{game}"))
}

/// Ставит ванильную версию (если нужно) и профиль Fabric. Возвращает id версии.
pub async fn install(
    app: &AppHandle,
    client: &reqwest::Client,
    root: &Path,
    game: &str,
    wanted: Option<&str>,
    settings: &Settings,
) -> Result<String> {
    if !install::is_installed(root, game) {
        Installer::new(
            app.clone(),
            client,
            root.to_path_buf(),
            settings.clone(),
            game.to_string(),
        )
        .run()
        .await?;
    }

    let loader = match wanted.map(str::trim).filter(|v| !v.is_empty()) {
        Some(version) => version.to_string(),
        None => pick_loader(client, game).await?,
    };

    let url = format!("{META}/versions/loader/{game}/{loader}/profile/json");
    let raw = client
        .get(&url)
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()
        .context("Fabric: загрузчик не найден")?
        .text()
        .await?;
    let meta: VersionMeta = serde_json::from_str(&raw)
        .context("Fabric: не удалось разобрать профиль загрузчика")?;
    let id = if meta.id.is_empty() {
        format!("fabric-loader-{loader}-{game}")
    } else {
        meta.id.clone()
    };

    let dir = root.join("versions").join(&id);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{id}.json")), &raw)?;

    let installer = Installer::new(
        app.clone(),
        client,
        root.to_path_buf(),
        settings.clone(),
        id.clone(),
    );
    installer.install_libraries(&meta).await?;

    let major = version::load(root, game)
        .map(|m| m.java_major())
        .unwrap_or_else(|| meta.java_major());
    super::java::ensure(app, client, root, settings, major).await?;

    Ok(id)
}

/// Доступные версии Fabric/Quilt для указанной игры (новые сверху).
pub async fn versions(client: &reqwest::Client, game: &str, quilt: bool) -> Result<Vec<String>> {
    let base = if quilt { QUILT_META } else { META };
    let url = format!("{base}/versions/loader/{game}");
    let list: Vec<LoaderEntry> = client
        .get(&url)
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(list.into_iter().map(|entry| entry.loader.version).collect())
}

/// Ставит Quilt Loader и возвращает id версии.
pub async fn install_quilt(
    app: &AppHandle,
    client: &reqwest::Client,
    root: &Path,
    game: &str,
    wanted: Option<&str>,
    settings: &Settings,
) -> Result<String> {
    if !install::is_installed(root, game) {
        Installer::new(
            app.clone(),
            client,
            root.to_path_buf(),
            settings.clone(),
            game.to_string(),
        )
        .run()
        .await?;
    }

    let loader = match wanted.map(str::trim).filter(|v| !v.is_empty()) {
        Some(version) => version.to_string(),
        None => pick_from(client, QUILT_META, game).await?,
    };

    let url = format!("{QUILT_META}/versions/loader/{game}/{loader}/profile/json");
    let raw = client
        .get(&url)
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()
        .context("Quilt: не удалось загрузить профиль")?
        .text()
        .await?;
    let meta: VersionMeta = serde_json::from_str(&raw)
        .context("Quilt: не удалось разобрать профиль загрузчика")?;
    let id = if meta.id.is_empty() {
        format!("quilt-loader-{loader}-{game}")
    } else {
        meta.id.clone()
    };

    let dir = root.join("versions").join(&id);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{id}.json")), &raw)?;

    let installer = Installer::new(
        app.clone(),
        client,
        root.to_path_buf(),
        settings.clone(),
        id.clone(),
    );
    installer.install_libraries(&meta).await?;

    let major = version::load(root, game)
        .map(|m| m.java_major())
        .unwrap_or_else(|| meta.java_major());
    super::java::ensure(app, client, root, settings, major).await?;

    Ok(id)
}
