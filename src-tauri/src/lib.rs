// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod clipboard_management;
mod db;
mod panel_window;

use crate::clipboard_management::{get_clipboard_history, setup_clipboard_monitor};
use crate::panel_window::{setup_panel_window, open_panel_window, hide_panel_window, toggle_panel_window};
use tauri::{Manager, AppHandle, Wry, WindowEvent};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

// 处理系统托盘事件
fn handle_tray_event(app: &AppHandle<Wry>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click { button, .. } => {
            if button == MouseButton::Left {
                // 左键点击显示/隐藏面板
                let _ = toggle_panel_window(app.clone(), "copy-panel".to_string());
            }
        }
        TrayIconEvent::DoubleClick { .. } => {
            // 双击显示面板
            let _ = open_panel_window(app.clone(), "copy-panel".to_string());
        }
        _ => {}
    }
}

// 创建系统托盘菜单
fn create_tray_menu(app: &AppHandle<Wry>) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_item])?;
    Ok(menu)
}

// 处理托盘菜单事件
fn handle_menu_event(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "quit" => {
            println!("Quitting application...");
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["command+shift+v"])
                .expect("REASON")
                .with_handler(move |app, shortcut, event| {
                    let csv_shortcut =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV);
                    println!("{:?}", shortcut);
                    if shortcut == &csv_shortcut {
                        match event.state() {
                            ShortcutState::Pressed => {
                                println!("Command+Shift+V Pressed!");
                                // 只显示面板，不隐藏
                                let _ = open_panel_window(app.app_handle().clone(), "copy-panel".to_string());
                            }
                            ShortcutState::Released => {
                                println!("Command+Shift+V Released!");
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
        .on_window_event(|window, event| {
            // 处理窗口事件
            match event {
                WindowEvent::Focused(focused) => {
                    if window.label() == "copy-panel" {
                        if *focused {
                            println!("Panel gained focus");
                        } else {
                            println!("Panel lost focus - hiding panel");
                            let _ = window.hide();
                        }
                    }
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        })
        .setup(|app| {
            // 创建系统托盘菜单
            let tray_menu = create_tray_menu(&app.app_handle())
                .expect("Failed to create tray menu");
            
            // 创建系统托盘图标
            let app_handle = app.app_handle().clone();
            let _tray = TrayIconBuilder::with_id("main-tray")
                .menu(&tray_menu)
                .tooltip("OiCopy - 剪贴板管理器")
                .icon(app.default_window_icon().cloned().unwrap())
                .on_tray_icon_event(move |_tray, event| {
                    handle_tray_event(&app_handle, event);
                })
                .build(app)
                .expect("Failed to create tray icon");
            
            // 只要在 macOS 下初始化即可
            #[cfg(target_os = "macos")]
            {
                let _ = setup_panel_window(&app.app_handle());
            }
            let _ = setup_clipboard_monitor(app.app_handle().clone()).ok();
            Ok(())
            // let app_handler = app.app_handle();
            // // 这里调用一次即可
            // // 你可以只在 macOS 下调用
            // #[cfg(target_os = "macos")]
            // {
            //     let _ = create_panel_window(app_handler);
            // }
            // let main_window = app.get_webview_window("copy-panel").ok_or_else(|| {
            //     tauri::Error::Io(std::io::Error::new(
            //         std::io::ErrorKind::Other,
            //         "main window not found",
            //     ))
            // })?;

            // let _ = main_window.hide();

            // let _ = setup_clipboard_monitor(app.handle().clone()).ok();
            // Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_panel_window,
            hide_panel_window,
            toggle_panel_window,
            get_clipboard_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
