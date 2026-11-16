use serde::Serialize;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::auth;
use crate::mc::install::{self, Installer};
use crate::mc::launch;
use crate::mc::manifest;
use crate::mc::content;
use crate::mc::mods;
use crate::mc::version::VersionMeta;
use crate::mc::java;
use crate::state::{Account, AppState, Config, GameHandle, Settings};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVersion {
    pub id: String,
    pub kind: String,
    pub java: u32,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub accounts: Vec<Account>,
    pub active: Option<String>,
    pub local: Vec<LocalVersion>,
    pub game_dir: String,
    pub data_dir: String,
    pub app_version: String,
    pub running: Option<String>,
    pub last_version: Option<String>,
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
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
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
        data_dir: crate::paths::data_dir().display().to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        running,
        last_version: cfg.last_version.clone(),
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
) -> Result<mods::InstallOutcome, String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    let workers = cfg.settings.download_workers as usize;
    let handle = app.clone();
    let progress = std::sync::Arc::new(move |done: usize, bytes: u64| {
        let _ = handle.emit(
            "mods://progress",
            serde_json::json!({ "done": done, "bytes": bytes }),
        );
    });
    let outcome = mods::install(&state.http, &root, &project, &version, &loader, workers, progress)
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
    let root = cfg.game_root();
    let workers = cfg.settings.download_workers as usize;
    let progress = std::sync::Arc::new(|_: usize, _: u64| {});
    mods::repair(&state.http, &root, &version, &loader, workers, progress)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mods_health(state: State<'_, AppState>) -> mods::Health {
    mods::health(&state.snapshot().game_root())
}

#[tauri::command]
pub fn mods_list(state: State<'_, AppState>) -> Vec<mods::InstalledMod> {
    mods::list(&state.snapshot().game_root())
}

#[tauri::command]
pub fn mods_remove(state: State<'_, AppState>, file: String) -> Result<(), String> {
    mods::remove(&state.snapshot().game_root(), &file).map_err(|e| e.to_string())
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

fn read_meta(root: &std::path::Path, id: &str) -> Result<VersionMeta, String> {
    let path = root.join("versions").join(id).join(format!("{id}.json"));
    let raw = std::fs::read_to_string(&path)
        .map_err(|_| format!("Версия {id} не установлена"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Повреждён манифест версии: {e}"))
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

    let meta = read_meta(&root, &id)?;
    let java_path = java::ensure(&app, &state.http, &root, &cfg.settings, meta.java_major())
        .await
        .map_err(|e| e.to_string())?;

    let plan = launch::build(&root, &meta, &id, &account, &cfg.settings, &java_path)
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
    let _ = state.update(|c| c.last_version = Some(id.clone()));

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
    });
    Ok(())
}

#[tauri::command]
pub fn open_dir(app: AppHandle, state: State<'_, AppState>, kind: String) -> Result<(), String> {
    let cfg = state.snapshot();
    let root = cfg.game_root();
    let path: PathBuf = match kind.as_str() {
        "game" => root.clone(),
        "logs" => {
            let dir = root.join("logs");
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
pub fn check_java(path: String) -> Option<u32> {
    let path = PathBuf::from(path);
    if !path.exists() {
        return None;
    }
    java::probe(&path)
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
