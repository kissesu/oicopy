#![allow(deprecated)]
use tauri::{AppHandle, Manager, Wry};
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, WebviewWindowExt};

tauri_panel!(MyPanel {
    config: {
        canBecomeKeyWindow: true,
        isFloatingPanel: true,
        nonactivatingPanel: false,
        acceptsFirstResponder: true,
        becomesKeyOnlyIfNeeded: false,
        hidesOnDeactivate: false,
    }
});

pub fn setup_panel_window(app: &AppHandle<Wry>) {
    // 明确检查窗口标签，只对 copy-panel 窗口进行 NSPanel 转换
    if let Some(win) = app.get_webview_window("copy-panel") {
        // 双重检查窗口标签
        if win.label() == "copy-panel" {
            println!("Setting up NSPanel for copy-panel window (label verified)");

            // 尝试转换为 NSPanel
            match win.to_panel::<MyPanel>() {
                Ok(panel) => {
                    println!("Successfully converted copy-panel to NSPanel");

                    panel.set_level(PanelLevel::ScreenSaver.value());

                    panel.set_collection_behavior(
                        CollectionBehavior::new()
                            .can_join_all_spaces()
                            .stationary()
                            .full_screen_auxiliary()
                            .ignores_cycle()
                            .value(),
                    );

                    // 设置位置和大小
                    let screen = win.primary_monitor().unwrap().unwrap();
                    let screen_width = screen.size().width;
                    let screen_height = screen.size().height;
                    let scale_factor = screen.scale_factor();

                    // 使用逻辑尺寸
                    let logical_screen_width = screen_width as f64 / scale_factor;
                    let logical_screen_height = screen_height as f64 / scale_factor;

                    let panel_height = 332.0;
                    let panel_width = logical_screen_width;

                    // 使用物理坐标来设置位置，确保面板在屏幕底部
                    let physical_x = 0.0;
                    let physical_y = screen_height as f64 - (panel_height * scale_factor);

                    println!(
                        "Physical Screen: {}x{}, Scale: {}",
                        screen_width, screen_height, scale_factor
                    );
                    println!(
                        "Logical Screen: {}x{}",
                        logical_screen_width, logical_screen_height
                    );
                    println!(
                        "Panel: {}x{} at physical ({}, {})",
                        panel_width, panel_height, physical_x, physical_y
                    );

                    win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                        panel_width,
                        panel_height,
                    )))
                    .unwrap();
                    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                        physical_x as i32,
                        physical_y as i32,
                    )))
                    .unwrap();

                    // 获取设置后的实际位置
                    if let Ok(position) = win.outer_position() {
                        println!("Actual position after setting: {:?}", position);
                    }

                    let _ = win.hide();
                    println!("NSPanel setup completed for copy-panel");
                }
                Err(e) => {
                    println!("Failed to convert copy-panel to NSPanel: {:?}", e);
                }
            }
        } else {
            println!(
                "Window found but label mismatch: expected 'copy-panel', got '{}'",
                win.label()
            );
        }
    } else {
        println!("Warning: copy-panel window not found during setup");
    }

    // 明确检查其他窗口，确保它们不被转换为 NSPanel
    if let Some(check_permissions_win) = app.get_webview_window("check-permissions") {
        println!(
            "check-permissions window found - label: '{}' - keeping as regular window",
            check_permissions_win.label()
        );
        // 绝对不对 check-permissions 进行任何 NSPanel 转换
        // 如果意外被转换了，这里会记录错误
        if let Ok(_) = check_permissions_win.to_panel::<MyPanel>() {
            println!("ERROR: check-permissions was unexpectedly converted to NSPanel!");
        } else {
            println!("Confirmed: check-permissions is a regular window (not NSPanel)");
        }
    }

    if let Some(settings_win) = app.get_webview_window("settings") {
        println!(
            "settings window found - label: '{}' - keeping as regular window",
            settings_win.label()
        );
        // 绝对不对 settings 进行任何 NSPanel 转换
    }
}

