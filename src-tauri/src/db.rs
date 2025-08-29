use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use std::time::Instant;

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

// 数据库性能统计
#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseStats {
    pub total_records: i64,
    pub database_size_mb: f64,
    pub index_count: i64,
    pub wal_mode_enabled: bool,
    pub cache_size_mb: f64,
    pub last_vacuum: Option<String>,
    pub query_performance: Vec<QueryPerformance>,
}

// 查询性能统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryPerformance {
    pub query_name: String,
    pub execution_time_ms: f64,
    pub status: String,
}

// 数据库维护结果
#[derive(Debug, Serialize, Deserialize)]
pub struct MaintenanceResult {
    pub vacuum_completed: bool,
    pub reindex_completed: bool,
    pub analyze_completed: bool,
    pub records_cleaned: usize,
    pub size_before_mb: f64,
    pub size_after_mb: f64,
    pub duration_ms: u64,
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

    // 启用WAL模式和性能优化设置（如果失败不影响应用启动）
    if let Err(e) = optimize_database_performance(&conn) {
        println!("数据库性能优化失败，但不影响应用运行: {}", e);
    }

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
    
    // 创建性能优化索引（如果失败不影响应用启动）
    if let Err(e) = create_performance_indexes(&conn) {
        println!("创建性能优化索引失败，但不影响应用运行: {}", e);
    }
    
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

// 启用WAL模式和性能优化设置
pub fn optimize_database_performance(conn: &Connection) -> Result<(), String> {
    println!("启用数据库性能优化...");
    
    // 启用WAL模式（Write-Ahead Logging）- 返回结果，使用query_row
    match conn.query_row("PRAGMA journal_mode=WAL", [], |row| {
        Ok(row.get::<_, String>(0)?)
    }) {
        Ok(result) => println!("✅ WAL模式已启用: {}", result),
        Err(e) => {
            println!("⚠️ WAL模式启用失败: {}", e);
            // WAL模式失败不应该阻止应用启动，继续执行其他优化
        }
    }
    
    // 设置同步模式为NORMAL（平衡性能和安全性）
    match conn.execute("PRAGMA synchronous=NORMAL", []) {
        Ok(_) => {
            // 验证设置是否成功
            match conn.query_row("PRAGMA synchronous", [], |row| {
                Ok(row.get::<_, i64>(0)?)
            }) {
                Ok(result) => {
                    let sync_mode = match result {
                        0 => "OFF",
                        1 => "NORMAL", 
                        2 => "FULL",
                        3 => "EXTRA",
                        _ => "UNKNOWN"
                    };
                    println!("✅ 同步模式设置完成: {} ({})", result, sync_mode);
                },
                Err(e) => println!("⚠️ 同步模式验证失败: {}", e),
            }
        },
        Err(e) => println!("⚠️ 同步模式设置失败: {}", e),
    }
    
    // 设置缓存大小为10000页（约40MB）
    match conn.execute("PRAGMA cache_size=-10000", []) {
        Ok(_) => {
            // 验证设置是否成功
            match conn.query_row("PRAGMA cache_size", [], |row| {
                Ok(row.get::<_, i64>(0)?)
            }) {
                Ok(result) => println!("✅ 缓存大小设置完成: {} 页", result),
                Err(e) => println!("⚠️ 缓存大小验证失败: {}", e),
            }
        },
        Err(e) => println!("⚠️ 缓存大小设置失败: {}", e),
    }
    
    // 临时数据存储在内存中
    match conn.execute("PRAGMA temp_store=memory", []) {
        Ok(_) => {
            // 验证设置是否成功
            match conn.query_row("PRAGMA temp_store", [], |row| {
                Ok(row.get::<_, i64>(0)?)
            }) {
                Ok(result) => {
                    let store_type = match result {
                        0 => "default",
                        1 => "file", 
                        2 => "memory",
                        _ => "unknown"
                    };
                    println!("✅ 临时存储设置完成: {} ({})", result, store_type);
                },
                Err(e) => println!("⚠️ 临时存储验证失败: {}", e),
            }
        },
        Err(e) => println!("⚠️ 临时存储设置失败: {}", e),
    }
    
    // 启用内存映射I/O（256MB）
    match conn.query_row("PRAGMA mmap_size=268435456", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(result) => println!("✅ 内存映射设置完成: {} bytes", result),
        Err(e) => println!("⚠️ 内存映射设置失败: {}", e),
    }
    
    // 设置WAL自动checkpoint（1000页）
    match conn.query_row("PRAGMA wal_autocheckpoint=1000", [], |row| {
        Ok(row.get::<_, i64>(0)?)
    }) {
        Ok(result) => println!("✅ 自动checkpoint设置完成: {} pages", result),
        Err(e) => println!("⚠️ 自动checkpoint设置失败: {}", e),
    }
    
    // 设置页面大小为4096字节（只在数据库为空时有效）
    let table_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table'", 
        [], 
        |row| Ok(row.get(0)?)
    ).unwrap_or(0);
    
