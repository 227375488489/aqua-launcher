use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use crate::paths;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Override for the game directory. Empty means `<data>/minecraft`.
    pub game_dir: Option<String>,
    pub memory_mb: u32,
    pub java_path: Option<String>,
    pub auto_java: bool,
    pub jvm_args: String,
    pub optimized_flags: bool,
    pub close_on_launch: bool,
    pub download_workers: u32,
    pub custom_resolution: bool,
    pub width: u32,
    pub height: u32,
    pub fullscreen: bool,
    pub ms_client_id: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            game_dir: None,
            memory_mb: 4096,
            java_path: None,
            auto_java: true,
            jvm_args: String::new(),
            optimized_flags: true,
            close_on_launch: false,
            download_workers: 16,
            custom_resolution: true,
            width: 925,
            height: 530,
            fullscreen: false,
            ms_client_id: "00000000402b5328".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    /// "offline" | "microsoft"
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_at: i64,
}

impl Account {
    pub fn is_expired(&self) -> bool {
        self.kind == "microsoft" && self.expires_at > 0 && self.expires_at - 120 < now_secs()
    }
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Config {
    pub settings: Settings,
    pub accounts: Vec<Account>,
    pub active: Option<String>,
    pub last_version: Option<String>,
}

impl Config {
    pub fn path() -> PathBuf {
        paths::data_dir().join("config.json")
    }

    pub fn load() -> Self {
        match std::fs::read_to_string(Self::path()) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self) -> std::io::Result<()> {
        paths::ensure_dir(&paths::data_dir())?;
        let raw = serde_json::to_string_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        let tmp = Self::path().with_extension("json.tmp");
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, Self::path())
    }

    pub fn game_root(&self) -> PathBuf {
        match self.settings.game_dir.as_ref().filter(|s| !s.trim().is_empty()) {
            Some(dir) => PathBuf::from(dir),
            None => paths::data_dir().join("minecraft"),
        }
    }

    pub fn active_account(&self) -> Option<&Account> {
        let id = self.active.as_ref()?;
        self.accounts.iter().find(|a| &a.id == id)
    }
}

pub struct GameHandle {
    pub version: String,
    pub pid: u32,
}

pub struct AppState {
    pub cfg: Mutex<Config>,
    pub http: reqwest::Client,
    pub game: Mutex<Option<GameHandle>>,
    pub ms_cancel: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("AquaLauncher/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(std::time::Duration::from_secs(15))
            .pool_max_idle_per_host(16)
            .build()
            .expect("http client");
        Self {
            cfg: Mutex::new(Config::load()),
            http,
            game: Mutex::new(None),
            ms_cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn settings(&self) -> Settings {
        self.cfg.lock().unwrap().settings.clone()
    }

    pub fn snapshot(&self) -> Config {
        self.cfg.lock().unwrap().clone()
    }

    pub fn update<F: FnOnce(&mut Config)>(&self, f: F) -> std::io::Result<Config> {
        let mut guard = self.cfg.lock().unwrap();
        f(&mut guard);
        guard.save()?;
        Ok(guard.clone())
    }
}
