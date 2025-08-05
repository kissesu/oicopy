// // use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder, WebviewWindow};

// // #[cfg(target_os = "macos")]
// // pub fn create_panel_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
// //     let panel_window = WebviewWindowBuilder::new(
// //         app,
// //         "panel",
// //         WebviewUrl::App("index.html?path=/panel".into()),
// //     )
// //     .title("Panel Window")
// //     .inner_size(300.0, 400.0)
// //     .visible(false)
// //     .build()?;

// //     // 这里可以添加 macOS 特有的 NSPanel 配置（如有需要）

// //     Ok(panel_window)
// // }

use once_cell::sync::Lazy;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, Wry};
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

static PANEL_CREATED: OnceLock<()> = OnceLock::new();

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

// 构建一个全局可变量 坐标
static PANEL_POSITION: Lazy<Mutex<LogicalPosition<f64>>> =
    Lazy::new(|| Mutex::new(LogicalPosition { x: 0.0, y: 0.0 }));

pub fn create_panel_window(app: &AppHandle<Wry>) -> tauri::Result<()> {
    // 防止重复 build
    if PANEL_CREATED.get().is_some() {
        return Ok(());
    }
    PANEL_CREATED.set(()).ok();

    let main_window = app.get_webview_window("copy-panel").ok_or_else(|| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "main window not found",
        ))
    })?;

    let monitor = main_window.primary_monitor()?.ok_or_else(|| {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            "no primary monitor",
        ))
    })?;
    let main_size = main_window.inner_size()?;
    println!("main_size: {:?}", main_size);
    let monitor_size = monitor.size();
    let monitor_position = monitor.position();
    let scale = monitor.scale_factor();

    // 逻辑坐标和尺寸
    let width = monitor_size.width as f64 / scale;
    let height = 300.0;
    if (width - main_size.width as f64) > 0.0 {
        println!(
            "窗口未占满整个屏幕，可能启用了 Stage Manager 或分屏。{:?}",
            monitor
        );
    }
    let x = 0.0;
    let y = (monitor_position.y + monitor_size.height as i32 - height as i32) as f64 / scale;
    println!("坐标y: {:?}", y);
    let mut pos = PANEL_POSITION.lock().unwrap();
    *pos = LogicalPosition::new(x, y);

    let copy_panel = tauri_nspanel::PanelBuilder::<_, MyPanel>::new(app, "copy-panel")
        .url(WebviewUrl::App("index.html".into()))
        // .url(WebviewUrl::App("index.html?path=/panel".into()))
        .title("剪切板历史")
        // .position(tauri::Position::Logical(tauri::LogicalPosition::new(
        //     x, 500.0,
        // )))
        .position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
        .size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .content_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .level(PanelLevel::ScreenSaver)
        .floating(true)
        .style_mask(
            StyleMask::empty().utility_window().titled(),
            // .borderless()
        )
        .collection_behavior(
            CollectionBehavior::new()
                .ignores_cycle()
                .stationary()
                .can_join_all_spaces(),
        )
        // .hides_on_deactivate(true) // 应用失去焦点时隐藏
        // 设置面板不受屏幕边界限制（重要）
        .with_window(|window| window.visible_on_all_workspaces(true))
        .build()?;

    // // 处理 tauri_nspanel 事件
    // let app_handler = app.clone();
    // let handler = MyPanelEventHandler::new();
    // handler.window_did_resign_key(move |_notification| {
    //     println!("==========》面板失去焦点！");
    //     if let Some(panel) = app_handler.get_webview_window("copy-panel") {
    //         let _ = panel.hide();
    //     }
    // });
    // // 将事件处理器应用到面板
    // copy_panel.set_event_handler(Some(handler.as_protocol_object()));

    // copy_panel.hide();
    copy_panel.show();

    // // 处理 tauri_nspanel 事件
    // let handler = MyPanelEventHandler::new();
    // handler.window_did_resign_key(|notification| {
    //     println!("==========》面板失去焦点！");
    // });

    // copy_panel.hide();

    // 授权页面的面板
    // let setting_panel = tauri_nspanel::PanelBuilder::<_, MyPanel>::new(app, "setting-panel")
    //     .title("首次使用需要授权")
    //     .level(PanelLevel::Status)
    //     .floating(true)
    //     .style_mask(StyleMask::empty().titled())
    //     .build()?;

    // setting_panel.hide();

    // panel.show();
    // setting_panel.show();
    Ok(())
}

