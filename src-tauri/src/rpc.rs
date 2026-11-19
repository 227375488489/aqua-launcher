use std::thread;
use std::time::Duration;

use discord_rich_presence::{activity::Activity, DiscordIpc, DiscordIpcClient};
use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Держит соединение с Discord и обновляет активность лаунчера.
pub fn spawn(app: AppHandle) {
    thread::spawn(move || {
        let mut client: Option<(String, DiscordIpcClient)> = None;
        loop {
            let state = app.state::<AppState>();
            let cfg = state.snapshot();
            let id = cfg.settings.discord_client_id.trim().to_string();

            if !cfg.settings.discord_rpc || id.is_empty() {
                if let Some((_, mut old)) = client.take() {
                    let _ = old.close();
                }
                thread::sleep(Duration::from_secs(20));
                continue;
            }

            let changed = client.as_ref().map(|(current, _)| current != &id).unwrap_or(true);
            if changed {
                client = None;
                if let Ok(mut next) = DiscordIpcClient::new(&id) {
                    if next.connect().is_ok() {
                        client = Some((id.clone(), next));
                    }
                }
            }

            if let Some((_, ipc)) = client.as_mut() {
                let running = state
                    .game
                    .lock()
                    .ok()
                    .and_then(|game| game.as_ref().map(|handle| handle.version.clone()));
                let details = match running.as_deref() {
                    Some(version) => format!("Играет в Minecraft {version}"),
                    None => "В лаунчере".to_string(),
                };
                let activity = Activity::new()
                    .details(details.as_str())
                    .state(concat!("Aqua Launcher ", env!("CARGO_PKG_VERSION")));
                let _ = ipc.set_activity(activity);
            }

            thread::sleep(Duration::from_secs(20));
        }
    });
}