    if table_count == 0 {
        match conn.execute("PRAGMA page_size=4096", []) {
            Ok(_) => {
                // 验证设置是否成功
                match conn.query_row("PRAGMA page_size", [], |row| {
                    Ok(row.get::<_, i64>(0)?)
                }) {
                    Ok(result) => println!("✅ 页面大小设置完成: {} bytes", result),
                    Err(e) => println!("⚠️ 页面大小验证失败: {}", e),
                }
            },
            Err(e) => println!("⚠️ 页面大小设置失败: {}", e),
        }
    } else {
        println!("ℹ️ 数据库已存在数据，跳过页面大小设置");
    }
    
    // 启用外键约束
    match conn.execute("PRAGMA foreign_keys=ON", []) {
        Ok(_) => {
            // 验证设置是否成功
            match conn.query_row("PRAGMA foreign_keys", [], |row| {
                Ok(row.get::<_, i64>(0)?)
            }) {
                Ok(result) => println!("✅ 外键约束设置完成: {}", if result == 1 { "启用" } else { "禁用" }),
                Err(e) => println!("⚠️ 外键约束验证失败: {}", e),
            }
        },
        Err(e) => println!("⚠️ 外键约束设置失败: {}", e),
    }
    
    println!("✅ 数据库性能优化完成");
    Ok(())
}

// 创建性能优化索引
pub fn create_performance_indexes(conn: &Connection) -> Result<(), String> {
    println!("正在创建性能优化索引...");
    
    let indexes = vec![
        ("idx_timestamp_desc", "CREATE INDEX IF NOT EXISTS idx_timestamp_desc ON clipboard_history(timestamp DESC)", "时间戳索引"),
        ("idx_type_timestamp", "CREATE INDEX IF NOT EXISTS idx_type_timestamp ON clipboard_history(content_type, timestamp DESC)", "类型时间戳索引"),
        ("idx_source_timestamp", "CREATE INDEX IF NOT EXISTS idx_source_timestamp ON clipboard_history(source_app, timestamp DESC)", "来源应用索引"),
        ("idx_content_hash", "CREATE UNIQUE INDEX IF NOT EXISTS idx_content_hash ON clipboard_history(content_hash)", "内容哈希索引"),
        ("idx_bundle_id", "CREATE INDEX IF NOT EXISTS idx_bundle_id ON clipboard_history(source_bundle_id)", "Bundle ID索引"),
        ("idx_app_icons_updated", "CREATE INDEX IF NOT EXISTS idx_app_icons_updated ON app_icons(updated_at DESC)", "应用图标更新时间索引"),
    ];
    
    let mut success_count = 0;
    let mut error_count = 0;
    
    for (_name, sql, description) in indexes {
        match conn.execute(sql, []) {
            Ok(_) => {
                println!("✓ {} 创建成功", description);
                success_count += 1;
            }
            Err(e) => {
                println!("✗ {} 创建失败: {}", description, e);
                error_count += 1;
                // 继续创建其他索引，不中断整个过程
            }
        }
    }
    
    println!("索引创建完成: 成功 {}, 失败 {}", success_count, error_count);
    
    if error_count > 0 {
        Err(format!("部分索引创建失败: 成功 {}, 失败 {}", success_count, error_count))
    } else {
        Ok(())
    }
}

