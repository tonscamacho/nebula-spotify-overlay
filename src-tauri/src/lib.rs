mod auth;
mod lyrics;
mod spotify;
mod system;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

fn toggle_visible(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        match win.is_visible() {
            Ok(true) => {
                let _ = win.hide();
            }
            _ => {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
    }
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "show-hide", "Show / Hide", true, None::<&str>)?;
    let edit = MenuItem::with_id(app, "toggle-edit", "Toggle edit lock", true, None::<&str>)?;
    let preset = MenuItem::with_id(app, "cycle-preset", "Cycle preset", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "open-settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &edit, &preset, &settings, &quit])?;

    let icon = match app.default_window_icon().cloned() {
        Some(i) => i,
        None => {
            eprintln!("tray init skipped: no default window icon");
            return Ok(());
        }
    };

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Snapify - Spotify Overlay")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show-hide" => toggle_visible(app),
            "toggle-edit" => {
                let _ = app.emit("tray-toggle-edit", ());
            }
            "cycle-preset" => {
                let _ = app.emit("tray-cycle-preset", ());
            }
            "open-settings" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                let _ = app.emit("tray-open-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_visible(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn register_shortcuts(app: &tauri::AppHandle) {
    let defs = [
        (Modifiers::CONTROL | Modifiers::ALT, Code::KeyP, "shortcut-playpause"),
        (Modifiers::CONTROL | Modifiers::ALT, Code::KeyN, "shortcut-next"),
        (Modifiers::SHIFT, Code::Tab, "shortcut-visibility"),
        (Modifiers::CONTROL | Modifiers::ALT, Code::KeyE, "shortcut-edit"),
    ];
    for (mods, code, event) in defs {
        let shortcut = Shortcut::new(Some(mods), code);
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {}
            Err(e) => eprintln!("global shortcut {event} not registered: {e}"),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let playpause =
                        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyP);
                    let next = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN);
                    let vis = Shortcut::new(Some(Modifiers::SHIFT), Code::Tab);
                    let edit = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyE);
                    if shortcut == &playpause {
                        let _ = app.emit("shortcut-playpause", ());
                    } else if shortcut == &next {
                        let _ = app.emit("shortcut-next", ());
                    } else if shortcut == &vis {
                        toggle_visible(app);
                    } else if shortcut == &edit {
                        let _ = app.emit("shortcut-edit", ());
                    }
                })
                .build(),
        )
        .manage(auth::AuthState::default())
        .setup(|app| {
            auth::restore_session(&app.handle());
            if let Err(e) = build_tray(&app.handle()) {
                eprintln!("tray init failed: {e}");
            }
            register_shortcuts(&app.handle());
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
            system::autostart_state,
            system::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
