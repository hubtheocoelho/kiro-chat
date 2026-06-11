#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod deps;
mod kiro;
mod path_env;
mod proc;
mod pty;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            kiro::locate_kiro,
            kiro::check_auth,
            kiro::install_kiro,
            deps::check_system,
            config::get_config,
            config::set_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kiro Chat");
}
