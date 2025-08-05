use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

// 定义剪贴板历史记录结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct ClipboardHistoryItem {
    pub id: Option<i64>,
    pub content_type: String,
    pub content: String,
    pub preview: Option<String>,
    pub timestamp: String,
}

// 创建数据库连接和表结构
pub fn init_database(app_handle: &AppHandle) -> Result<Connection, String> {
    // 拿到 PathResolver
    let resolver = app_handle.path();
    // 获取应用数据目录
    let app_data_dir = resolver
        .app_data_dir()
        .or_else(|_| Err("无法获取应用数据目录".to_string()))?;

    // 确保目录存在
    std::fs::create_dir_all(&app_data_dir).map_err(|e| format!("创建数据目录失败: {}", e))?;

    // 创建或打开数据库连接
    let db_path = app_data_dir.join("clipboard_history.db");
    let conn = Connection::open(db_path).map_err(|e| format!("打开数据库失败: {}", e))?;

    // 创建表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_type TEXT NOT NULL,
            content TEXT NOT NULL,
            preview TEXT,
            timestamp TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("创建表失败: {}", e))?;

    Ok(conn)
}

// 保存剪贴板内容到数据库
pub fn save_to_database(conn: &Connection, item: &ClipboardHistoryItem) -> Result<i64, String> {
    let result = conn.execute(
        "INSERT INTO clipboard_history (content_type, content, preview, timestamp) 
         VALUES (?1, ?2, ?3, ?4)",
        params![
            item.content_type,
            item.content,
            item.preview,
            item.timestamp
        ],
    );

    match result {
        Ok(_) => {
            // 返回最后插入的行ID
            Ok(conn.last_insert_rowid())
        }
        Err(e) => Err(format!("保存到数据库失败: {}", e)),
    }
}
