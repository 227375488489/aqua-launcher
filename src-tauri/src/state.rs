use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Instant;

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
    // --- оформление ---
    pub ui_theme: String,
    pub ui_accent: String,
    /// Пользовательский цвет акцента (#rrggbb), если ui_accent == "custom".
    pub ui_accent_custom: String,
    pub ui_radius: String,
    pub ui_density: String,
    pub ui_font: String,
    pub ui_scale: u32,
    pub ui_wallpaper: String,
    pub ui_wallpaper_path: Option<String>,
    pub ui_wallpaper_blur: u32,
    pub ui_wallpaper_dim: u32,
    pub ui_sidebar: String,
    pub ui_sidebar_mode: String,
    pub ui_motion: bool,
    pub language: String,
    // --- раскладка и фон ---
    /// JSON: порядок и видимость навигации.
    pub ui_nav: String,
    /// JSON: порядок и видимость виджетов главного экрана.
    pub ui_layout: String,
    /// ocean | aurora | nebula | plain | custom
    pub ui_background: String,
    /// Свой цвет фона для ui_background == "custom".
    pub ui_bg_custom: String,
    pub ui_grain: bool,
    /// 0..100, непрозрачность стеклянных панелей.
    pub ui_glass: u32,
    /// left | center | right
    pub ui_play_position: String,
    /// Показывать снапшоты в списках версий.
    pub show_snapshots: bool,
    /// Показывать alpha/beta и старые релизы.
    pub show_old: bool,
    /// Разрешить экспериментальные версии (снапшоты, беты, альфы).
    pub allow_experimental: bool,
    /// Скачивать обновления лаунчера автоматически.
    pub auto_update: bool,
    /// Показывать активность лаунчера в Discord.
    pub discord_rpc: bool,
    /// ID приложения Discord для Rich Presence.
    pub discord_client_id: String,
    // --- безопасность ---
    pub strict_mods: bool,
    /// Базовые игровые настройки, наследуемые новыми сборками.
    pub game_defaults: InstanceOptions,
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
            ui_theme: "dark".into(),
            ui_accent: "aqua".into(),
            ui_accent_custom: "#5ce8dc".into(),
            ui_radius: "soft".into(),
            ui_density: "normal".into(),
            ui_font: "manrope".into(),
            ui_scale: 100,
            ui_wallpaper: "deep".into(),
            ui_wallpaper_path: None,
            ui_wallpaper_blur: 18,
            ui_wallpaper_dim: 45,
            ui_sidebar: "left".into(),
            ui_sidebar_mode: "full".into(),
            ui_motion: true,
            language: "auto".into(),
            ui_nav: String::new(),
            ui_layout: String::new(),
            ui_background: "ocean".into(),
            ui_bg_custom: "#071420".into(),
            ui_grain: true,
            ui_glass: 62,
            ui_play_position: "left".into(),
            show_snapshots: true,
            show_old: true,
            allow_experimental: false,
            auto_update: true,
            discord_rpc: false,
            discord_client_id: String::new(),
            strict_mods: true,
            game_defaults: InstanceOptions::default(),
        }
    }
}

/// Базовые настройки Minecraft для конкретного инстанса.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct InstanceOptions {
    pub language: Option<String>,
    pub max_fps: Option<u32>,
    pub vsync: Option<bool>,
    pub gui_scale: Option<u32>,
    pub render_distance: Option<u32>,
    /// fast | fancy | fabulous
    pub graphics: Option<String>,
    /// all | decreased | minimal
    pub particles: Option<String>,
    pub music: Option<bool>,
    pub sound: Option<bool>,
    pub fullscreen: Option<bool>,
    /// Windows: high | default
    pub gpu: Option<String>,
}

impl InstanceOptions {
    /// Overlay this instance's explicit choices on top of the global defaults.
    pub fn with_defaults(&self, base: &Self) -> Self {
        Self {
            language: self.language.clone().or_else(|| base.language.clone()),
            max_fps: self.max_fps.or(base.max_fps),
            vsync: self.vsync.or(base.vsync),
            gui_scale: self.gui_scale.or(base.gui_scale),
            render_distance: self.render_distance.or(base.render_distance),
            graphics: self.graphics.clone().or_else(|| base.graphics.clone()),
            particles: self.particles.clone().or_else(|| base.particles.clone()),
            music: self.music.or(base.music),
            sound: self.sound.or(base.sound),
            fullscreen: self.fullscreen.or(base.fullscreen),
            gpu: self.gpu.clone().or_else(|| base.gpu.clone()),
        }
    }
}

/// Изолированная сборка: своя папка игры, свои моды и миры.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    /// Идентификатор установленной версии (включая fabric-loader-…).
    pub version_id: String,
    /// vanilla | fabric | quilt | forge | neoforge | modpack
    pub loader: String,
    /// Выбранная версия загрузчика (может быть ещё не установлена).
    #[serde(default)]
    pub loader_version: Option<String>,
    /// Путь относительно корня игры, например `profiles/my-pack`.
    pub dir: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub options: InstanceOptions,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Stats {
    /// Секунды игры по идентификатору версии.
    pub playtime_secs: HashMap<String, u64>,
    pub launches: u32,
    pub sessions: u32,
    pub last_played: i64,
}

impl Stats {
    pub fn add_session(&mut self, version: &str, secs: u64) {
        *self.playtime_secs.entry(version.to_string()).or_default() += secs;
        self.sessions += 1;
        self.last_played = now_secs();
    }

    pub fn total_secs(&self) -> u64 {
        self.playtime_secs.values().sum()
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
    pub profiles: Vec<Profile>,
    pub active_profile: Option<String>,
    pub stats: Stats,
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

    pub fn profile(&self, id: &str) -> Option<&Profile> {
        self.profiles.iter().find(|p| p.id == id)
    }

    pub fn active_profile(&self) -> Option<&Profile> {
        let id = self.active_profile.as_ref()?;
        self.profiles.iter().find(|p| &p.id == id)
    }

    pub fn profile_root(&self, profile: &Profile) -> PathBuf {
        let dir = Path::new(&profile.dir);
        if dir.is_absolute() {
            dir.to_path_buf()
        } else {
            self.game_root().join(dir)
        }
    }

    /// Папка активной сборки — сюда ставятся моды и отсюда запускается игра.
    pub fn active_root(&self) -> PathBuf {
        match self.active_profile() {
            Some(profile) => self.profile_root(profile),
            None => self.game_root(),
        }
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
    /// Старт текущей игровой сессии для подсчёта статистики.
    pub play_started: Mutex<Option<(String, Instant)>>,
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
            play_started: Mutex::new(None),
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
