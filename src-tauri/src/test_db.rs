use crate::db::{optimize_database_performance, create_performance_indexes};
use rusqlite::Connection;

pub fn test_database_optimization() -> Result<(), String> {
    println!("开始测试数据库优化...");
    
    // 创建内存数据库进行测试
    let conn = Connection::open(":memory:")
        .map_err(|e| format!("创建测试数据库失败: {}", e))?;
    
    // 测试性能优化
    match optimize_database_performance(&conn) {
        Ok(_) => println!("✅ 数据库性能优化测试成功"),
        Err(e) => println!("❌ 数据库性能优化测试失败: {}", e),
    }
    
    // 创建测试表
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
    ).map_err(|e| format!("创建测试表失败: {}", e))?;
    
    // 测试索引创建
    match create_performance_indexes(&conn) {
        Ok(_) => println!("✅ 性能索引创建测试成功"),
        Err(e) => println!("❌ 性能索引创建测试失败: {}", e),
    }
    
    // 验证PRAGMA设置
    println!("\n=== 验证数据库配置 ===");
    
    // 检查WAL模式
    match conn.query_row("PRAGMA journal_mode", [], |row| {
        Ok(row.get::<_, String>(0)?)
    }) {
        Ok(mode) => println!("📋 Journal模式: {}", mode),
        Err(e) => println!("❌ 无法获取Journal模式: {}", e),
    }
    
    // 检查同步模式
    match conn.query_row("PRAGMA synchronous", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(sync) => {
            let sync_name = match sync {
                0 => "OFF",
                1 => "NORMAL",
                2 => "FULL", 
                3 => "EXTRA",
                _ => "UNKNOWN"
            };
            println!("📋 同步模式: {} ({})", sync, sync_name);
        },
        Err(e) => println!("❌ 无法获取同步模式: {}", e),
    }
    
    // 检查缓存大小
    match conn.query_row("PRAGMA cache_size", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(cache) => println!("📋 缓存大小: {} 页", cache),
        Err(e) => println!("❌ 无法获取缓存大小: {}", e),
    }
    
    // 检查临时存储
    match conn.query_row("PRAGMA temp_store", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(temp) => {
            let temp_name = match temp {
                0 => "default",
                1 => "file",
                2 => "memory",
                _ => "unknown"
            };
            println!("📋 临时存储: {} ({})", temp, temp_name);
        },
        Err(e) => println!("❌ 无法获取临时存储设置: {}", e),
    }
    
    // 检查内存映射
    match conn.query_row("PRAGMA mmap_size", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(mmap) => println!("📋 内存映射大小: {} bytes", mmap),
        Err(e) => println!("❌ 无法获取内存映射大小: {}", e),
    }
    
    // 检查WAL自动checkpoint
    match conn.query_row("PRAGMA wal_autocheckpoint", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(checkpoint) => println!("📋 WAL自动checkpoint: {} pages", checkpoint),
        Err(e) => println!("❌ 无法获取WAL自动checkpoint设置: {}", e),
    }
    
    // 检查外键约束
    match conn.query_row("PRAGMA foreign_keys", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(fk) => println!("📋 外键约束: {}", if fk == 1 { "启用" } else { "禁用" }),
        Err(e) => println!("❌ 无法获取外键约束设置: {}", e),
    }
    
    // 检查页面大小
    match conn.query_row("PRAGMA page_size", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(page_size) => println!("📋 页面大小: {} bytes", page_size),
        Err(e) => println!("❌ 无法获取页面大小: {}", e),
    }
    
    println!("\n✅ 数据库优化测试完成");
    Ok(())
}