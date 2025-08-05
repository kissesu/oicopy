use crate::db::{init_database, save_to_database, ClipboardHistoryItem};
use chrono::Local;
use rusqlite::params;
use tauri::{AppHandle, Listener, Manager, Runtime};

// 开始监听剪切板
fn start_clipboard_monitor<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    // 获取插件的状态实例
    let clipboard_state = app_handle.state::<tauri_plugin_clipboard::Clipboard>();

    // 是否有正在运行的剪切板监听实例
    if is_monitor_running(app_handle.clone()) {
        Ok(())
    } else {
        // 使用状态实例的公开方法
        clipboard_state.start_monitor(app_handle.clone())
    }
}

// 停止监听剪切板
fn _stop_clipboard_monitor<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    let clipboard_state = app_handle.state::<tauri_plugin_clipboard::Clipboard>();
    clipboard_state.stop_monitor(app_handle.clone())
}

// 是否已经监听剪切板
fn is_monitor_running<R: Runtime>(app_handle: AppHandle<R>) -> bool {
    let clipboard_state = app_handle.state::<tauri_plugin_clipboard::Clipboard>();
    clipboard_state.is_monitor_running()
}

/// 从完整 HTML 文件中提取 `<body>` 内部 HTML 内容
fn fallback_strip_head_and_meta(html: &str) -> String {
    use regex::Regex;
    let re_head = Regex::new(r"(?is)<head.*?>.*?</head>").unwrap();
    let re_meta = Regex::new(r"(?is)<meta.*?>").unwrap();
    re_meta
        .replace_all(&re_head.replace_all(html, ""), "")
        .to_string()
}

// 剪切板变化
fn handle_clipboard_change(app_handle: &AppHandle) -> Result<(), String> {
    let clipboard_state = app_handle.state::<tauri_plugin_clipboard::Clipboard>();
    let clipboard_type = clipboard_state.available_types()?;

    // 初始化数据库连接
    let conn = init_database(&app_handle)?;

    // 获取当前时间作为时间戳
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    println!("clipboard_type: {:?}", clipboard_type);
    // 定义类型及其优先级顺序
    let types = [
        ("files", clipboard_type.files),
        ("text", clipboard_type.text),
        ("html", clipboard_type.html),
        ("rtf", clipboard_type.rtf),
        ("image", clipboard_type.image),
    ];

    let mut saved = false;

    for (ty, enabled) in types {
        if enabled && !saved {
            println!("Clipboard contains type: {}", ty);

            match ty {
                "image" => {
                    if let Ok(image_base64) = clipboard_state.read_image_base64() {
                        if !image_base64.is_empty() {
                            let preview = "图像内容".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "image".to_string(),
                                content: image_base64,
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => println!("图像已保存到数据库，ID: {}", id),
                                Err(e) => eprintln!("保存图像失败: {}", e),
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "rtf" => {
                    if let Ok(rtf) = clipboard_state.read_rtf() {
                        if !rtf.is_empty() {
                            let preview = "RTF格式文本".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "rtf".to_string(),
                                content: rtf,
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => println!("RTF已保存到数据库，ID: {}", id),
                                Err(e) => eprintln!("保存RTF失败: {}", e),
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "files" => {
                    if let Ok(files) = clipboard_state.read_files() {
                        if !files.is_empty() {
                            let files_json =
                                serde_json::to_string(&files).unwrap_or_else(|_| "[]".to_string());
                            let preview = if files.len() == 1 {
                                format!("1个文件: {}", files[0])
                            } else {
                                format!("{}个文件", files.len())
                            };
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "files".to_string(),
                                content: files_json,
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => println!("文件列表已保存到数据库，ID: {}", id),
                                Err(e) => eprintln!("保存文件列表失败: {}", e),
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "text" => {
                    if let Ok(text) = clipboard_state.read_text() {
                        if !text.is_empty() {
                            let preview = generate_preview(&text, 100);
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "text".to_string(),
                                content: text,
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => println!("文本已保存到数据库，ID: {}", id),
                                Err(e) => eprintln!("保存文本失败: {}", e),
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "html" => {
                    if let Ok(html) = clipboard_state.read_html() {
                        if !html.is_empty() {
                            let preview = "HTML内容".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "html".to_string(),
                                content: fallback_strip_head_and_meta(&html),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => println!("HTML已保存到数据库，ID: {}", id),
                                Err(e) => eprintln!("保存HTML失败: {}", e),
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                _ => {}
            }
        }
    }
    // let types = [
    //     ("text", clipboard_type.text),
    //     ("html", clipboard_type.html),
    //     ("rtf", clipboard_type.rtf),
    //     ("image", clipboard_type.image),
    //     ("files", clipboard_type.files),
    // ];
    // let mut content_types = Vec::new();
    // for (ty, enabled) in types {
    //     if enabled {
    //         content_types.push(ty);
    //         // 针对每种类型分别处理
    //         println!("Clipboard contains type: {}", ty);

    //     }
    // }
    // println!("content_types: {:?}", content_types);
    if !saved {
        // 如果循环结束后没保存任何内容，做个降级处理
        println!("No clipboard data was saved");
    }
    Ok(())
}

pub fn setup_clipboard_monitor(app_handle: AppHandle) -> Result<(), String> {
    // 启动监听
    start_clipboard_monitor(app_handle.clone())?;

    // 监听剪贴板更新事件
    app_handle
        .clone()
        .listen("plugin:clipboard://clipboard-monitor/update", move |_| {
            if let Err(e) = handle_clipboard_change(&app_handle) {
                eprintln!("处理剪贴板变化出错: {}", e);
            }
        });

    Ok(())
}

// 生成预览文本
fn generate_preview(content: &str, max_chars: usize) -> String {
    if content.chars().count() <= max_chars {
        content.to_string()
    } else {
        let preview: String = content.chars().take(max_chars).collect();
        format!("{}...", preview)
    }
}

// 获取剪贴板历史记录
#[tauri::command]
pub async fn get_clipboard_history(
    app: AppHandle,
    limit: Option<u32>,
    content_type: Option<String>,
) -> Result<Vec<ClipboardHistoryItem>, String> {
    let limit = limit.unwrap_or(50);

    // 获取数据库连接
    let conn = init_database(&app)?;

    // 定义统一的映射闭包
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ClipboardHistoryItem> {
        Ok(ClipboardHistoryItem {
            id: Some(row.get(0)?),
            content_type: row.get(1)?,
            content: row.get(2)?,
            preview: row.get(3)?,
            timestamp: row.get(4)?,
        })
    };

    // 根据是否提供了 content_type 选择不同的 SQL
    let sql = if content_type.is_some() {
        "SELECT id, content_type, content, preview, timestamp FROM clipboard_history 
         WHERE content_type = ?1 ORDER BY id DESC LIMIT ?2"
    } else {
        "SELECT id, content_type, content, preview, timestamp FROM clipboard_history 
         ORDER BY id DESC LIMIT ?1"
    };

    // 准备查询语句
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备查询失败: {}", e))?;

    // 执行查询，根据是否有 content_type 传递不同的参数
    let rows = if let Some(typ) = content_type.as_deref() {
        stmt.query_map(params![typ, limit], map_row)
    } else {
        stmt.query_map(params![limit], map_row)
    }
    .map_err(|e| format!("查询失败: {}", e))?;

    // 收集查询结果
    let mut items = Vec::new();
    for item in rows {
        items.push(item.map_err(|e| format!("处理行数据失败: {}", e))?);
    }

    Ok(items)
}