#[tauri::command]
pub fn open_panel_window(app: AppHandle, panel_name: String) -> Result<(), String> {
    match panel_name.as_str() {
        "copy-panel" => {
            if let Some(win) = app.get_webview_window("copy-panel") {
                // 在显示 copy-panel 之前，严格检查权限状态
                // 如果 check-permissions 窗口正在显示，说明权限不足，绝对不应该显示 copy-panel
                if let Some(check_permissions_win) = app.get_webview_window("check-permissions") {
                    if check_permissions_win.is_visible().unwrap_or(false) {
                        println!("BLOCKED: check-permissions is visible, indicating insufficient permissions. Absolutely not showing copy-panel.");
                        println!(
                            "User should complete permission setup in check-permissions first."
                        );
                        return Err("权限设置窗口正在显示，请先完成权限授权".into());
                    }
                }

                // 如果面板已经显示，确保它获得焦点
                if win.is_visible().unwrap_or(false) {
                    println!("NSPanel is already visible, ensuring it has focus");

                    if let Ok(panel) = win.to_panel::<MyPanel>() {
                        // 强制成为关键窗口并获得焦点
                        let _ = panel.show_and_make_key();
                        let _ = win.set_focus();
                        let _ = panel.show_and_make_key(); // 再次确保

                        // 验证焦点状态
                        match win.is_focused() {
                            Ok(focused) => {
                                println!("NSPanel focus status: {}", focused);
                                if !focused {
                                    println!(
                                        "NSPanel not focused, trying additional focus methods"
                                    );
                                    // 额外的焦点尝试
                                    let _ = win.set_focus();
                                    let _ = panel.show_and_make_key();
                                }
                            }
                            Err(e) => println!("Failed to check NSPanel focus: {:?}", e),
                        }
                    } else {
                        let _ = win.set_focus();
                    }
                    return Ok(());
                }

                // 最后一次检查：确保没有其他权限相关的窗口在显示
                if let Some(check_permissions_win) = app.get_webview_window("check-permissions") {
                    if check_permissions_win.is_visible().unwrap_or(false) {
                        println!("FINAL CHECK FAILED: check-permissions became visible, aborting copy-panel display");
                        return Err("权限设置窗口已显示，取消主面板显示".into());
                    }
                }

                // 在显示之前重新设置位置
                let screen = win.primary_monitor().unwrap().unwrap();
                let screen_height = screen.size().height;
                let scale_factor = screen.scale_factor();

                let panel_height = 332.0;
                let physical_x = 0.0;
                let physical_y = screen_height as f64 - (panel_height * scale_factor);

                let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                    physical_x as i32,
                    physical_y as i32,
                )));
                println!(
                    "Opening NSPanel at physical position: ({}, {})",
                    physical_x, physical_y
                );

                if let Ok(panel) = win.to_panel::<MyPanel>() {
                    // 强制显示并获得焦点
                    println!("Attempting to show NSPanel and make it key window");

                    // 第一步：显示面板
                    let _ = panel.show_and_make_key();

                    // 第二步：确保窗口获得焦点
                    let _ = win.set_focus();

                    // 第三步：再次尝试成为关键窗口
                    let _ = panel.show_and_make_key();

                    // 第四步：使用 Tauri 的焦点方法
                    let _ = win.set_focus();

                    // 验证焦点状态
                    match win.is_focused() {
                        Ok(focused) => println!("NSPanel focus status after setup: {}", focused),
                        Err(e) => println!("Failed to check NSPanel focus status: {:?}", e),
                    }

                    println!("NSPanel shown with enhanced focus attempts");
                } else {
                    println!("Failed to convert to NSPanel, using regular window methods");
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            } else {
                return Err("copy-panel不存在".into());
            }
        }
        "check-permissions" => {
            if let Some(win) = app.get_webview_window("check-permissions") {
                // 当显示权限设置窗口时，确保主面板被隐藏
                if let Some(copy_win) = app.get_webview_window("copy-panel") {
                    if copy_win.is_visible().unwrap_or(false) {
                        println!("Hiding copy-panel before showing check-permissions");
                        let _ = copy_win.hide();
                    }
                }

                // 权限设置窗口是普通窗口，绝对不进行 NSPanel 处理
                println!("Opening check-permissions as regular window (NOT NSPanel)");

                // 确保窗口不是 NSPanel
                // 如果意外被转换了，这里会失败，但我们继续使用普通窗口方法
                let _ = win.show();
                let _ = win.set_focus();

                println!("Setting panel window shown as regular window");
            } else {
                return Err("check-permissions不存在".into());
            }
        }
        "settings" => {
            if let Some(win) = app.get_webview_window("settings") {
                // 设置窗口是普通窗口
                let _ = win.show();
                let _ = win.set_focus();
                println!("Settings window shown");
            } else {
                return Err("settings不存在".into());
            }
        }
        _ => return Err(format!("未知面板：{}", panel_name)),
    }
    Ok(())
}

#[tauri::command]
pub fn hide_panel_window(app: AppHandle, panel_name: String) -> Result<(), String> {
    match panel_name.as_str() {
        "copy-panel" => {
            if let Some(win) = app.get_webview_window("copy-panel") {
                let _ = win.hide();
            } else {
                return Err("copy-panel不存在".into());
            }
        }
        "check-permissions" => {
            if let Some(win) = app.get_webview_window("check-permissions") {
                let _ = win.hide();
            } else {
                return Err("check-permissions不存在".into());
            }
        }
        "settings" => {
            if let Some(win) = app.get_webview_window("settings") {
                let _ = win.hide();
            } else {
                return Err("settings不存在".into());
            }
        }
        _ => return Err(format!("未知面板：{}", panel_name)),
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_panel_window(app: AppHandle, panel_name: String) -> Result<(), String> {
    match panel_name.as_str() {
        "copy-panel" => {
            if let Some(win) = app.get_webview_window("copy-panel") {
                if win.is_visible().unwrap_or(false) {
                    let _ = win.hide();
                } else {
                    // 在显示之前重新设置位置
                    let screen = win.primary_monitor().unwrap().unwrap();
                    let _screen_width = screen.size().width as f64 / screen.scale_factor();
                    let screen_height = screen.size().height as f64 / screen.scale_factor();

                    let panel_height = 332.0;
                    let x = 0.0;
                    let y = screen_height - panel_height;

                    let _ = win
                        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                    println!("Toggling panel at position: ({}, {})", x, y);

                    if let Ok(panel) = win.to_panel::<MyPanel>() {
                        // 强制显示并获得焦点
                        let _ = panel.show_and_make_key();
                        let _ = win.set_focus();
                        let _ = panel.show_and_make_key();
                        println!("NSPanel toggled and focused");
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                        println!("Regular window toggled and focused");
                    }
                }
            } else {
                return Err("copy-panel不存在".into());
            }
        }
        _ => return Err(format!("未知面板：{}", panel_name)),
    }
    Ok(())
}
