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
    pub content_hash: Option<String>, // 内容哈希字段
    pub source_app: Option<String>,   // 来源应用名称
    pub source_bundle_id: Option<String>, // 来源应用Bundle ID
    pub app_icon_base64: Option<String>, // 应用图标base64数据
}

// 定义设置结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub retention_days: i32,
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
            content_hash TEXT,
            preview TEXT,
            timestamp TEXT NOT NULL,
            source_app TEXT,
            source_bundle_id TEXT
        )",
        [],
    )
    .map_err(|e| format!("创建剪贴板历史表失败: {}", e))?;
    
    // 为旧表添加新列（如果不存在）
    let _ = conn.execute(
        "ALTER TABLE clipboard_history ADD COLUMN content_hash TEXT",
        [],
    ); // 忽略错误，因为列可能已存在
    
    let _ = conn.execute(
        "ALTER TABLE clipboard_history ADD COLUMN source_app TEXT",
        [],
    ); // 忽略错误，因为列可能已存在
    
    let _ = conn.execute(
        "ALTER TABLE clipboard_history ADD COLUMN source_bundle_id TEXT",
        [],
    ); // 忽略错误，因为列可能已存在
    
    // 创建内容哈希的唯一索引（防重复）
    let _ = conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_content_hash ON clipboard_history(content_hash)",
        [],
    );
    
    // 创建应用图标缓存表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_icons (
            bundle_id TEXT PRIMARY KEY,
            app_name TEXT,
            icon_base64 TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("创建应用图标缓存表失败: {}", e))?;
    
    // 创建设置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            retention_days INTEGER NOT NULL DEFAULT 30
        )",
        [],
    )
    .map_err(|e| format!("创建设置表失败: {}", e))?;
    
    // 初始化默认设置
    conn.execute(
        "INSERT OR IGNORE INTO app_settings (id, retention_days) VALUES (1, 30)",
        [],
    )
    .map_err(|e| format!("初始化设置失败: {}", e))?;

    Ok(conn)
}

// 保存剪贴板内容到数据库
pub fn save_to_database(conn: &Connection, item: &ClipboardHistoryItem) -> Result<i64, String> {
    let result = conn.execute(
        "INSERT INTO clipboard_history (content_type, content, content_hash, preview, timestamp, source_app, source_bundle_id) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            item.content_type,
            item.content,
            item.content_hash,
            item.preview,
            item.timestamp,
            item.source_app,
            item.source_bundle_id
        ],
    );

    match result {
        Ok(_) => {
            // 返回最后插入的行ID
            Ok(conn.last_insert_rowid())
        }
        Err(e) => {
            // 检查是否是唯一约束失败（即内容重复）
            if e.to_string().contains("UNIQUE constraint failed") {
                println!("内容已存在，跳过保存");
                return Err("内容重复".to_string());
            }
            Err(format!("保存到数据库失败: {}", e))
        }
    }
}

// 获取应用设置
pub fn get_settings(conn: &Connection) -> Result<AppSettings, String> {
    let mut stmt = conn
        .prepare("SELECT retention_days FROM app_settings WHERE id = 1")
        .map_err(|e| format!("准备查询设置失败: {}", e))?;
    
    let retention_days = stmt
        .query_row([], |row| {
            Ok(row.get::<_, i32>(0)?)
        })
        .unwrap_or(30); // 默认值
    
    Ok(AppSettings { retention_days })
}

// 保存应用设置
pub fn save_settings(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    conn.execute(
        "UPDATE app_settings SET retention_days = ?1 WHERE id = 1",
        params![settings.retention_days],
    )
    .map_err(|e| format!("保存设置失败: {}", e))?;
    
    Ok(())
}

// 清理过期的历史记录
pub fn cleanup_old_history(conn: &Connection, retention_days: i32) -> Result<usize, String> {
    let cutoff_date = chrono::Local::now() - chrono::Duration::days(retention_days as i64);
    let cutoff_str = cutoff_date.format("%Y-%m-%d %H:%M:%S").to_string();
    
    let deleted_count = conn
        .execute(
            "DELETE FROM clipboard_history WHERE timestamp < ?1",
            params![cutoff_str],
        )
        .map_err(|e| format!("清理历史记录失败: {}", e))?;
    
    Ok(deleted_count)
}

// 从缓存中获取应用图标
pub fn get_cached_app_icon(conn: &Connection, bundle_id: &str) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT icon_base64 FROM app_icons WHERE bundle_id = ?1")
        .ok()?;
    
    stmt.query_row([bundle_id], |row| {
        Ok(row.get::<_, String>(0)?)
    }).ok()
}

// 缓存应用图标
pub fn cache_app_icon(conn: &Connection, bundle_id: &str, app_name: Option<&str>, icon_base64: &str) -> Result<(), String> {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    conn.execute(
        "INSERT OR REPLACE INTO app_icons (bundle_id, app_name, icon_base64, created_at, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![bundle_id, app_name, icon_base64, now, now],
    )
    .map_err(|e| format!("缓存应用图标失败: {}", e))?;
    
    Ok(())
}