// 数据库维护任务
pub fn perform_maintenance(conn: &Connection) -> Result<MaintenanceResult, String> {
    let start_time = Instant::now();
    println!("开始数据库维护任务...");
    
    // 获取维护前的数据库大小
    let size_before = get_database_size_mb(conn)?;
    
    // 清理过期数据
    let settings = get_settings(conn)?;
    let records_cleaned = cleanup_old_history(conn, settings.retention_days)?;
    
    // 执行VACUUM（清理碎片，压缩数据库）- 不返回结果，使用execute
    let vacuum_completed = match conn.execute("VACUUM", []) {
        Ok(_) => {
            println!("✅ VACUUM 完成");
            true
        }
        Err(e) => {
            println!("✗ VACUUM 失败: {}", e);
            false
        }
    };
    
    // 重建索引 - 不返回结果，使用execute
    let reindex_completed = match conn.execute("REINDEX", []) {
        Ok(_) => {
            println!("✅ REINDEX 完成");
            true
        }
        Err(e) => {
            println!("✗ REINDEX 失败: {}", e);
            false
        }
    };
    
    // 更新统计信息 - 不返回结果，使用execute
    let analyze_completed = match conn.execute("ANALYZE", []) {
        Ok(_) => {
            println!("✅ ANALYZE 完成");
            true
        }
        Err(e) => {
            println!("✗ ANALYZE 失败: {}", e);
            false
        }
    };
    
    // 执行WAL checkpoint（如果启用了WAL模式）- 返回结果，使用query_row
    let _checkpoint_result = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
        let busy: i64 = row.get(0)?;
        let log: i64 = row.get(1)?;
        let checkpointed: i64 = row.get(2)?;
        Ok((busy, log, checkpointed))
    });
    
    match _checkpoint_result {
        Ok((busy, log, checkpointed)) => {
            println!("✅ WAL checkpoint 完成: busy={}, log={}, checkpointed={}", busy, log, checkpointed);
        }
        Err(e) => {
            println!("ℹ️ WAL checkpoint 跳过 (可能未启用WAL): {}", e);
        }
    }
    
    // 获取维护后的数据库大小
    let size_after = get_database_size_mb(conn)?;
    let duration = start_time.elapsed();
    
    println!("数据库维护完成，耗时: {:?}", duration);
    println!("清理记录数: {}", records_cleaned);
    println!("大小变化: {:.2}MB -> {:.2}MB", size_before, size_after);
    
    Ok(MaintenanceResult {
        vacuum_completed,
        reindex_completed,
        analyze_completed,
        records_cleaned,
        size_before_mb: size_before,
        size_after_mb: size_after,
        duration_ms: duration.as_millis() as u64,
    })
}

// 获取数据库统计信息
pub fn get_database_stats(conn: &Connection) -> Result<DatabaseStats, String> {
    // 获取总记录数
    let total_records: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
            Ok(row.get(0)?)
        })
        .unwrap_or(0); // 如果表不存在，返回0
    
    // 获取数据库大小
    let database_size_mb = get_database_size_mb(conn).unwrap_or(0.0);
    
    // 获取索引数量
    let index_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| Ok(row.get(0)?)
        )
        .unwrap_or(0);
    
    // 检查WAL模式是否启用
    let wal_mode_enabled: String = conn
        .query_row("PRAGMA journal_mode", [], |row| Ok(row.get(0)?))
        .unwrap_or_else(|_| "DELETE".to_string()); // 默认模式
    let wal_mode_enabled = wal_mode_enabled.to_uppercase() == "WAL";
    
    // 获取缓存大小
    let cache_size: i64 = conn
        .query_row("PRAGMA cache_size", [], |row| Ok(row.get(0)?))
        .unwrap_or(2000); // 默认缓存大小
    let cache_size_mb = (cache_size.abs() * 4096) as f64 / 1024.0 / 1024.0; // 转换为MB，使用abs因为可能是负数
    
    // 执行查询性能测试
    let query_performance = test_query_performance(conn).unwrap_or_else(|_| Vec::new());
    
    Ok(DatabaseStats {
        total_records,
        database_size_mb,
        index_count,
        wal_mode_enabled,
        cache_size_mb,
        last_vacuum: None, // 可以从设置表中获取
        query_performance,
    })
}

// 获取数据库文件大小（MB）
fn get_database_size_mb(conn: &Connection) -> Result<f64, String> {
    let page_count: i64 = conn
        .query_row("PRAGMA page_count", [], |row| Ok(row.get(0)?))
        .unwrap_or(0);
    
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |row| Ok(row.get(0)?))
        .unwrap_or(4096); // 默认页面大小
    
    let size_bytes = page_count * page_size;
    let size_mb = size_bytes as f64 / 1024.0 / 1024.0;
    
    Ok(size_mb)
}

