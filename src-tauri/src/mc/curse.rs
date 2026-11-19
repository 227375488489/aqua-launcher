//! CurseForge через публичный API-прокси: поиск, карточка проекта, установка модов.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::{HashSet, VecDeque};
use std::path::Path;
use std::sync::Arc;

use super::mods::{Hit, InstallOutcome};
use crate::net::{self, Job};

const API: &str = "https://api.curse.tools/v1/cf";
const UA: &str = "AquaLauncher/0.0.2 (github.com/227375488489/aqua-launcher)";

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Envelope<T> {
    #[serde(default)]
    data: T,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfMod {
    #[serde(default)]
    id: u64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    summary: String,
    #[serde(default)]
    download_count: u64,
    #[serde(default)]
    class_id: u64,
    #[serde(default)]
    authors: Vec<CfAuthor>,
    #[serde(default)]
    categories: Vec<CfCategory>,
    #[serde(default)]
    logo: Option<CfLogo>,
    #[serde(default)]
    links: CfLinks,
    #[serde(default)]
    screenshots: Vec<CfScreenshot>,
    #[serde(default)]
    date_modified: String,
    #[serde(default)]
    date_created: String,
    #[serde(default)]
    latest_files: Vec<CfFile>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfAuthor {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfCategory {
    #[serde(default)]
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfLogo {
    #[serde(default)]
    thumbnail_url: String,
    #[serde(default)]
    url: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfLinks {
    #[serde(default)]
    website_url: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfScreenshot {
    #[serde(default)]
    url: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfFile {
    #[serde(default)]
    id: u64,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    file_name: String,
    #[serde(default)]
    file_date: String,
    #[serde(default)]
    file_length: u64,
    #[serde(default)]
    download_url: Option<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    hashes: Vec<CfHash>,
    #[serde(default)]
    dependencies: Vec<CfDependency>,
    #[serde(default)]
    mod_id: u64,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfHash {
    #[serde(default)]
    value: String,
    #[serde(default)]
    algo: u32,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CfDependency {
    #[serde(default)]
    mod_id: u64,
    #[serde(default)]
    relation_type: u32,
}

fn class_of(kind: &str) -> u64 {
    match kind {
        "modpack" => 4471,
        "resourcepack" => 12,
        "shader" => 6552,
        _ => 6,
    }
}

fn kind_of(class_id: u64) -> &'static str {
    match class_id {
        4471 => "modpack",
        12 => "resourcepack",
        6552 => "shader",
        _ => "mod",
    }
}

fn loader_type(loader: &str) -> Option<u32> {
    match loader {
        "forge" => Some(1),
        "fabric" => Some(4),
        "quilt" => Some(5),
        "neoforge" => Some(6),
        _ => None,
    }
}

fn to_hit(item: CfMod) -> Hit {
    let icon = item
        .logo
        .as_ref()
        .map(|logo| {
            if !logo.thumbnail_url.is_empty() {
                logo.thumbnail_url.clone()
            } else {
                logo.url.clone()
            }
        })
        .filter(|url| !url.is_empty());
    Hit {
        id: format!("cf:{}", item.id),
        slug: item.slug,
        title: item.name,
        description: item.summary,
        author: item.authors.first().map(|a| a.name.clone()).unwrap_or_default(),
        icon,
        downloads: item.download_count,
        categories: item.categories.into_iter().map(|c| c.name).collect(),
        kind: kind_of(item.class_id).to_string(),
        provider: "curseforge".into(),
        sources: vec!["curseforge".into()],
    }
}

pub async fn search(
    client: &reqwest::Client,
    query: &str,
    kind: &str,
    game_version: Option<&str>,
    loader: Option<&str>,
    limit: u32,
) -> Result<Vec<Hit>> {
    let mut req = client
        .get(format!("{API}/mods/search"))
        .query(&[
            ("gameId", "432".to_string()),
            ("classId", class_of(kind).to_string()),
            ("searchFilter", query.to_string()),
            ("sortField", "2".to_string()),
            ("sortOrder", "desc".to_string()),
            ("pageSize", limit.to_string()),
        ])
        .header("User-Agent", UA);
    if let Some(version) = game_version.filter(|v| !v.is_empty() && !v.starts_with("cf:")) {
        req = req.query(&[("gameVersion", version.to_string())]);
    }
    if let Some(loader) = loader.and_then(loader_type) {
        req = req.query(&[("modLoaderType", loader.to_string())]);
    }
    let res: Envelope<Vec<CfMod>> = req
        .send()
        .await?
        .error_for_status()
        .context("CurseForge недоступен")?
        .json()
        .await?;
    Ok(res.data.into_iter().map(to_hit).collect())
}

fn strip_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut tag = false;
    for ch in input.chars() {
        match ch {
            '<' => tag = true,
            '>' => {
                tag = false;
                out.push(' ');
            }
            _ if !tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn numeric_id(project: &str) -> Result<u64> {
    project
        .trim_start_matches("cf:")
        .parse::<u64>()
        .map_err(|_| anyhow::anyhow!("bad_curse_id"))
}

async fn files_for(
    client: &reqwest::Client,
    id: u64,
    game_version: Option<&str>,
    loader: Option<&str>,
    limit: u32,
) -> Result<Vec<CfFile>> {
    let mut req = client
        .get(format!("{API}/mods/{id}/files"))
        .query(&[("pageSize", limit.to_string())])
        .header("User-Agent", UA);
    if let Some(version) = game_version.filter(|v| !v.is_empty()) {
        req = req.query(&[("gameVersion", version.to_string())]);
    }
    if let Some(loader) = loader.and_then(loader_type) {
        req = req.query(&[("modLoaderType", loader.to_string())]);
    }
    let res: Envelope<Vec<CfFile>> = req
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(res.data)
}

pub async fn project(
    client: &reqwest::Client,
    id: &str,
) -> Result<super::project::ProjectDetail> {
    let numeric = numeric_id(id)?;
    let res: Envelope<CfMod> = client
        .get(format!("{API}/mods/{numeric}"))
        .header("User-Agent", UA)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let mod_ = res.data;
    let files = files_for(client, numeric, None, None, 40).await.unwrap_or_default();
    let versions = files
        .into_iter()
        .map(|file| super::project::ProjectVersion {
            id: format!("cf:{}", file.id),
            name: file.display_name.clone(),
            number: file.display_name,
            game_versions: file.game_versions,
            loaders: Vec::new(),
            published: file.file_date,
            downloads: 0,
            file: file.file_name,
            size: file.file_length,
        })
        .collect();
    Ok(super::project::ProjectDetail {
        id: format!("cf:{}", mod_.id),
        slug: mod_.slug,
        title: mod_.name,
        description: mod_.summary.clone(),
        body: strip_html(&mod_.summary),
        icon: mod_.logo.as_ref().map(|l| l.thumbnail_url.clone()),
        kind: kind_of(mod_.class_id).into(),
        downloads: mod_.download_count,
        followers: 0,
        categories: mod_.categories.into_iter().map(|c| c.name).collect(),
        game_versions: Vec::new(),
        loaders: Vec::new(),
        client_side: "required".into(),
        server_side: "optional".into(),
        published: mod_.date_created,
        updated: mod_.date_modified,
        license: String::new(),
        source_url: Some(mod_.links.website_url).filter(|s| !s.is_empty()),
        issues_url: None,
        wiki_url: None,
        gallery: mod_
            .screenshots
            .into_iter()
            .filter(|s| !s.url.is_empty())
            .map(|s| super::project::GalleryItem {
                url: s.url,
                featured: false,
                title: (!s.title.is_empty()).then_some(s.title),
                description: (!s.description.is_empty()).then_some(s.description),
            })
            .collect(),
        versions,
    })
}

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
    let mut queue = VecDeque::from([numeric_id(project)?]);
    let mut seen = HashSet::new();
    let mut jobs = Vec::new();
    let mut installed = Vec::new();
    let mut notes = Vec::new();
    let dir = root.join(folder);
    std::fs::create_dir_all(&dir)?;

    while let Some(id) = queue.pop_front() {
        if !seen.insert(id) {
            continue;
        }
        if seen.len() > 40 {
            notes.push("dependency limit reached".into());
            break;
        }
        let files = files_for(client, id, Some(game_version), Some(loader), 10).await?;
        let Some(file) = files.into_iter().find(|f| f.download_url.is_some()) else {
            if id == numeric_id(project)? {
                return Err(anyhow::anyhow!("curse_file_not_found"));
            }
            notes.push(format!("no file for dependency {id}"));
            continue;
        };
        for dep in file.dependencies.iter().filter(|d| d.relation_type == 3) {
            queue.push_back(dep.mod_id);
        }
        if let Some(url) = file.download_url.clone() {
            let sha1 = file
                .hashes
                .iter()
                .find(|h| h.algo == 1)
                .map(|h| h.value.clone());
            jobs.push(
                Job::new(url, dir.join(&file.file_name))
                    .sha1(sha1)
                    .size(Some(file.file_length)),
            );
            installed.push(file.file_name);
        }
    }

    let total = jobs.len() as u32;
    let client = client.clone();
    net::run(&client, jobs, workers, progress).await?;
    Ok(InstallOutcome { installed, notes })
}

// Arc helper kept for parity with the Modrinth installer signature.
#[allow(dead_code)]
fn _shared(client: &reqwest::Client) -> Arc<reqwest::Client> {
    Arc::new(client.clone())
}
