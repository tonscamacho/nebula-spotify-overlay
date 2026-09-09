mod auth;
mod lyrics;
mod spotify;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .manage(auth::AuthState::default())
        .setup(|app| {
            auth::restore_session(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::auth_status,
            auth::start_login,
            auth::logout,
            spotify::get_player,
            spotify::get_devices,
            spotify::get_queue,
            spotify::play,
            spotify::pause,
            spotify::next_track,
            spotify::prev_track,
            spotify::seek,
            spotify::set_volume,
            spotify::set_shuffle,
            spotify::set_repeat,
            spotify::transfer_playback,
            spotify::add_to_queue,
            lyrics::get_lyrics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