// 测试查询性能
fn test_query_performance(conn: &Connection) -> Result<Vec<QueryPerformance>, String> {
    let mut results = Vec::new();
    
    // 首先检查表是否存在
    let table_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='clipboard_history'",
            [],
            |row| Ok(row.get(0)?)
        )
        .unwrap_or(0);
    
    if table_exists == 0 {
        // 如果表不存在，返回空结果
        return Ok(vec![QueryPerformance {
            query_name: "表检查".to_string(),
            execution_time_ms: 0.0,
            status: "clipboard_history表不存在".to_string(),
        }]);
    }
    
    let test_queries = vec![
        ("最近50条记录", "SELECT id, content_type, timestamp FROM clipboard_history ORDER BY timestamp DESC LIMIT 50"),
        ("文本类型查询", "SELECT id, content_type, timestamp FROM clipboard_history WHERE content_type = 'text' ORDER BY timestamp DESC LIMIT 20"),
        ("按应用查询", "SELECT id, source_app, timestamp FROM clipboard_history WHERE source_app IS NOT NULL ORDER BY timestamp DESC LIMIT 20"),
        ("内容哈希查询", "SELECT id, content_hash FROM clipboard_history WHERE content_hash IS NOT NULL LIMIT 20"),
        ("统计查询", "SELECT content_type, COUNT(*) FROM clipboard_history GROUP BY content_type"),
    ];
    
    for (name, query) in test_queries {
        let start = Instant::now();
        let result = conn.prepare(query).and_then(|mut stmt| {
            stmt.query_map([], |_| Ok(()))?.collect::<Result<Vec<_>, _>>()
        });
        let duration = start.elapsed();
        
        let status = match result {
            Ok(_) => "成功".to_string(),
            Err(e) => {
                // 记录错误但不中断整个测试
                println!("查询性能测试失败 - {}: {}", name, e);
                format!("失败: {}", e)
            }
        };
        
        results.push(QueryPerformance {
            query_name: name.to_string(),
            execution_time_ms: duration.as_secs_f64() * 1000.0,
            status,
        });
    }
    
    Ok(results)
}

// 智能清理功能：按数量限制清理
pub fn cleanup_by_limit(conn: &Connection, max_records: i64) -> Result<usize, String> {
    let current_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
            Ok(row.get(0)?)
        })
        .map_err(|e| format!("获取记录数失败: {}", e))?;
    
    if current_count <= max_records {
        return Ok(0);
    }
    
    let _to_delete = current_count - max_records;
    let deleted_count = conn
        .execute(
            "DELETE FROM clipboard_history WHERE id NOT IN (
                SELECT id FROM clipboard_history ORDER BY timestamp DESC LIMIT ?1
            )",
            params![max_records],
        )
        .map_err(|e| format!("按数量清理失败: {}", e))?;
    
    println!("按数量清理完成，删除了 {} 条记录", deleted_count);
    Ok(deleted_count)
}

// 智能清理功能：按大小限制清理
pub fn cleanup_by_size(conn: &Connection, max_size_mb: f64) -> Result<usize, String> {
    let current_size = get_database_size_mb(conn)?;
    
    if current_size <= max_size_mb {
        return Ok(0);
    }
    
    // 估算需要删除的记录数（简单估算）
    let total_records: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
            Ok(row.get(0)?)
        })
        .map_err(|e| format!("获取记录数失败: {}", e))?;
    
    let size_ratio = max_size_mb / current_size;
    let target_records = (total_records as f64 * size_ratio) as i64;
    
    cleanup_by_limit(conn, target_records)
}

// 智能清理：综合策略
pub fn perform_smart_cleanup(conn: &Connection) -> Result<SmartCleanupResult, String> {
    let start_time = Instant::now();
    println!("开始智能清理...");
    
    let stats_before = get_database_stats(conn)?;
    let mut total_deleted = 0;
    let mut operations = Vec::new();
    
    // 1. 清理过期数据（根据设置的保留天数）
    let settings = get_settings(conn)?;
    if settings.retention_days > 0 {
        match cleanup_old_history(conn, settings.retention_days) {
            Ok(deleted) => {
                total_deleted += deleted;
                operations.push(format!("按时间清理: 删除 {} 条过期记录", deleted));
            }
            Err(e) => operations.push(format!("按时间清理失败: {}", e)),
        }
    }
    
    // 2. 如果记录数仍然过多，按数量限制清理
    let current_records: i64 = conn
        .query_row("SELECT COUNT(*) FROM clipboard_history", [], |row| {
            Ok(row.get(0)?)
        })
        .unwrap_or(0);
    
    if current_records > 50000 {
        match cleanup_by_limit(conn, 50000) {
            Ok(deleted) => {
                total_deleted += deleted;
                operations.push(format!("按数量清理: 删除 {} 条记录，保留最新50000条", deleted));
            }
            Err(e) => operations.push(format!("按数量清理失败: {}", e)),
        }
    }
    
    // 3. 如果数据库文件过大，按大小清理
    let current_size = get_database_size_mb(conn).unwrap_or(0.0);
    if current_size > 500.0 {
        match cleanup_by_size(conn, 500.0) {
            Ok(deleted) => {
                total_deleted += deleted;
                operations.push(format!("按大小清理: 删除 {} 条记录，限制大小500MB", deleted));
            }
            Err(e) => operations.push(format!("按大小清理失败: {}", e)),
        }
    }
    
    // 4. 执行维护任务
    match perform_maintenance(conn) {
        Ok(maintenance_result) => {
            operations.push(format!("维护任务完成: VACUUM={}, REINDEX={}, ANALYZE={}", 
                maintenance_result.vacuum_completed,
                maintenance_result.reindex_completed,
                maintenance_result.analyze_completed
            ));
        }
        Err(e) => operations.push(format!("维护任务失败: {}", e)),
    }
    
    let stats_after = get_database_stats(conn)?;
    let duration = start_time.elapsed();
    
    println!("智能清理完成，耗时: {:?}", duration);
    println!("总共删除记录数: {}", total_deleted);
    
    Ok(SmartCleanupResult {
        total_deleted,
        operations,
        size_before_mb: stats_before.database_size_mb,
        size_after_mb: stats_after.database_size_mb,
        records_before: stats_before.total_records,
        records_after: stats_after.total_records,
        duration_ms: duration.as_millis() as u64,
    })
}

