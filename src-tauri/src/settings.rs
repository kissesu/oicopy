use crate::db::{init_database, get_settings, save_settings, cleanup_old_history, AppSettings};
use tauri::AppHandle;

// 获取应用设置命令
#[tauri::command]
pub async fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    let conn = init_database(&app)?;
    get_settings(&conn)
}

// 保存应用设置命令
#[tauri::command]
pub async fn save_app_settings(app: AppHandle, retention_days: i32) -> Result<(), String> {
    let conn = init_database(&app)?;
    let settings = AppSettings { retention_days };
    save_settings(&conn, &settings)
}

// 清理过期历史记录命令
#[tauri::command]
pub async fn cleanup_old_history_command(app: AppHandle) -> Result<usize, String> {
    let conn = init_database(&app)?;
    let settings = get_settings(&conn)?;
    cleanup_old_history(&conn, settings.retention_days)
}

// 获取数据计数命令
#[tauri::command]
pub async fn get_data_count(app: AppHandle) -> Result<usize, String> {
    use crate::db::init_database;
    use rusqlite::params;
    
    let conn = init_database(&app)?;
    let count_query = "SELECT COUNT(*) FROM clipboard_history";
    let count: i64 = conn
        .query_row(count_query, params![], |row| row.get(0))
        .map_err(|e| format!("查询记录数量失败: {}", e))?;
    
    Ok(count as usize)
}

// 清理所有历史记录命令
#[tauri::command]
pub async fn clear_all_history_command(app: AppHandle) -> Result<usize, String> {
    use crate::db::init_database;
    use rusqlite::params;
    
    let conn = init_database(&app)?;
    
    // 先查询要删除的记录数量
    let count_query = "SELECT COUNT(*) FROM clipboard_history";
    let deleted_count: i64 = conn
        .query_row(count_query, params![], |row| row.get(0))
        .map_err(|e| format!("查询记录数量失败: {}", e))?;
    
    // 执行删除操作
    conn.execute("DELETE FROM clipboard_history", params![])
        .map_err(|e| format!("清理所有历史记录失败: {}", e))?;
    
    Ok(deleted_count as usize)
}
