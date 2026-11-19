use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::auth;
use crate::mc::install::{self, Installer};
use crate::mc::launch;
use crate::mc::manifest;
use crate::mc::content;
use crate::mc::fabric;
use crate::mc::forge;
use crate::mc::modpack;
use crate::mc::options;
use crate::mc::mods;
use crate::mc::project;
use crate::mc::version::{self, VersionMeta};
use crate::mc::java;
use crate::state::{Account, AppState, Config, GameHandle, Profile, Settings, Stats};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVersion {
    pub id: String,
    pub kind: String,
    pub java: u32,
    pub size: u64,
    /// vanilla | fabric | …
    pub loader: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub accounts: Vec<Account>,
    pub active: Option<String>,
    pub local: Vec<LocalVersion>,
    pub game_dir: String,
    pub active_dir: String,
    pub data_dir: String,
    pub app_version: String,
    pub running: Option<String>,
    pub last_version: Option<String>,
    pub profiles: Vec<Profile>,
    pub active_profile: Option<String>,
    pub stats: Stats,
    pub platform: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteVersion {
    pub id: String,
    pub kind: String,
    pub release_time: String,
}

fn scan_local(root: &std::path::Path) -> Vec<LocalVersion> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(root.join("versions")) else { return out };
    for entry in entries.flatten() {
        let id = entry.file_name().to_string_lossy().to_string();
        let json = entry.path().join(format!("{id}.json"));
        let Ok(raw) = std::fs::read_to_string(&json) else { continue };
        let Ok(meta) = serde_json::from_str::<VersionMeta>(&raw) else { continue };
        out.push(LocalVersion {
            id: meta.id.clone(),
            kind: meta.kind().to_string(),
            java: meta.java_major(),
            size: install::installed_size(root, &meta.id),
            loader: loader_of(&meta.id, &meta),
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn loader_of(id: &str, meta: &VersionMeta) -> String {
    let lower = id.to_ascii_lowercase();
    if lower.contains("fabric") {
        "fabric".into()
    } else if lower.contains("quilt") {
        "quilt".into()
    } else if lower.contains("neoforge") {
        "neoforge".into()
    } else if lower.contains("forge") {
        "forge".into()
    } else if meta.inherits_from.is_some() {
        "loader".into()
    } else {
        "vanilla".into()
    }
}

#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> Result<Bootstrap, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    let running = state.game.lock().unwrap().as_ref().map(|g| g.version.clone());
    Ok(Bootstrap {
        settings: cfg.settings.clone(),
        accounts: cfg.accounts.clone(),
        active: cfg.active.clone(),
        local: scan_local(&root),
        game_dir: root.display().to_string(),
        active_dir: cfg.active_root().display().to_string(),
        data_dir: crate::paths::data_dir().display().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        running,
        last_version: cfg.last_version.clone(),
        profiles: cfg.profiles.clone(),
        active_profile: cfg.active_profile.clone(),
        stats: cfg.stats.clone(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub async fn remote_versions(
    state: State<'_, AppState>,
    refresh: bool,
) -> Result<Vec<RemoteVersion>, String> {
    let entries = manifest::get(&state.http, refresh)
        .await
        .map_err(|e| e.to_string())?;
    Ok(entries
        .into_iter()
        .map(|e| RemoteVersion {
            id: e.id,
            kind: if e.kind.is_empty() { "release".into() } else { e.kind },
            release_time: e.release_time,
        })
        .collect())
}

#[tauri::command]
pub fn system_report(refresh: bool) -> crate::system::Report {
    crate::system::report(refresh)
}

#[tauri::command]
pub async fn version_banners(
    state: State<'_, AppState>,
) -> Result<Vec<content::Banner>, String> {
    content::get(&state.http).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_search(
    state: State<'_, AppState>,
    query: String,
    kind: String,
    version: Option<String>,
    loader: Option<String>,
) -> Result<Vec<mods::Hit>, String> {
    mods::search(
        &state.http,
        &query,
        &kind,
        version.as_deref(),
        loader.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mods_install(
    app: AppHandle,
    state: State<'_, AppState>,
    project: String,
    version: String,
    loader: String,
    kind: Option<String>,
) -> Result<mods::InstallOutcome, String> {
    let cfg = state.snapshot();
    let root = cfg.active_root();
    let workers = cfg.settings.download_workers as usize;
    let folder = match kind.as_deref() {
        Some("resourcepack") => "resourcepacks",
        Some("shader") => "shaderpacks",
        _ => "mods",
    };
    let handle = app.clone();
    let progress = std::sync::Arc::new(move |done: usize, bytes: u64| {
        let _ = handle.emit(
            "mods://progress",
            serde_json::json!({ "done": done, "bytes": bytes }),
        );
    });
    let outcome = mods::install(
        &state.http, &root, &project, &version, &loader, workers, folder, progress,
    )
    .await
    .map_err(|e| e.to_string())?;

    if cfg.settings.strict_mods {
        let blocked: Vec<mods::InstalledMod> = mods::list(&root)
            .into_iter()
            .filter(|m| m.risk == "high" && outcome.installed.contains(&m.file))
            .collect();

        if !blocked.is_empty() {
            for m in &blocked {
                let _ = mods::remove(&root, &m.file);
            }
            let names: Vec<String> = blocked.iter().map(|m| m.name.clone()).collect();
            return Err(format!(
                "Строгий режим: моды с доступом к системе не установлены — {}. Отключите его в настройках, если доверяете источнику.",
                names.join(", ")
            ));
        }
    }

    Ok(outcome)
}

#[tauri::command]
pub async fn mods_repair(
    state: State<'_, AppState>,
    version: String,
    loader: String,
) -> Result<mods::InstallOutcome, String> {
    let cfg = state.snapshot();
    let root = cfg.active_root();
    let workers = cfg.settings.download_workers as usize;
    let progress = std::sync::Arc::new(|_: usize, _: u64| {});
    mods::repair(&state.http, &root, &version, &loader, workers, progress)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mods_health(state: State<'_, AppState>) -> mods::Health {
    mods::health(&state.snapshot().active_root())
}

#[tauri::command]
pub fn mods_list(state: State<'_, AppState>) -> Vec<mods::InstalledMod> {
    mods::list(&state.snapshot().active_root())
}

#[tauri::command]
pub fn mods_remove(state: State<'_, AppState>, file: String) -> Result<(), String> {
    mods::remove(&state.snapshot().active_root(), &file).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_version(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    if let Err(e) = crate::paths::ensure_dir(&root) {
        return Err(format!("Не удалось создать папку игры: {e}"));
    }
    let installer = Installer::new(app, &state.http, root, cfg.settings.clone(), id);
    installer.run().await.map(|_| ()).map_err(|e| e.to_string())
}

fn reader<R: std::io::Read + Send + 'static>(app: AppHandle, stream: R) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        use std::io::BufRead;
        let mut buffer = std::io::BufReader::new(stream);
        let mut line = String::new();
        loop {
            line.clear();
            match buffer.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    let text = line.trim_end_matches(['\r', '\n']).to_string();
                    let _ = app.emit("game://log", text);
                }
                Err(_) => break,
            }
        }
    })
}

#[tauri::command]
pub async fn launch(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();

    if state.game.lock().unwrap().is_some() {
        return Err("Игра уже запущена".into());
    }
    if !install::is_installed(&root, &id) {
        return Err("Версия не установлена. Сначала нажмите «Установить».".into());
    }

    let mut account = cfg
        .active_account()
        .cloned()
        .ok_or_else(|| "Сначала добавьте аккаунт".to_string())?;

    if account.kind == "microsoft" && account.is_expired() {
        let refreshed = auth::refresh(&state.http, &cfg.settings.ms_client_id, &account)
            .await
            .map_err(|e| e.to_string())?;
        let refreshed_clone = refreshed.clone();
        let _ = state.update(|c| {
            if let Some(slot) = c.accounts.iter_mut().find(|a| a.id == refreshed_clone.id) {
                *slot = refreshed_clone;
            }
        });
        account = refreshed;
    }

    let (meta, jar_version) = version::resolve(&root, &id).map_err(|e| e.to_string())?;
    let profile = cfg.active_profile().filter(|p| p.version_id == id);
    let game_dir = profile
        .map(|p| cfg.profile_root(p))
        .unwrap_or_else(|| root.clone());
    let _ = crate::paths::ensure_dir(&game_dir);

    let instance_options = profile.map(|p| p.options.clone()).unwrap_or_default();
    let _ = options::apply(&game_dir, &instance_options);

    let java_path = java::ensure(&app, &state.http, &root, &cfg.settings, meta.java_major())
        .await
        .map_err(|e| e.to_string())?;

    if instance_options.gpu.as_deref() == Some("high") {
        options::gpu_preference(&java_path, true);
    } else if instance_options.gpu.as_deref() == Some("default") {
        options::gpu_preference(&java_path, false);
    }

    let plan = launch::build(
        &root,
        &game_dir,
        &meta,
        &id,
        &jar_version,
        &account,
        &cfg.settings,
        &java_path,
    )
    .map_err(|e| e.to_string())?;

    let mut command = std::process::Command::new(&plan.java);
    command
        .args(&plan.args)
        .current_dir(&plan.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Не удалось запустить Java: {e}"))?;
    let pid = child.id();

    let out = child.stdout.take().map(|s| reader(app.clone(), s));
    let err = child.stderr.take().map(|s| reader(app.clone(), s));

    *state.game.lock().unwrap() = Some(GameHandle { version: id.clone(), pid });
    *state.play_started.lock().unwrap() = Some((id.clone(), std::time::Instant::now()));
    let _ = state.update(|c| {
        c.last_version = Some(id.clone());
        c.stats.launches += 1;
    });

    let _ = app.emit("game://started", id.clone());

    let app_exit = app.clone();
    let version = id.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        if let Some(handle) = out {
            let _ = handle.join();
        }
        if let Some(handle) = err {
            let _ = handle.join();
        }
        let code = status.ok().and_then(|s| s.code()).unwrap_or(-1);
        let state = app_exit.state::<AppState>();
        let mut guard = state.game.lock().unwrap();
        if guard.as_ref().map(|g| g.pid) == Some(pid) {
            *guard = None;
        }
        drop(guard);
        let secs = state
            .play_started
            .lock()
            .unwrap()
            .take()
            .filter(|(v, _)| v == &version)
            .map(|(_, at)| at.elapsed().as_secs())
            .unwrap_or(0);
        let _ = state.update(|c| c.stats.add_session(&version, secs.max(1)));
        let _ = app_exit.emit("game://exit", serde_json::json!({ "code": code, "version": version }));
    });

    Ok(())
}

#[tauri::command]
pub fn stop_game(state: State<'_, AppState>) -> Result<(), String> {
    let pid = state.game.lock().unwrap().as_ref().map(|g| g.pid);
    let Some(pid) = pid else { return Ok(()) };
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
        let _ = cmd.status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill").arg(pid.to_string()).status();
    }
    Ok(())
}

#[tauri::command]
pub fn add_offline_account(state: State<'_, AppState>, name: String) -> Result<Config, String> {
    let name = name.trim().to_string();
    if name.len() < 3 || name.len() > 16 {
        return Err("Ник должен быть от 3 до 16 символов".into());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Разрешены только латинские буквы, цифры и _".into());
    }
    let account = Account {
        id: auth::offline_uuid(&name),
        kind: "offline".into(),
        name,
        access_token: None,
        refresh_token: None,
        expires_at: 0,
    };
    state
        .update(|cfg| {
            cfg.accounts.retain(|a| a.id != account.id);
            cfg.accounts.push(account.clone());
            cfg.active = Some(account.id.clone());
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, id: String) -> Result<Config, String> {
    state
        .update(|cfg| {
            cfg.accounts.retain(|a| a.id != id);
            if cfg.active.as_deref() == Some(id.as_str()) {
                cfg.active = cfg.accounts.first().map(|a| a.id.clone());
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_account(state: State<'_, AppState>, id: String) -> Result<Config, String> {
    state
        .update(|cfg| cfg.active = Some(id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, mut settings: Settings) -> Result<Config, String> {
    settings.memory_mb = settings.memory_mb.clamp(512, 65536);
    settings.width = settings.width.clamp(640, 7680);
    settings.height = settings.height.clamp(480, 4320);
    settings.download_workers = settings.download_workers.clamp(1, 32);
    settings.ui_scale = settings.ui_scale.clamp(80, 140);
    settings.ui_glass = settings.ui_glass.min(100);
    settings.ui_wallpaper_blur = settings.ui_wallpaper_blur.min(40);
    settings.ui_wallpaper_dim = settings.ui_wallpaper_dim.min(90);
    state
        .update(|cfg| cfg.settings = settings)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ms_login(app: AppHandle, state: State<'_, AppState>) -> Result<auth::DeviceFlow, String> {
    let client_id = state.settings().ms_client_id;
    let (flow, device_code) = auth::start(&state.http, &client_id)
        .await
        .map_err(|e| e.to_string())?;

    state.ms_cancel.store(false, Ordering::SeqCst);
    let app_done = app.clone();
    let http = state.http.clone();
    let cancel = state.ms_cancel.clone();
    let interval = flow.interval;

    tauri::async_runtime::spawn(async move {
        match auth::poll(&http, &client_id, &device_code, interval, &cancel).await {
            Ok(account) => {
                let state = app_done.state::<AppState>();
                let stored = account.clone();
                let _ = state.update(|cfg| {
                    cfg.accounts.retain(|a| a.id != stored.id);
                    cfg.accounts.push(stored.clone());
                    cfg.active = Some(stored.id.clone());
                });
                let _ = app_done.emit("auth://done", account);
            }
            Err(error) => {
                let _ = app_done.emit("auth://error", error.to_string());
            }
        }
    });

    Ok(flow)
}

#[tauri::command]
pub fn ms_cancel(state: State<'_, AppState>) -> Result<(), String> {
    state.ms_cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn delete_version(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    let version_dir = root.join("versions").join(&id);
    let natives_dir = root.join("natives").join(&id);
    if version_dir.exists() {
        std::fs::remove_dir_all(&version_dir).map_err(|e| format!("Не удалось удалить: {e}"))?;
    }
    if natives_dir.exists() {
        let _ = std::fs::remove_dir_all(&natives_dir);
    }
    let _ = state.update(|cfg| {
        if cfg.last_version.as_deref() == Some(id.as_str()) {
            cfg.last_version = None;
        }
        cfg.profiles.retain(|p| p.version_id != id);
        if cfg
            .active_profile
            .as_ref()
            .map(|active| cfg.profiles.iter().all(|p| &p.id != active))
            .unwrap_or(false)
        {
            cfg.active_profile = None;
        }
    });
    Ok(())
}

#[tauri::command]
pub fn open_dir(app: AppHandle, state: State<'_, AppState>, kind: String) -> Result<(), String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    let path: PathBuf = match kind.as_str() {
        "game" => cfg.active_root(),
        "mods" => {
            let dir = cfg.active_root().join("mods");
            let _ = crate::paths::ensure_dir(&dir);
            dir
        }
        "profiles" => {
            let dir = root.join("profiles");
            let _ = crate::paths::ensure_dir(&dir);
            dir
        }
        "logs" => {
            let dir = cfg.active_root().join("logs");
            let _ = crate::paths::ensure_dir(&dir);
            dir
        }
        "versions" => {
            let dir = root.join("versions");
            let _ = crate::paths::ensure_dir(&dir);
            dir
        }
        _ => {
            let dir = crate::paths::data_dir();
            let _ = crate::paths::ensure_dir(&dir);
            dir
        }
    };
    app.opener()
        .open_path(path.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_profile(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<(), String> {
    let cfg = state.snapshot();
    let profile = cfg.profile(&id).ok_or("profile_not_found")?;
    let dir = cfg.profile_root(profile);
    let _ = crate::paths::ensure_dir(&dir);
    app.opener()
        .open_path(dir.display().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_wallpaper(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.display().to_string())
}

#[tauri::command]
pub async fn pick_java(app: AppHandle) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_file(move |path| {
            let _ = tx.send(path);
        });
    rx.await
        .ok()
        .flatten()
        .and_then(|p| p.into_path().ok())
        .map(|p| p.display().to_string())
}

#[tauri::command]
pub fn check_java(path: String) -> Option<u32> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return None;
    }
    java::probe(&path)
}

#[tauri::command]
pub async fn fabric_install(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    loader: Option<String>,
) -> Result<String, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    crate::paths::ensure_dir(&root).map_err(|e| e.to_string())?;
    fabric::install(&app, &state.http, &root, &id, loader.as_deref(), &cfg.settings)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn loader_install(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    loader: String,
    version: Option<String>,
) -> Result<String, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    crate::paths::ensure_dir(&root).map_err(|e| e.to_string())?;
    match loader.trim().to_lowercase().as_str() {
        "forge" => {
            forge::install(&app, &state.http, &root, &id, forge::Flavor::Forge, version.as_deref(), &cfg.settings)
                .await
                .map_err(|e| e.to_string())
        }
        "neoforge" => {
            forge::install(&app, &state.http, &root, &id, forge::Flavor::NeoForge, version.as_deref(), &cfg.settings)
                .await
                .map_err(|e| e.to_string())
        }
        "fabric" | "" => fabric::install(&app, &state.http, &root, &id, version.as_deref(), &cfg.settings)
            .await
            .map_err(|e| e.to_string()),
        other => Err(format!("loader_unknown:{other}")),
    }
}

#[tauri::command]
pub async fn modpack_search(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<mods::Hit>, String> {
    modpack::search(&state.http, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modrinth_project(
    state: State<'_, AppState>,
    project: String,
) -> Result<project::ProjectDetail, String> {
    project::fetch(&state.http, &project)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modpack_contents(
    state: State<'_, AppState>,
    project: String,
) -> Result<Vec<modpack::PackContent>, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    crate::paths::ensure_dir(&root).map_err(|e| e.to_string())?;
    modpack::contents(&state.http, &root, &project)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modpack_install(
    app: AppHandle,
    state: State<'_, AppState>,
    project: String,
    version: Option<String>,
) -> Result<Config, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    crate::paths::ensure_dir(&root).map_err(|e| e.to_string())?;
    let profile = modpack::install(
        &app,
        &state.http,
        &root,
        &project,
        version.as_deref(),
        &cfg.settings,
    )
    .await
    .map_err(|e| e.to_string())?;

    state
        .update(|c| {
            c.profiles.retain(|p| p.id != profile.id);
            c.active_profile = Some(profile.id.clone());
            c.profiles.push(profile);
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profiles_list(state: State<'_, AppState>) -> Vec<Profile> {
    state.snapshot().profiles
}

#[tauri::command]
pub fn profile_activate(state: State<'_, AppState>, id: String) -> Result<Config, String> {
    let next = if id.trim().is_empty() { None } else { Some(id) };
    state
        .update(|c| c.active_profile = next)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profile_create(
    state: State<'_, AppState>,
    name: String,
    version_id: String,
) -> Result<Config, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("profile_name_empty".into());
    }
    let cfg = state.snapshot();
    if !install::is_installed(&cfg.game_root(), &version_id) {
        return Err("version_not_installed".into());
    }
    let stamp = crate::state::now_secs();
    let id = format!("instance-{stamp}");
    let dir = format!("profiles/{id}");
    crate::paths::ensure_dir(&cfg.game_root().join(&dir)).map_err(|e| e.to_string())?;
    let lower = version_id.to_ascii_lowercase();
    let loader = if lower.contains("neoforge") {
        "neoforge"
    } else if lower.contains("forge") {
        "forge"
    } else if lower.contains("fabric") {
        "fabric"
    } else {
        "vanilla"
    };
    state
        .update(|c| {
            c.active_profile = Some(id.clone());
            c.profiles.push(Profile {
                id,
                name,
                version_id,
                loader: loader.into(),
                dir,
                icon: None,
                created_at: stamp,
                options: crate::state::InstanceOptions::default(),
            });
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profile_options(
    state: State<'_, AppState>,
    id: String,
) -> Result<crate::state::InstanceOptions, String> {
    let cfg = state.snapshot();
    cfg.profile(&id)
        .map(|p| p.options.clone())
        .ok_or_else(|| "profile_not_found".to_string())
}

#[tauri::command]
pub fn profile_set_options(
    state: State<'_, AppState>,
    id: String,
    options: crate::state::InstanceOptions,
) -> Result<Config, String> {
    let cfg = state.snapshot();
    if cfg.profile(&id).is_none() {
        return Err("profile_not_found".into());
    }
    state
        .update(|c| {
            if let Some(profile) = c.profiles.iter_mut().find(|p| p.id == id) {
                profile.options = options.clone();
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn profile_remove(
    state: State<'_, AppState>,
    id: String,
    delete_files: bool,
) -> Result<Config, String> {
    let cfg = state.snapshot();
    if delete_files {
        if let Some(profile) = cfg.profile(&id) {
            let dir = cfg.profile_root(profile);
            // Удаляем только внутри папки профилей, чтобы не задеть пользовательские данные.
            if dir.starts_with(cfg.game_root().join("profiles")) {
                let _ = std::fs::remove_dir_all(&dir);
            }
        }
    }
    state
        .update(|c| {
            c.profiles.retain(|p| p.id != id);
            if c.active_profile.as_deref() == Some(id.as_str()) {
                c.active_profile = None;
            }
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stats_reset(state: State<'_, AppState>) -> Result<Config, String> {
    state
        .update(|c| c.stats = Stats::default())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_update(state: State<'_, AppState>) -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let beta = current.starts_with("0.");
    let endpoint = if beta {
        "https://api.github.com/repos/227375488489/aqua-launcher/releases?per_page=30"
    } else {
        "https://api.github.com/repos/227375488489/aqua-launcher/releases/latest"
    };
    let res = state
        .http
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("update_network:{e}"))?;
    if !res.status().is_success() {
        return Err(format!("update_http:{}", res.status().as_u16()));
    }
    let value: serde_json::Value = res.json().await.map_err(|e| format!("update_parse:{e}"))?;
    let chosen = if beta {
        value.as_array().and_then(|list| {
            list.iter().find(|item| {
                let tag = item["tag_name"].as_str().unwrap_or_default();
                let draft = item["draft"].as_bool().unwrap_or(false);
                !draft && tag.trim_start_matches(['v', 'V']).starts_with("0.")
            })
        })
    } else {
        Some(&value)
    };
    let Some(release) = chosen else {
        return Ok(UpdateInfo {
            latest: current.clone(),
            current,
            url: String::new(),
            notes: String::new(),
            published: None,
            available: false,
            asset: String::new(),
            asset_name: String::new(),
        });
    };
    let latest = release["tag_name"]
        .as_str()
        .unwrap_or_default()
        .trim_start_matches(['v', 'V'])
        .to_string();
    let url = release["html_url"].as_str().unwrap_or_default().to_string();
    let notes = release["body"].as_str().unwrap_or_default().to_string();
    let published = release["published_at"].as_str().map(str::to_string);
    let available = version_greater(&latest, &current);
    let (asset, asset_name) = pick_asset(release).unwrap_or_default();
    Ok(UpdateInfo { current, latest, url, notes, published, available, asset, asset_name })
}

fn pick_asset(release: &serde_json::Value) -> Option<(String, String)> {
    let os = std::env::consts::OS;
    let assets = release["assets"].as_array()?;
    let mut best: Option<(i32, String, String)> = None;
    for item in assets {
        let name = item["name"].as_str().unwrap_or_default();
        let lower = name.to_lowercase();
        let score = match os {
            "windows" => {
                if lower.ends_with(".exe") { 100 } else if lower.ends_with(".msi") { 80 } else { -1 }
            }
            "macos" => {
                if lower.ends_with(".dmg") { 100 } else if lower.ends_with(".app.tar.gz") { 70 } else { -1 }
            }
            _ => {
                if lower.ends_with(".appimage") { 100 } else if lower.ends_with(".deb") { 60 } else if lower.ends_with(".rpm") { 50 } else { -1 }
            }
        };
        if score < 0 { continue; }
        let url = item["browser_download_url"].as_str().unwrap_or_default().to_string();
        if !url.starts_with("https://") { continue; }
        if best.as_ref().map(|(s, _, _)| score > *s).unwrap_or(true) {
            best = Some((score, url, name.to_string()));
        }
    }
    best.map(|(_, url, name)| (url, name))
}

#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    filename: String,
) -> Result<String, String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;
    if !url.starts_with("https://github.com/") {
        return Err("update_bad_url".into());
    }
    let safe = filename
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("aqua-update.bin");
    let dir = crate::paths::data_dir().join("updates");
    crate::paths::ensure_dir(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(safe);
    let response = state
        .http
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("update_network:{e}"))?
        .error_for_status()
        .map_err(|e| format!("update_http:{e}"))?;
    let total = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&dest).await.map_err(|e| e.to_string())?;
    let mut done: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("update_network:{e}"))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        let _ = app.emit(
            "update://progress",
            serde_json::json!({ "bytes": done, "total": total }),
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok(dest.display().to_string())
}

#[tauri::command]
pub async fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    let file = PathBuf::from(&path);
    if !file.exists() {
        return Err("update_missing".into());
    }
    let name = file
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    #[cfg(target_os = "windows")]
    {
        if name.ends_with(".exe") {
            std::process::Command::new(&file)
                .arg("/S")
                .spawn()
                .map_err(|e| e.to_string())?;
        } else if name.ends_with(".msi") {
            std::process::Command::new("msiexec")
                .arg("/i")
                .arg(&file)
                .arg("/qb")
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(900)).await;
        app.exit(0);
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        if name.ends_with(".appimage") {
            let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755));
            std::process::Command::new(&file).spawn().map_err(|e| e.to_string())?;
            app.exit(0);
            return Ok(());
        }
    }
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub url: String,
    pub notes: String,
    pub published: Option<String>,
    pub available: bool,
    pub asset: String,
    pub asset_name: String,
}

fn version_greater(a: &str, b: &str) -> bool {
    let parse = |value: &str| -> Vec<u32> {
        value
            .split(|c: char| !c.is_ascii_digit())
            .filter(|part| !part.is_empty())
            .map(|part| part.parse::<u32>().unwrap_or(0))
            .collect()
    };
    let left = parse(a);
    let right = parse(b);
    for index in 0..left.len().max(right.len()) {
        let x = left.get(index).copied().unwrap_or(0);
        let y = right.get(index).copied().unwrap_or(0);
        if x != y {
            return x > y;
        }
    }
    false
}

#[tauri::command]
pub fn win_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn win_toggle_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        window.unmaximize()
    } else {
        window.maximize()
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn win_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
