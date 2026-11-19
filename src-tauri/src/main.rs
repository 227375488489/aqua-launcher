#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod mc;
mod net;
mod paths;
mod rpc;
mod state;
mod system;

use state::AppState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            rpc::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::remote_versions,
            commands::version_banners,
            commands::system_report,
            commands::modrinth_search,
            commands::curse_search,
            commands::catalog_search,
            commands::mods_install,
            commands::mods_repair,
            commands::mods_health,
            commands::mods_list,
            commands::mods_remove,
            commands::fabric_install,
            commands::loader_install,
            commands::modpack_search,
            commands::modpack_install,
            commands::modrinth_project,
            commands::curse_project,
            commands::modpack_contents,
            commands::profiles_list,
            commands::profile_activate,
            commands::profile_create,
            commands::profile_options,
            commands::profile_contents,
            commands::profile_file_remove,
            commands::profile_set_options,
            commands::game_defaults,
            commands::set_game_defaults,
            commands::profile_remove,
            commands::stats_reset,
            commands::check_update,
            commands::download_update,
            commands::install_update,
            commands::install_version,
            commands::launch,
            commands::stop_game,
            commands::add_offline_account,
            commands::remove_account,
            commands::set_account,
            commands::save_settings,
            commands::reset_settings,
            commands::ms_login,
            commands::ms_cancel,
            commands::delete_version,
            commands::open_dir,
            commands::open_profile,
            commands::pick_wallpaper,
            commands::pick_folder,
            commands::profile_import,
            commands::pick_java,
            commands::check_java,
            commands::java_install_graalvm,
            commands::win_minimize,
            commands::win_toggle_maximize,
            commands::win_close,
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить Aqua Launcher");
}
