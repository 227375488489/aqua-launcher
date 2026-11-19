//! Карточка проекта Modrinth: описание, скриншоты, версии.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const API: &str = "https://api.modrinth.com/v2";
const UA: &str = "AquaLauncher/0.0.4 (github.com/227375488489/aqua-launcher)";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub url: String,
    #[serde(default)]
    pub featured: bool,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectVersion {
    pub id: String,
    pub name: String,
    pub number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub published: String,
    pub downloads: u64,
    pub file: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub icon: Option<String>,
    pub kind: String,
    pub downloads: u64,
    pub followers: u64,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub published: String,
    pub updated: String,
    pub license: String,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    pub gallery: Vec<GalleryItem>,
    pub versions: Vec<ProjectVersion>,
}

#[derive(Deserialize, Default)]
struct RawProject {
    #[serde(default)]
    id: String,
    #[serde(default)]
    slug: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    body: String,
    #[serde(default, rename = "icon_url")]
    icon: Option<String>,
    #[serde(default, rename = "project_type")]
    kind: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    followers: u64,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    additional_categories: Vec<String>,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    client_side: String,
    #[serde(default)]
    server_side: String,
    #[serde(default)]
    published: String,
    #[serde(default)]
    updated: String,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    issues_url: Option<String>,
    #[serde(default)]
    wiki_url: Option<String>,
    #[serde(default)]
    gallery: Vec<GalleryItem>,
    #[serde(default)]
    license: Option<License>,
}

#[derive(Deserialize, Default)]
struct License {
    #[serde(default)]
    id: String,
}

#[derive(Deserialize, Default)]
struct RawVersion {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    version_number: String,
    #[serde(default)]
    game_versions: Vec<String>,
    #[serde(default)]
    loaders: Vec<String>,
    #[serde(default)]
    date_published: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    files: Vec<RawFile>,
}

#[derive(Deserialize, Default, Clone)]
struct RawFile {
    #[serde(default)]
    filename: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    primary: bool,
}

async fn get_json<T: for<'de> Deserialize<'de>>(client: &reqwest::Client, url: &str) -> Result<T> {
    let mut last = None;
    for attempt in 0..3 {
        let result = client
            .get(url)
            .header("User-Agent", UA)
            .send()
            .await
            .and_then(|r| r.error_for_status());
        match result {
            Ok(response) => match response.json::<T>().await {
                Ok(value) => return Ok(value),
                Err(err) => last = Some(anyhow::anyhow!("Modrinth: ответ не разобран ({err})")),
            },
            Err(err) => last = Some(anyhow::anyhow!("Modrinth недоступен: {err}")),
        }
        tokio::time::sleep(std::time::Duration::from_millis(300 * (attempt + 1))).await;
    }
    Err(last.unwrap_or_else(|| anyhow::anyhow!("Modrinth недоступен")))
}

pub async fn fetch(client: &reqwest::Client, id: &str) -> Result<ProjectDetail> {
    let project: RawProject = get_json(client, &format!("{API}/project/{id}"))
        .await
        .context("Modrinth: проект не найден")?;
    let versions: Vec<RawVersion> = get_json(client, &format!("{API}/project/{id}/version")).await?;

    let mut categories = project.categories;
    for extra in project.additional_categories {
        if !categories.contains(&extra) {
            categories.push(extra);
        }
    }

    Ok(ProjectDetail {
        id: project.id,
        slug: project.slug,
        title: project.title,
        description: project.description,
        body: project.body,
        icon: project.icon,
        kind: project.kind,
        downloads: project.downloads,
        followers: project.followers,
        categories,
        game_versions: project.game_versions,
        loaders: project.loaders,
        client_side: project.client_side,
        server_side: project.server_side,
        published: project.published,
        updated: project.updated,
        license: project.license.map(|l| l.id).unwrap_or_default(),
        source_url: project.source_url.filter(|s| !s.is_empty()),
        issues_url: project.issues_url.filter(|s| !s.is_empty()),
        wiki_url: project.wiki_url.filter(|s| !s.is_empty()),
        gallery: project.gallery.into_iter().filter(|g| !g.url.is_empty()).collect(),
        versions: versions
            .into_iter()
            .map(|v| {
                let file = v
                    .files
                    .iter()
                    .find(|f| f.primary)
                    .or_else(|| v.files.first())
                    .cloned()
                    .unwrap_or_default();
                ProjectVersion {
                    id: v.id,
                    name: v.name,
                    number: v.version_number,
                    game_versions: v.game_versions,
                    loaders: v.loaders,
                    published: v.date_published,
                    downloads: v.downloads,
                    file: file.filename,
                    size: file.size,
                }
            })
            .collect(),
    })
}
