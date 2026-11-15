#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod mc;
mod net;
mod paths;
mod state;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::remote_versions,
            commands::version_banners,
            commands::install_version,
            commands::launch,
            commands::stop_game,
            commands::add_offline_account,
            commands::remove_account,
            commands::set_account,
            commands::save_settings,
            commands::ms_login,
            commands::ms_cancel,
            commands::delete_version,
            commands::open_dir,
            commands::check_java,
            commands::win_minimize,
            commands::win_toggle_maximize,
            commands::win_close,
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить Aqua Launcher");
}
