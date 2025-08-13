#![allow(deprecated)]
use tauri::{AppHandle, Manager, Wry};
use tauri_nspanel::{tauri_panel, WebviewWindowExt, CollectionBehavior, PanelLevel};

tauri_panel!(MyPanel {
    config: {
        canBecomeKeyWindow: true,
        isFloatingPanel: true,
        nonactivatingPanel: false,
    }
});


pub fn setup_panel_window(app: &AppHandle<Wry>) {
    let win = app
        .get_webview_window("copy-panel")
        .expect("copy-panel不存在！");
    
    let panel = win.to_panel::<MyPanel>().unwrap();

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
    
    let panel_height = 300.0;
    let panel_width = logical_screen_width;
    
    // 使用物理坐标来设置位置，确保面板在屏幕底部
    let physical_x = 0.0;
    let physical_y = screen_height as f64 - (panel_height * scale_factor);
    
    println!("Physical Screen: {}x{}, Scale: {}", screen_width, screen_height, scale_factor);
    println!("Logical Screen: {}x{}", logical_screen_width, logical_screen_height);
    println!("Panel: {}x{} at physical ({}, {})", panel_width, panel_height, physical_x, physical_y);
    
    win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(panel_width, panel_height)))
        .unwrap();
    win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(physical_x as i32, physical_y as i32)))
        .unwrap();
        
    // 获取设置后的实际位置
    if let Ok(position) = win.outer_position() {
        println!("Actual position after setting: {:?}", position);
    }
        
    let _ = win.hide();
}
 
#[tauri::command]
pub fn open_panel_window(app: AppHandle, panel_name: String) -> Result<(), String> {
    match panel_name.as_str() {
        "copy-panel" => {
            if let Some(win) = app.get_webview_window("copy-panel") {
                // 如果面板已经显示，直接返回
                if win.is_visible().unwrap_or(false) {
                    println!("Panel is already visible, focusing it");
                    // 确保面板获得焦点
                    if let Ok(panel) = win.to_panel::<MyPanel>() {
                        let _ = panel.show_and_make_key();
                    } else {
                        let _ = win.set_focus();
                    }
                    return Ok(());
                }
                
                // 在显示之前重新设置位置
                let screen = win.primary_monitor().unwrap().unwrap();
                let screen_height = screen.size().height;
                let scale_factor = screen.scale_factor();
                
                let panel_height = 300.0;
                let physical_x = 0.0;
                let physical_y = screen_height as f64 - (panel_height * scale_factor);
                
                let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(physical_x as i32, physical_y as i32)));
                println!("Opening panel at physical position: ({}, {})", physical_x, physical_y);
                
                if let Ok(panel) = win.to_panel::<MyPanel>() {
                    // 多次尝试设置焦点
                    let _ = panel.show_and_make_key();
                    let _ = win.set_focus();
                    let _ = panel.show_and_make_key(); // 再次尝试
                    println!("Panel shown and focused using multiple focus attempts");
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                    println!("Panel shown using regular window methods");
                }
            } else {
                return Err("copy-panel不存在".into());
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
                    
                    let panel_height = 300.0;
                    let x = 0.0;
                    let y = screen_height - panel_height;
                    
                    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                    println!("Toggling panel at position: ({}, {})", x, y);
                    
                    if let Ok(panel) = win.to_panel::<MyPanel>() {
                        let _ = panel.show_and_make_key();
                    } else {
                        let _ = win.show();
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