// 分析数据库性能
pub fn analyze_database_performance(conn: &Connection) -> Result<PerformanceAnalysis, String> {
    println!("开始数据库性能分析...");
    
    let stats = get_database_stats(conn)?;
    let mut recommendations = Vec::new();
    let mut issues = Vec::new();
    
    // 分析WAL模式
    if !stats.wal_mode_enabled {
        issues.push("WAL模式未启用".to_string());
        recommendations.push("建议启用WAL模式以提高并发性能".to_string());
    }
    
    // 分析数据库大小
    if stats.database_size_mb > 1000.0 {
        issues.push(format!("数据库文件较大: {:.2}MB", stats.database_size_mb));
        recommendations.push("建议执行数据清理或归档操作".to_string());
    }
    
    // 分析记录数量
    if stats.total_records > 100000 {
        issues.push(format!("记录数量较多: {} 条", stats.total_records));
        recommendations.push("建议设置合适的数据保留策略".to_string());
    }
    
    // 分析查询性能
    let slow_queries: Vec<&QueryPerformance> = stats.query_performance
        .iter()
        .filter(|q| q.execution_time_ms > 100.0)
        .collect();
    
    if !slow_queries.is_empty() {
        issues.push(format!("发现 {} 个慢查询", slow_queries.len()));
        recommendations.push("建议执行数据库维护任务或检查索引".to_string());
    }
    
    // 分析索引数量
    if stats.index_count < 5 {
        issues.push("索引数量不足".to_string());
        recommendations.push("建议创建性能优化索引".to_string());
    }
    
    // 计算性能评分
    let mut score = 100;
    if !stats.wal_mode_enabled { score -= 20; }
    if stats.database_size_mb > 500.0 { score -= 15; }
    if stats.total_records > 50000 { score -= 10; }
    if !slow_queries.is_empty() { score -= 20; }
    if stats.index_count < 5 { score -= 15; }
    
    let performance_grade = match score {
        90..=100 => "优秀",
        80..=89 => "良好", 
        70..=79 => "一般",
        60..=69 => "需要优化",
        _ => "性能较差"
    };
    
    println!("性能分析完成，评分: {}/100 ({})", score, performance_grade);
    
    let slow_queries_cloned: Vec<QueryPerformance> = slow_queries.into_iter().cloned().collect();
    
    Ok(PerformanceAnalysis {
        score,
        grade: performance_grade.to_string(),
        issues,
        recommendations,
        stats,
        slow_queries: slow_queries_cloned,
    })
}

// 智能清理结果
#[derive(Debug, Serialize, Deserialize)]
pub struct SmartCleanupResult {
    pub total_deleted: usize,
    pub operations: Vec<String>,
    pub size_before_mb: f64,
    pub size_after_mb: f64,
    pub records_before: i64,
    pub records_after: i64,
    pub duration_ms: u64,
}

// 性能分析结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PerformanceAnalysis {
    pub score: i32,
    pub grade: String,
    pub issues: Vec<String>,
    pub recommendations: Vec<String>,
    pub stats: DatabaseStats,
    pub slow_queries: Vec<QueryPerformance>,
}
