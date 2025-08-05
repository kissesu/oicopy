// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod clipboard_management;
mod db;
mod panel_window;

use tauri::{Emitter,Manager};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use crate::clipboard_management::{get_clipboard_history, setup_clipboard_monitor};
use crate::panel_window::{open_panel_window};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["command+shift+v"]).expect("REASON")
                .with_handler(move |app, shortcut, event| {
                    let csv_shortcut = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);
                    println!("{:?}", shortcut);
                    if shortcut == &csv_shortcut {
                        match event.state() {
                          ShortcutState::Pressed => {
                            println!("Ctrl-N Pressed!");

                            // let _ = open_panel_window(app.clone(), "copy_panel".to_string());
                            app.emit("global_shortcut_copy_panel", "csv_shortcut triggered").unwrap();
                          }
                          ShortcutState::Released => {
                            println!("Ctrl-N Released!");
                          }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_nspanel::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard::init())
        .setup(|app| {
            let main_window = app.get_webview_window("copy-panel").ok_or_else(|| {
                tauri::Error::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    "main window not found",
                ))
            })?;

            let _ = main_window.hide();
        
            let _ = setup_clipboard_monitor(app.handle().clone()).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_panel_window,
            get_clipboard_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