#[tauri::command]
pub fn open_panel_window(app_handle: AppHandle, panel_name: String) -> Result<(), String> {
    let app_handle = app_handle.clone();
    // 获取主窗口
    let main_window = app_handle.get_webview_window("copy-panel").unwrap();
    let _ = main_window.set_always_on_top(true);
 
    // 获取主窗口的尺寸
    let monitor = match main_window.primary_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => return Err("no primary monitor".to_string()),
        Err(e) => return Err(e.to_string()),
    };
    println!("monitor: {:?}", monitor);
    let monitor_size = monitor.size();
    let monitor_position = monitor.position();
    let scale = monitor.scale_factor();
 
    // 逻辑坐标和尺寸
    let width = monitor_size.width as f64 / scale;
    let height = 300.0;
    let x = 0.0;
    let y = (monitor_position.y + monitor_size.height as i32 - height as i32) as f64 / scale;
    println!("坐标y: {:?}", y);
    let mut pos = PANEL_POSITION.lock().unwrap();
    *pos = LogicalPosition::new(x, y);
 
    // 设置主窗口的尺寸
    let _ = main_window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
    let _ = main_window.set_position(tauri::Position::Logical(*pos));
    let _ = app_handle.set_dock_visibility(false);
 
    let main_panel = main_window.to_panel::<MyPanel>().unwrap();
    
    // 关键修改：使用 Status 或 PopUpMenu 层级，这些层级在 dock 之上
    let _ = main_panel.set_level(PanelLevel::PopUpMenu.into()); // 或者 PanelLevel::Status
    let _ = main_panel.set_floating_panel(true);
    
    // 修改集合行为，确保面板可以遮挡 dock
    let _ = main_panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .stationary()
            .full_screen_auxiliary()
            .ignores_cycle() // 忽略 Cmd+Tab 循环
            .value()
    );
    
    // 设置样式掩码
    let _ = main_panel.set_style_mask(
        StyleMask::empty()
            .borderless()
            .nonactivating_panel()
            .value()
    );
    
    // 使用 show_and_make_key() 而不是 show()
    let _ = main_panel.show_and_make_key();
 
    // 如果这些打印成功，则插件工作正常
    println!("面板类名: {:?}", main_panel.as_panel().class().name());
    println!(
        "面板能否成为关键窗口？: {}",
        main_panel.can_become_key_window()
    );
    Ok(())
}

// #[tauri::command]
// pub fn open_panel_window(app_handle: AppHandle, panel_name: String) -> Result<(), String> {
//     let app_handle = app_handle.clone();
//     // 获取主窗口
//     let main_window = app_handle.get_webview_window("copy-panel").unwrap();
//     let _ = main_window.set_always_on_top(true);

//     // 获取主窗口的尺寸
//     let monitor = match main_window.primary_monitor() {
//         Ok(Some(monitor)) => monitor,
//         Ok(None) => return Err("no primary monitor".to_string()),
//         Err(e) => return Err(e.to_string()),
//     };
//     println!("monitor: {:?}", monitor);
//     let monitor_size = monitor.size();
//     let monitor_position = monitor.position();
//     let scale = monitor.scale_factor();

//     // 逻辑坐标和尺寸
//     let width = monitor_size.width as f64 / scale;
//     let height = 300.0;
//     let x = 0.0;
//     let y = (monitor_position.y + monitor_size.height as i32 - height as i32) as f64 / scale;
//     println!("坐标y: {:?}", y);
//     let mut pos = PANEL_POSITION.lock().unwrap();
//     *pos = LogicalPosition::new(x, y);

//     // 设置主窗口的尺寸
//     let _ = main_window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)));
//     let _ = main_window.set_position(tauri::Position::Logical(*pos));
//     // let _ = main_window.set_title_bar_style(tauri::TitleBarStyle::Transparent);
//     // let _ = main_window.set_decorations(false);      // 隐藏标题栏 打开这个注释程序会崩溃
//     let _ = app_handle.set_dock_visibility(false);

//     let main_panel = main_window.to_panel::<MyPanel>().unwrap();
//     let _ = main_panel.set_level(PanelLevel::MainMenu.into());
//     let _ = main_panel.set_floating_panel(true);
//     // let _ = main_panel.set_style_mask(StyleMask::empty().utility_window().titled());
//     // let _ = main_panel.set_collection_behavior(CollectionBehavior::new().ignores_cycle().stationary().can_join_all_spaces().into());
//     let _ = main_panel.set_collection_behavior(
//         CollectionBehavior::new().can_join_all_spaces().value()
//             | CollectionBehavior::new().stationary().value()
//             | CollectionBehavior::new().full_screen_auxiliary().value()
//     );
//     let _ = main_panel.show();

//     // 如果这些打印成功，则插件工作正常
//     println!("面板类名: {:?}", main_panel.as_panel().class().name());
//     println!(
//         "面板能否成为关键窗口？: {}",
//         main_panel.can_become_key_window()
//     );
//     Ok(())
// }

// #[tauri::command]
// pub fn open_panel_window(app_handle: AppHandle, panel_name: String) -> Result<(), String> {
//     // 保证窗口已经 build
//     create_panel_window(&app_handle).map_err(|e| e.to_string())?;

//     // 只负责 show/hide，不 close，不 rebuild
//     match panel_name.as_str() {
//         "copy-panel" => {
//             if let Some(copy) = app_handle.get_webview_window("copy-panel") {
//                 let _ = copy.show();
//                 // let _ = copy.set_focus();
//                 // // 将全局变量 PANEL_POSITION 赋值给 tauri::Position::Logical
//                 // let pos = {
//                 //     let pos_guard = PANEL_POSITION.lock().unwrap();
//                 //     *pos_guard
//                 // };

//                 // let _ = copy.set_position(tauri::Position::Logical(pos));
//                 println!("显示 >> copy_panel << 面板")
//             } else {
//                 return Err("面板 copy-panel 不存在".into());
//             }
//             if let Some(setting) = app_handle.get_webview_window("setting-panel") {
//                 let _ = setting.hide();
//             }
//         }
//         "setting-panel" => {
//             if let Some(setting) = app_handle.get_webview_window("setting-panel") {
//                 let _ = setting.show();
//                 println!("显示 setting 面板")
//             } else {
//                 return Err("面板 setting-panel 不存在".into());
//             }
//             if let Some(copy) = app_handle.get_webview_window("copy-panel") {
//                 let _ = copy.hide();
//             }
//         }
//         other => return Err(format!("未知面板：{}", other)),
//     }
//     Ok(())
// }
