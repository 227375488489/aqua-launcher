use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::paths;

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const TTL: Duration = Duration::from_secs(600);

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: String,
    pub url: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(rename = "releaseTime", default)]
    pub release_time: String,
    #[serde(rename = "complianceLevel", default)]
    pub compliance_level: Option<u32>,
}

#[derive(Deserialize)]
struct Manifest {
    #[serde(default)]
    versions: Vec<VersionEntry>,
}

#[derive(Serialize, Deserialize)]
struct DiskCache {
    fetched: u64,
    versions: Vec<VersionEntry>,
}

fn cache() -> &'static Mutex<Option<(Instant, Vec<VersionEntry>)>> {
    static CACHE: OnceLock<Mutex<Option<(Instant, Vec<VersionEntry>)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn disk_path() -> std::path::PathBuf {
    paths::data_dir().join("version_manifest.json")
}

fn read_disk() -> Option<Vec<VersionEntry>> {
    let raw = std::fs::read_to_string(disk_path()).ok()?;
    let cache: DiskCache = serde_json::from_str(&raw).ok()?;
    if cache.versions.is_empty() {
        None
    } else {
        Some(cache.versions)
    }
}

fn write_disk(versions: &[VersionEntry]) {
    let _ = paths::ensure_dir(&paths::data_dir());
    let payload = DiskCache {
        fetched: crate::state::now_secs() as u64,
        versions: versions.to_vec(),
    };
    if let Ok(raw) = serde_json::to_string(&payload) {
        let _ = std::fs::write(disk_path(), raw);
    }
}

pub async fn get(client: &reqwest::Client, force: bool) -> Result<Vec<VersionEntry>> {
    if !force {
        if let Some((at, versions)) = cache().lock().unwrap().as_ref() {
            if at.elapsed() < TTL {
                return Ok(versions.clone());
            }
        }
    }

    match client.get(MANIFEST_URL).send().await?.error_for_status() {
        Ok(response) => {
            let manifest: Manifest = response.json().await?;
            if manifest.versions.is_empty() {
                return Err(anyhow::anyhow!("Mojang вернул пустой список версий"));
            }
            *cache().lock().unwrap() = Some((Instant::now(), manifest.versions.clone()));
            write_disk(&manifest.versions);
            Ok(manifest.versions)
        }
        Err(_) => match cache().lock().unwrap().as_ref().map(|(_, v)| v.clone()).or_else(read_disk) {
            Some(versions) => Ok(versions),
            None => Err(anyhow::anyhow!(
                "Нет соединения с Mojang и нет сохранённого списка версий"
            )),
        },
    }
}
