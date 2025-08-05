use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, Wry};
use tauri_nspanel::Panel;
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

static PANEL_CREATED: OnceLock<()> = OnceLock::new();
pub static COPY_PANEL: OnceLock<Arc<dyn Panel>> = OnceLock::new();
// 构建一个全局可变量 坐标
static PANEL_POSITION: Lazy<Mutex<LogicalPosition<f64>>> =
    Lazy::new(|| Mutex::new(LogicalPosition { x: 0.0, y: 0.0 }));

tauri_panel! {
    panel!(MyPanel {
        config: {
            canBecomeKeyWindow: true,
            isFloatingPanel: true,
            nonactivatingPanel: false,
            // windowDidResignKey(notification: &NSNotification) -> ()
        }
    })
    panel_event!(MyPanelEventHandler {
        windowDidResignKey(notification: &NSNotification) -> (),
    })
}


pub fn create_panel_window(app: &AppHandle<Wry>) -> tauri::Result<()> {
    println!("==> create_panel_window 进入函数");

    // 面板只允许创建一次
    if PANEL_CREATED.get().is_some() {
        println!("==> PANEL_CREATED 已 set，直接返回");
        return Ok(());
    }
    PANEL_CREATED.set(()).ok();
    println!("==> create_panel_window 真正执行逻辑");

    let monitor = app.primary_monitor()?.ok_or_else(|| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "no primary monitor",
        ))
    })?;
    let monitor_size = monitor.size();
    let scale = monitor.scale_factor();
    let width = monitor_size.width as f64 / scale;
    let height = 300.0;
    let x = 0.0;
    let y = (monitor_size.height as f64 / scale) - height;

    let mut pos = PANEL_POSITION.lock().unwrap();
    *pos = LogicalPosition::new(x, y);

    println!("==> 开始创建 copy_panel 面板");
    // 关键：提前检测 label 是否被用过（防止 panic）
    if app.get_webview_window("copy-panel").is_some() {
        println!("==> copy-panel 已存在，直接返回");
        return Ok(());
    }
    let copy_panel = match tauri_nspanel::PanelBuilder::<_, MyPanel>::new(app, "copy-panel")
        .url(WebviewUrl::App("index.html".into()))
        .title("剪切板历史")
        .position(tauri::Position::Logical(LogicalPosition::new(x, y)))
        .size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .content_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .level(PanelLevel::ScreenSaver)
        .floating(true)
        .style_mask(
            StyleMask::empty()
                .borderless()
                .nonactivating_panel()
                .hud_window()
                .utility_window(),
        )
        .collection_behavior(
            CollectionBehavior::new()
                .ignores_cycle()
                .stationary()
                .can_join_all_spaces(),
        )
        .with_window(|window| window.visible_on_all_workspaces(true))
        // .style_mask(StyleMask::empty().borderless())
        .build()
    {
        Ok(b) => b,
        Err(e) => {
            println!("PanelBuilder new error: {:?}", e);
            return Err(e);
        }
    };

    copy_panel.show();
    println!("==> 面板创建并显示完成");
    Ok(())
}

#[tauri::command]
pub fn open_panel_window(panel_name: String) -> Result<(), String> {
    match panel_name.as_str() {
        "copy-panel" => {
            if let Some(panel) = COPY_PANEL.get() {
                let pos = *PANEL_POSITION.lock().unwrap();
                // panel.set_position(tauri::Position::Logical(pos)).unwrap();
                panel.show();
                println!("显示 copy_panel 面板");
            } else {
                return Err("copy-panel panel 不存在".to_string());
            }
        }
        _ => return Err(format!("未知面板：{}", panel_name)),
    }
    Ok(())
}
