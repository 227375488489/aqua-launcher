use anyhow::{Context, Result};use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::net::Job;

const RESOURCES: &str = "https://resources.download.minecraft.net";

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AssetIndexFile {
    #[serde(default)]
    pub objects: HashMap<String, AssetObject>,
    #[serde(default, rename = "virtual")]
    pub is_virtual: bool,
    #[serde(default)]
    pub map_to_resources: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    #[serde(default)]
    pub size: u64,
}

pub fn index_path(root: &Path, id: &str) -> PathBuf {
    root.join("assets").join("indexes").join(format!("{id}.json"))
}

pub fn object_path(root: &Path, hash: &str) -> PathBuf {
    let prefix = hash.get(0..2).unwrap_or("00");
    root.join("assets").join("objects").join(prefix).join(hash)
}

pub fn jobs(root: &Path, index: &AssetIndexFile) -> Vec<Job> {
    index
        .objects
        .values()
        .map(|object| {
            let dest = object_path(root, &object.hash);
            Job::new(format!("{RESOURCES}/{}/{}", &object.hash[0..2], object.hash), dest)
                .sha1(Some(object.hash.clone()))
                .size(Some(object.size))
        })
        .collect()
}

/// Pre-1.7 versions read assets from a flat directory instead of the hash store.
pub fn map_legacy(root: &Path, index_id: &str, index: &AssetIndexFile) -> Result<()> {
    if !index.is_virtual && !index.map_to_resources {
        return Ok(());
    }
    let target_root = if index.map_to_resources {
        root.join("resources")
    } else {
        root.join("assets").join("virtual").join(index_id)
    };
    for (name, object) in &index.objects {
        let source = object_path(root, &object.hash);
        let target = target_root.join(name.replace('/', std::path::MAIN_SEPARATOR_STR));
        if target.exists() {
            continue;
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&source, &target)
            .with_context(|| format!("Не удалось разложить asset {}", name))?;
    }
    Ok(())
}
