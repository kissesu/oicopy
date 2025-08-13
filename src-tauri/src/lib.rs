// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod clipboard_management;
mod db;
mod panel_window;
mod settings;

use crate::clipboard_management::{get_clipboard_history, setup_clipboard_monitor};
use crate::panel_window::{setup_panel_window, open_panel_window, hide_panel_window, toggle_panel_window};
use crate::settings::{get_app_settings, save_app_settings, cleanup_old_history_command, clear_all_history_command, get_data_count, emit_data_cleared_event};
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
                // let _ = toggle_panel_window(app.clone(), "copy-panel".to_string());
            }
        }
        TrayIconEvent::DoubleClick { .. } => {
            // 首先检查 setting-panel 是否正在显示
            if let Some(setting_win) = app.get_webview_window("setting-panel") {
                if setting_win.is_visible().unwrap_or(false) {
                    println!("setting-panel is visible, focusing it instead of opening copy-panel");
                    // 如果权限设置窗口已经显示，只是聚焦到它，不打开 copy-panel
                    let _ = setting_win.set_focus();
                    return;
                }
            }
            
            // 如果 setting-panel 没有显示，尝试显示 copy-panel
            match open_panel_window(app.clone(), "copy-panel".to_string()) {
                Ok(_) => println!("Copy panel opened from tray"),
                Err(e) => {
                    println!("Failed to open copy panel from tray: {}", e);
                    // 如果权限不足，打开权限设置窗口
                    if e.contains("权限不足") {
                        let _ = open_panel_window(app.clone(), "setting-panel".to_string());
                    }
                }
            }
        }
        _ => {}
    }
}

// 创建系统托盘菜单
fn create_tray_menu(app: &AppHandle<Wry>) -> Result<Menu<Wry>, Box<dyn std::error::Error>> {
    let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;
    Ok(menu)
}

// 处理托盘菜单事件
fn handle_menu_event(app: &AppHandle<Wry>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "settings" => {
            // 打开设置窗口
            if let Some(settings_window) = app.get_webview_window("settings") {
                let _ = settings_window.show();
                let _ = settings_window.set_focus();
            }
        }
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
                                
                                // 首先检查 setting-panel 是否正在显示
                                if let Some(setting_win) = app.app_handle().get_webview_window("setting-panel") {
                                    if setting_win.is_visible().unwrap_or(false) {
                                        println!("SHORTCUT BLOCKED: setting-panel is visible, user needs to complete permission setup first");
                                        println!("Focusing setting-panel instead of opening copy-panel");
                                        // 如果权限设置窗口已经显示，只是聚焦到它，绝对不打开 copy-panel
                                        let _ = setting_win.set_focus();
                                        return;
                                    }
                                }
                                
                                // 如果 setting-panel 没有显示，尝试显示 copy-panel
                                println!("setting-panel not visible, attempting to open copy-panel");
                                match open_panel_window(app.app_handle().clone(), "copy-panel".to_string()) {
                                    Ok(_) => println!("Copy panel opened successfully via shortcut"),
                                    Err(e) => {
                                        println!("Failed to open copy panel via shortcut: {}", e);
                                        // 如果权限不足，打开权限设置窗口
                                        if e.contains("权限") {
                                            println!("Opening setting-panel due to permission issues");
                                            let _ = open_panel_window(app.app_handle().clone(), "setting-panel".to_string());
                                        }
                                    }
                                }
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_nspanel::init()) // 将 NSPanel 插件放在最后初始化
        .on_window_event(|window, event| {
            // 处理窗口事件并记录所有窗口的状态
            match event {
                WindowEvent::Focused(focused) => {
                    println!("Window '{}' focus changed: {}", window.label(), focused);
                    if window.label() == "copy-panel" {
                        if *focused {
                            println!("NSPanel gained focus");
                        } else {
                            println!("NSPanel lost focus - hiding panel");
                            // 添加短暂延迟，避免快速焦点切换导致的误隐藏
                            let window_clone = window.clone();
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                                // 再次检查窗口是否真的失去焦点
                                if !window_clone.is_focused().unwrap_or(false) {
                                    let _ = window_clone.hide();
                                    println!("NSPanel actually hidden after delay check");
                                } else {
                                    println!("NSPanel regained focus, not hiding");
                                }
                            });
                        }
                    } else if window.label() == "setting-panel" && *focused {
                        println!("setting-panel gained focus - this should be a regular window");
                    }
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        })
        .setup(|app| {
            // 立即隐藏 Dock 图标，只在系统托盘显示
            let _ = app.set_dock_visibility(false);
            
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
            
            // 只在 macOS 下初始化 NSPanel，并且只对 copy-panel 窗口
            #[cfg(target_os = "macos")]
            {
                println!("Initializing NSPanel setup for macOS");
                
                // 检查所有窗口并记录它们的状态
                println!("Checking all windows:");
                if let Some(_copy_win) = app.get_webview_window("copy-panel") {
                    println!("- copy-panel window found - will convert to NSPanel");
                }
                if let Some(_setting_win) = app.get_webview_window("setting-panel") {
                    println!("- setting-panel window found - will keep as regular window");
                }
                if let Some(_settings_win) = app.get_webview_window("settings") {
                    println!("- settings window found - will keep as regular window");
                }
                
                let _ = setup_panel_window(&app.app_handle());
            }
            let _ = setup_clipboard_monitor(app.app_handle().clone()).ok();
            
            // 启动定时清理任务
            start_cleanup_scheduler(app.app_handle().clone());
            
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
            get_clipboard_history,
            get_app_settings,
            save_app_settings,
            cleanup_old_history_command,
            clear_all_history_command,
            get_data_count,
            emit_data_cleared_event
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 启动定时清理任务
fn start_cleanup_scheduler(app_handle: AppHandle<Wry>) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // 每小时执行一次
        
        loop {
            interval.tick().await;
            
            // 执行清理任务
            match perform_auto_cleanup(&app_handle).await {
                Ok(deleted_count) => {
                    if deleted_count > 0 {
                        println!("自动清理了 {} 条过期记录", deleted_count);
                    }
                }
                Err(e) => {
                    eprintln!("自动清理任务失败: {}", e);
                }
            }
        }
    });
}

// 执行自动清理
async fn perform_auto_cleanup(app_handle: &AppHandle<Wry>) -> Result<usize, String> {
    use crate::db::{init_database, get_settings, cleanup_old_history};
    
    let conn = init_database(app_handle)?;
    let settings = get_settings(&conn)?;
    cleanup_old_history(&conn, settings.retention_days)
}
