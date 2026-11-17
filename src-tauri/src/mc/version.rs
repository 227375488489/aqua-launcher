use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionMeta {
    pub id: String,
    #[serde(rename = "type", default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub main_class: Option<String>,
    #[serde(default)]
    pub inherits_from: Option<String>,
    #[serde(default)]
    pub assets: Option<serde_json::Value>,
    #[serde(default)]
    pub asset_index: Option<AssetIndex>,
    #[serde(default)]
    pub downloads: Option<Downloads>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub arguments: Option<Arguments>,
    #[serde(default)]
    pub minecraft_arguments: Option<String>,
    #[serde(default)]
    pub java_version: Option<JavaVersion>,
    #[serde(default)]
    pub logging: Option<Logging>,
    #[serde(default)]
    pub release_time: Option<String>,
    #[serde(default)]
    pub compliance_level: Option<u32>,
}

impl VersionMeta {
    pub fn kind(&self) -> &str {
        self.kind.as_deref().unwrap_or("release")
    }

    pub fn java_major(&self) -> u32 {
        self.java_version.as_ref().map(|j| j.major_version).unwrap_or(8)
    }

    pub fn asset_index_id(&self) -> Option<String> {
        if let Some(index) = &self.asset_index {
            return Some(index.id.clone());
        }
        match self.assets.as_ref() {
            Some(serde_json::Value::String(s)) => Some(s.clone()),
            Some(serde_json::Value::Object(o)) => {
                o.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())
            }
            _ => None,
        }
    }
}

/// Читает манифест установленной версии.
pub fn load(root: &Path, id: &str) -> Option<VersionMeta> {
    let raw = std::fs::read_to_string(
        root.join("versions").join(id).join(format!("{id}.json")),
    )
    .ok()?;
    serde_json::from_str(&raw).ok()
}

/// Склеивает версию с её родителем (`inheritsFrom`) — так устроены Fabric, Quilt и
/// профили загрузчиков: собственный манифест плюс ванильный клиент.
/// Возвращает готовый манифест и идентификатор версии, у которой лежит client.jar.
pub fn resolve(root: &Path, id: &str) -> anyhow::Result<(VersionMeta, String)> {
    resolve_at(root, id, 0)
}

fn resolve_at(root: &Path, id: &str, depth: u32) -> anyhow::Result<(VersionMeta, String)> {
    if depth > 4 {
        return Err(anyhow::anyhow!("Слишком длинная цепочка inheritsFrom у {id}"));
    }
    let mut meta = load(root, id)
        .ok_or_else(|| anyhow::anyhow!("Версия {id} не установлена"))?;
    let mut jar = if meta
        .downloads
        .as_ref()
        .and_then(|d| d.client.as_ref())
        .is_some()
    {
        meta.id.clone()
    } else {
        String::new()
    };
    if let Some(parent_id) = meta.inherits_from.clone() {
        let (parent, parent_jar) = resolve_at(root, &parent_id, depth + 1)?;
        if !parent_jar.is_empty() {
            jar = parent_jar;
        }
        meta = merge(meta, parent);
    }
    if jar.is_empty() {
        jar = id.to_string();
    }
    Ok((meta, jar))
}

fn merge(mut child: VersionMeta, parent: VersionMeta) -> VersionMeta {
    let mut libraries = parent.libraries;
    for lib in child.libraries.drain(..) {
        match libraries.iter_mut().find(|l| l.name == lib.name) {
            Some(slot) => *slot = lib,
            None => libraries.push(lib),
        }
    }
    child.libraries = libraries;

    if child.main_class.is_none() {
        child.main_class = parent.main_class;
    }
    child.arguments = merge_arguments(child.arguments, parent.arguments);
    if child.minecraft_arguments.is_none() {
        child.minecraft_arguments = parent.minecraft_arguments;
    }
    if child.asset_index.is_none() {
        child.asset_index = parent.asset_index;
    }
    if child.assets.is_none() {
        child.assets = parent.assets;
    }
    if child.downloads.is_none() {
        child.downloads = parent.downloads;
    }
    if child.java_version.is_none() {
        child.java_version = parent.java_version;
    }
    if child.logging.is_none() {
        child.logging = parent.logging;
    }
    if child.kind.is_none() {
        child.kind = parent.kind;
    }
    if child.release_time.is_none() {
        child.release_time = parent.release_time;
    }
    if child.compliance_level.is_none() {
        child.compliance_level = parent.compliance_level;
    }
    child.inherits_from = None;
    child
}

fn merge_arguments(own: Option<Arguments>, parent: Option<Arguments>) -> Option<Arguments> {
    match (own, parent) {
        (None, None) => None,
        (Some(own), None) => Some(own),
        (None, Some(parent)) => Some(parent),
        (Some(mut own), Some(parent)) => {
            let mut jvm = parent.jvm;
            jvm.append(&mut own.jvm);
            let mut game = parent.game;
            game.append(&mut own.game);
            own.jvm = jvm;
            own.game = game;
            Some(own)
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetIndex {
    pub id: String,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default, rename = "totalSize")]
    pub total_size: Option<u64>,
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Downloads {
    #[serde(default)]
    pub client: Option<Artifact>,
    #[serde(default)]
    pub server: Option<Artifact>,
    #[serde(default)]
    pub client_mappings: Option<Artifact>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub sha1: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub classifiers: Option<HashMap<String, Artifact>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    #[serde(default)]
    pub natives: Option<HashMap<String, String>>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    #[serde(default)]
    pub extract: Option<Extract>,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Extract {
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    #[serde(default)]
    pub features: Option<HashMap<String, bool>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Arguments {
    #[serde(default)]
    pub game: Vec<serde_json::Value>,
    #[serde(default)]
    pub jvm: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    #[serde(default)]
    pub component: String,
    #[serde(default)]
    pub major_version: u32,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct Logging {
    #[serde(default)]
    pub client: Option<LogFile>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LogFile {
    #[serde(default)]
    pub argument: String,
    #[serde(default)]
    pub file: Artifact,
    #[serde(default, rename = "type")]
    pub kind: Option<String>,
}

/// Maven coordinate: `group:artifact:version[:classifier][@ext]`.
#[derive(Debug, Clone)]
pub struct MavenName {
    pub group: String,
    pub artifact: String,
    pub version: String,
    pub classifier: Option<String>,
    pub ext: String,
}

impl MavenName {
    pub fn parse(raw: &str) -> Option<Self> {
        let (base, ext) = match raw.split_once('@') {
            Some((b, e)) => (b, e.to_string()),
            None => (raw, "jar".to_string()),
        };
        let parts: Vec<&str> = base.split(':').collect();
        if parts.len() < 3 {
            return None;
        }
        Some(Self {
            group: parts[0].to_string(),
            artifact: parts[1].to_string(),
            version: parts[2].to_string(),
            classifier: parts.get(3).map(|s| s.to_string()),
            ext,
        })
    }

    pub fn path(&self) -> String {
        let mut file = format!("{}-{}", self.artifact, self.version);
        if let Some(c) = &self.classifier {
            file.push('-');
            file.push_str(c);
        }
        file.push('.');
        file.push_str(&self.ext);
        format!(
            "{}/{}/{}/{}",
            self.group.replace('.', "/"),
            self.artifact,
            self.version,
            file
        )
    }
}
