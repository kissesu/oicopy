use crate::app_info::{get_app_icon, get_frontmost_app};
use crate::db::{
    cache_app_icon, get_cached_app_icon, init_database, save_to_database, ClipboardHistoryItem,
};
use crate::performance_optimization::{
    AnalysisConfig, OptimizedContentAnalyzer, PerformanceError
};
use chrono::Local;
use rusqlite::params;
use sha2::{Digest, Sha256};

use std::fmt::Write;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

// ===== 类型定义 =====

// 应用程序类型枚举
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ApplicationType {
    ChatGPT,
    MicrosoftOffice,
    AppleEcosystem,
    Unknown,
}

// 检测到的应用程序信息
#[derive(Debug, Clone)]
struct DetectedApplication {
    app_type: ApplicationType,
    confidence: f64,
    detected_patterns: Vec<PatternMatch>,
    total_score: f64,
}

// 模式匹配结果
#[derive(Debug, Clone)]
struct PatternMatch {
    pattern: DetectionPattern,
    match_count: usize,
    confidence: f64,
}

// 检测模式
#[derive(Debug, Clone)]
struct DetectionPattern {
    description: String,
}

// Office 冗余级别
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
enum OfficeRedundancyLevel {
    None,
    Low,
    Medium,
    High,
}

// Office 检测结果
#[derive(Debug, Clone)]
struct OfficeDetectionResult {
    specific_app: String,
    redundancy_level: OfficeRedundancyLevel,
    confidence: f64,
    detected_features: Vec<OfficeFeature>,
}

// Office 特征
#[derive(Debug, Clone)]
struct OfficeFeature {
    feature_type: String,
    pattern: String,
    match_count: usize,
    score: f64,
}



// ===== 全局实例 =====

// 全局优化分析器实例
static OPTIMIZED_ANALYZER: OnceLock<OptimizedContentAnalyzer> = OnceLock::new();

// 获取优化分析器实例
fn get_optimized_analyzer() -> &'static OptimizedContentAnalyzer {
    OPTIMIZED_ANALYZER.get_or_init(|| {
        let config = AnalysisConfig::default();
        OptimizedContentAnalyzer::new(config)
    })
}



// HTML 特征分析结果
#[derive(Debug)]
struct HtmlFeatures {
    has_rich_content: bool,       // 包含图片、视频等
    has_complex_structure: bool,  // 包含表格、列表等
    has_multiple_links: bool,     // 包含多个链接
    has_meaningful_styling: bool, // 包含有意义的样式
}

// HTML内容分析结果
#[derive(Debug)]
struct HtmlContentAnalysis {
    content_similarity: f64,                    // 内容相似度 (0-1)
    tag_density: f64,                          // 标签密度
    html_text_ratio: f64,                      // HTML/文本长度比
    value_score: f64,                          // 价值评分 (0-10)
    redundancy_score: f64,                     // 冗余评分 (0-10)
    features: HtmlFeatures,                    // HTML特征
    detected_app: Option<DetectedApplication>, // 检测到的应用程序
    office_detection: Option<OfficeDetectionResult>, // Office专门检测结果
}

// 智能判断内容类型优先级
fn determine_content_priority(
    clipboard_state: &tauri_plugin_clipboard::Clipboard,
    has_files: bool,
    has_image: bool,
    has_html: bool,
    has_text: bool,
    has_rtf: bool,
) -> Result<Vec<&'static str>, String> {
    let mut priority = Vec::new();

    // 1. 文件类型始终优先级最高
    if has_files {
        priority.push("files");
    }

    // 2. 图像类型优先级较高
    if has_image {
        priority.push("image");
    }

    // 3. 智能判断 HTML vs Text
    if has_html && has_text {
        // 同时有 HTML 和 Text 时，需要智能判断
        match (clipboard_state.read_html(), clipboard_state.read_text()) {
            (Ok(html_content), Ok(text_content)) => {
                if should_prefer_html(&html_content, &text_content) {
                    priority.push("html");
                    // 不添加 text 作为备选，避免重复保存
                } else {
                    priority.push("text");
                    // 不添加 html 作为备选，避免重复保存
                }
            }
            (Ok(_), Err(_)) => priority.push("html"),
            (Err(_), Ok(_)) => priority.push("text"),
            (Err(_), Err(_)) => {
                // 都读取失败，按默认顺序
                priority.push("html");
            }
        }
    } else if has_html {
        priority.push("html");
    } else if has_text {
        priority.push("text");
    }

    // 4. RTF 优先级较低
    if has_rtf {
        priority.push("rtf");
    }

    Ok(priority)
}

// 判断是否应该优先使用 HTML 格式 - 优化版本（带性能控制）
fn should_prefer_html(html_content: &str, text_content: &str) -> bool {
    let analyzer = get_optimized_analyzer();
    
    // 使用优化分析器进行内容分析，带超时和大小控制
    match analyzer.analyze_with_monitoring(html_content, |html, monitor| {
        // 检查内容大小限制
        monitor.check_content_size(html)?;
        monitor.check_content_size(text_content)?;
        
        let html_lower = html.to_lowercase();
        let text_lower = text_content.to_lowercase();

        // 1. 使用优化的内容分析
        let html_analysis = analyze_html_content_optimized(&html_lower, &text_lower, monitor)?;

        println!("HTML Content Analysis (Optimized):");
        println!("  - Content similarity: {:.2}", html_analysis.content_similarity);
        println!("  - Tag density: {:.3}", html_analysis.tag_density);
        println!("  - HTML/Text ratio: {:.2}", html_analysis.html_text_ratio);
        println!("  - HTML length: {}", html_lower.len());
        println!("  - Text length: {}", text_lower.len());
        println!("  - Value score: {:.2}", html_analysis.value_score);
        println!("  - Redundancy score: {:.2}", html_analysis.redundancy_score);
        println!("  - Features: {:?}", html_analysis.features);

        // 2. 基于综合评分决策
        let decision = make_html_decision(&html_analysis);

        println!(
            "Decision: {} (Net Score: {:.2})",
            if decision { "HTML" } else { "TEXT" },
            html_analysis.value_score - html_analysis.redundancy_score
        );

        Ok(decision)
    }) {
        Ok(decision) => decision,
        Err(PerformanceError::AnalysisTimeout { timeout_ms }) => {
            println!("Analysis timed out after {}ms, using fallback decision", timeout_ms);
            // 超时时使用快速启发式决策
            fallback_html_decision(html_content, text_content)
        }
        Err(PerformanceError::ContentTooLarge { size, limit }) => {
            println!("Content too large ({} > {}), using fallback decision", size, limit);
            // 内容过大时使用快速启发式决策
            fallback_html_decision(html_content, text_content)
        }
        Err(e) => {
            println!("Analysis error: {:?}, using fallback decision", e);
            // 其他错误时使用保守决策（优先文本）
            false
        }
    }
}

// 快速启发式决策（用于超时或内容过大的情况）
fn fallback_html_decision(html_content: &str, text_content: &str) -> bool {
    let html_lower = html_content.to_lowercase();
    
    // 快速检测富媒体内容
    if html_lower.contains("<img") || html_lower.contains("<video") || html_lower.contains("<audio") {
        return true; // 有富媒体内容，优先HTML
    }
    
    // 快速检测AI聊天应用
    if html_lower.contains("data-testid=\"conversation") || html_lower.contains("chatgpt") {
        return false; // AI聊天应用，优先文本
    }
    
    // 快速检测Office应用
    if html_lower.contains("mso-") || html_lower.contains("xmlns:o=") {
        return false; // Office应用，优先文本
    }
    
    // 快速长度比较
    let html_len = html_content.len();
    let text_len = text_content.len();
    
    if html_len > text_len * 3 {
        return false; // HTML过长，可能冗余，优先文本
    }
    
    // 默认保守选择文本
    false
}



// 解码HTML实体的通用函数
fn decode_html_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&#x2F;", "/")
        .replace("&#x60;", "`")
        .replace("&#x3D;", "=")
}





// 优化版本的HTML内容分析（带性能监控）
fn analyze_html_content_optimized(
    html_lower: &str, 
    text_lower: &str, 
    monitor: &crate::performance_optimization::PerformanceMonitor
) -> Result<HtmlContentAnalysis, PerformanceError> {
    let analyzer = get_optimized_analyzer();
    
    // 检查超时
    monitor.check_timeout()?;
    
    let html_length = html_lower.len();
    let text_length = text_lower.len();
    let tag_count = html_lower.matches('<').count();

    // 1. 使用优化的相似度计算
    let content_similarity = analyzer.calculate_similarity_optimized(html_lower, text_lower, monitor)?;
    
    monitor.check_timeout()?;
    
    let tag_density = if text_length > 0 {
        tag_count as f64 / text_length as f64
    } else {
        0.0
    };
    let html_text_ratio = html_length as f64 / text_length.max(1) as f64;

    // 2. 分析HTML特征（优化版本）
    let features = analyze_html_features_optimized(html_lower, monitor)?;

    monitor.check_timeout()?;

    // 3. 计算价值评分 (0-10)
    let mut value_score: f64 = 0.0;

    if features.has_rich_content {
        value_score += 4.0;
    }
    if features.has_complex_structure {
        value_score += 3.0;
    }
    if features.has_multiple_links {
        value_score += 2.0;
    }
    if features.has_meaningful_styling {
        value_score += 2.0;
    }
    if content_similarity < 0.7 {
        value_score += 1.0;
    }

    // 4. 使用优化的应用程序检测
    let detected_app_name = analyzer.detect_application_optimized(html_lower, monitor)?;
    
    monitor.check_timeout()?;

    // 5. 计算冗余评分（简化版本以提高性能）
    let mut redundancy_score = calculate_redundancy_score_optimized(html_lower, &detected_app_name, monitor)?;

    // 基于检测到的应用程序调整冗余评分
    if let Some(ref app_name) = detected_app_name {
        match app_name.as_str() {
            "ChatGPT" => redundancy_score += 3.0,
            "MicrosoftOffice" => redundancy_score += 2.5,
            "AppleEcosystem" => redundancy_score += 1.5,
            _ => redundancy_score += 1.0,
        }
    }

    // 高相似度增加冗余评分
    if content_similarity > 0.8 {
        redundancy_score += 2.0;
    }
    if content_similarity > 0.95 {
        redundancy_score += 3.0;
    }

    // 限制评分范围
    value_score = value_score.min(10.0);
    redundancy_score = redundancy_score.min(10.0);

    // 创建简化的检测结果（为了兼容现有代码）
    let detected_app = detected_app_name.map(|name| DetectedApplication {
        app_type: match name.as_str() {
            "ChatGPT" => ApplicationType::ChatGPT,
            "MicrosoftOffice" => ApplicationType::MicrosoftOffice,
            "AppleEcosystem" => ApplicationType::AppleEcosystem,
            _ => ApplicationType::Unknown,
        },
        confidence: 0.8, // 简化的置信度
        detected_patterns: Vec::new(),
        total_score: redundancy_score,
    });

    Ok(HtmlContentAnalysis {
        content_similarity,
        tag_density,
        html_text_ratio,
        value_score,
        redundancy_score,
        features,
        detected_app,
        office_detection: None, // 简化版本不包含详细Office检测
    })
}

// 优化版本的HTML特征分析
fn analyze_html_features_optimized(
    html_lower: &str, 
    monitor: &crate::performance_optimization::PerformanceMonitor
) -> Result<HtmlFeatures, PerformanceError> {
    monitor.check_timeout()?;

    // 富媒体内容检测（优化版本）
    let rich_media_tags = ["<img", "<video", "<audio", "<iframe", "<embed", "<object", "<canvas", "<svg"];
    let has_rich_content = rich_media_tags.iter().any(|tag| html_lower.contains(tag));

    monitor.check_timeout()?;

    // 复杂结构检测（优化版本）
    let structure_tags = ["<table", "<ul", "<ol", "<dl", "<nav", "<section", "<article"];
    let has_complex_structure = structure_tags.iter().any(|tag| html_lower.contains(tag));

    monitor.check_timeout()?;

    // 链接计数（简化版本）
    let link_count = html_lower.matches("<a ").count();
    let has_multiple_links = link_count > 2;

    // 有意义样式检测（简化版本）
    let meaningful_styles = ["background-color:", "border:", "margin:", "padding:", "color:", "font-weight:"];
    let has_meaningful_styling = meaningful_styles.iter().any(|style| html_lower.contains(style));

    Ok(HtmlFeatures {
        has_rich_content,
        has_complex_structure,
        has_multiple_links,
        has_meaningful_styling,
    })
}

// 优化版本的冗余评分计算
fn calculate_redundancy_score_optimized(
    html_lower: &str,
    detected_app_name: &Option<String>,
    monitor: &crate::performance_optimization::PerformanceMonitor,
) -> Result<f64, PerformanceError> {
    monitor.check_timeout()?;

    let mut redundancy_score: f64 = 0.0;

    // 快速检测常见冗余指标
    let redundancy_indicators = [
        ("mso-", 3.0),
        ("microsoft", 2.5),
        ("office", 2.5),
        ("xmlns:o=", 3.5),
        ("<!--[if", 3.5),
        ("apple-converted-space", 2.5),
        ("webkit-", 2.0),
        ("chatgpt", 3.0),
        ("conversation-turn", 4.0),
        ("data-testid=\"conversation", 4.0),
    ];

    for (indicator, score) in redundancy_indicators {
        if html_lower.contains(indicator) {
            redundancy_score += score;
        }
        
        // 每几个检查一次超时
        monitor.check_timeout()?;
    }

    // 基于检测到的应用程序调整评分
    if let Some(ref app_name) = detected_app_name {
        match app_name.as_str() {
            "ChatGPT" => redundancy_score += 2.0,
            "MicrosoftOffice" => redundancy_score += 1.5,
            "AppleEcosystem" => redundancy_score += 1.0,
            _ => redundancy_score += 0.5,
        }
    }

    Ok(redundancy_score.min(10.0))
}



// 基于分析结果做出决策 - 智能决策算法（平衡精度与实用性）
fn make_html_decision(analysis: &HtmlContentAnalysis) -> bool {
    let net_score = analysis.value_score - analysis.redundancy_score;

    println!("Decision Analysis:");
    println!("  - Net score: {:.2}", net_score);
    println!("  - Content similarity: {:.2}", analysis.content_similarity);
    println!("  - Redundancy score: {:.2}", analysis.redundancy_score);
    println!("  - Value score: {:.2}", analysis.value_score);
    
    // 输出检测到的应用程序信息
    if let Some(ref detected_app) = analysis.detected_app {
        println!("  - Detected app: {:?} (confidence: {:.2}, score: {:.2})", 
                detected_app.app_type, detected_app.confidence, detected_app.total_score);
        for pattern_match in &detected_app.detected_patterns {
            println!("    * Pattern: {} (matches: {}, confidence: {:.2})", 
                    pattern_match.pattern.description, pattern_match.match_count, pattern_match.confidence);
        }
        
        // 如果是Office应用程序，输出详细的Office检测信息
        if detected_app.app_type == ApplicationType::MicrosoftOffice {
            if let Some(ref office_result) = analysis.office_detection {
                println!("  - Office Details: {:?} app, redundancy level: {:?}", 
                        office_result.specific_app, office_result.redundancy_level);
                println!("    Office features detected:");
                for feature in &office_result.detected_features {
                    println!("      * {}: {} (matches: {}, score: {:.2})", 
                            feature.feature_type, feature.pattern, feature.match_count, feature.score);
                }
            }
        }
    } else {
        println!("  - No specific application detected");
    }

    // === 最高优先级：强制优先文本的情况（避免冗余HTML） ===

    // 1. 完美相似度检测（ChatGPT等聊天应用的典型特征）
    if analysis.content_similarity >= 0.98 && analysis.redundancy_score > 2.0 {
        println!("  - Perfect similarity with redundancy -> TEXT (highest priority)");
        return false;
    }

    // 2. 基于检测到的应用程序类型进行智能判断
    if let Some(ref detected_app) = analysis.detected_app {
        match detected_app.app_type {
            ApplicationType::ChatGPT => {
                if detected_app.confidence > 0.7 && analysis.content_similarity > 0.8 {
                    println!("  - ChatGPT content detected (confidence: {:.2}) -> TEXT (highest priority)", detected_app.confidence);
                    return false;
                }
            }
            ApplicationType::MicrosoftOffice => {
                // 使用专门的Office检测结果进行更精确的判断
                if let Some(ref office_result) = analysis.office_detection {
                    match office_result.redundancy_level {
                        OfficeRedundancyLevel::High => {
                            if analysis.content_similarity > 0.85 {
                                println!("  - High redundancy Office content detected ({:?}, confidence: {:.2}) -> TEXT (highest priority)", 
                                        office_result.specific_app, office_result.confidence);
                                return false;
                            }
                        }
                        OfficeRedundancyLevel::Medium => {
                            if analysis.content_similarity > 0.9 && analysis.value_score < 3.0 {
                                println!("  - Medium redundancy Office content detected ({:?}, confidence: {:.2}) -> TEXT (high priority)", 
                                        office_result.specific_app, office_result.confidence);
                                return false;
                            }
                        }
                        OfficeRedundancyLevel::Low => {
                            // 低冗余的Office内容可能有价值，需要更谨慎的判断
                            if analysis.content_similarity > 0.95 && analysis.value_score < 2.0 {
                                println!("  - Low redundancy Office content detected ({:?}, confidence: {:.2}) -> TEXT (moderate priority)", 
                                        office_result.specific_app, office_result.confidence);
                                return false;
                            }
                        }
                        OfficeRedundancyLevel::None => {
                            // 无冗余的Office内容通常有价值，保持HTML格式
                        }
                    }
                } else if detected_app.confidence > 0.8 && analysis.content_similarity > 0.9 {
                    println!("  - Microsoft Office content detected (confidence: {:.2}) -> TEXT (high priority)", detected_app.confidence);
                    return false;
                }
            }
            ApplicationType::AppleEcosystem => {
                // Apple应用程序的HTML通常质量较高，需要更谨慎的判断
                if detected_app.confidence > 0.9 && analysis.content_similarity > 0.95 && analysis.value_score < 2.0 {
                    println!("  - Apple ecosystem content detected (confidence: {:.2}) -> TEXT (moderate priority)", detected_app.confidence);
                    return false;
                }
            }
            _ => {}
        }
    }

    // 3. 专门针对ChatGPT等AI聊天应用的检测（高优先级，保留原有逻辑作为补充）
    if analysis.redundancy_score > 4.5 && analysis.content_similarity > 0.8 {
        println!("  - AI chat application content detected -> TEXT (highest priority)");
        return false;
    }

    // 3. 超高冗余且无价值特征
    if analysis.redundancy_score > 6.0 && analysis.value_score < 2.0 {
        println!("  - Very high redundancy with low value -> TEXT (highest priority)");
        return false;
    }

    // === 强制优先HTML的情况（仅在没有被上述规则拦截时） ===

    // 1. 富媒体内容 - 绝对需要HTML
    if analysis.features.has_rich_content {
        println!("  - Rich content detected -> HTML (forced)");
        return true;
    }

    // 2. 复杂结构且比例合理，但要排除聊天应用
    if analysis.features.has_complex_structure
        && analysis.html_text_ratio < 3.0
        && analysis.redundancy_score < 4.0
        && analysis.content_similarity < 0.8
    {
        println!("  - Complex structure with reasonable ratio (non-chat) -> HTML (forced)");
        return true;
    }

    // === 智能评分决策 ===

    // 基于净评分的分层决策
    if net_score > 3.0 {
        println!("  - High net score -> HTML");
        return true;
    }

    if net_score < -2.0 {
        println!("  - Very negative net score -> TEXT");
        return false;
    }

    // 边界情况的细致判断
    if net_score > -1.0 && net_score <= 1.0 {
        // 在边界区域，更倾向于保守选择文本，除非有明确的HTML价值
        if analysis.content_similarity < 0.6 && analysis.value_score > 2.0 {
            println!("  - Boundary case with low similarity and some value -> HTML");
            return true;
        }
        println!("  - Boundary case, conservative choice -> TEXT");
        return false;
    }

    // 最终默认：基于净评分
    let decision = net_score > 0.0;
    println!(
        "  - Default decision based on net score -> {}",
        if decision { "HTML" } else { "TEXT" }
    );

    decision
}


fn cache_app_icon_if_needed(app_handle: &AppHandle, bundle_id: &str, app_name: Option<&str>) {
    if bundle_id == "unknown.bundle.id" {
        return;
    }

    if let Ok(conn) = init_database(app_handle) {
        // 检查是否已经缓存
        if get_cached_app_icon(&conn, bundle_id).is_none() {
            // 获取图标
            let (_, icon_base64) = get_app_icon(bundle_id);
            if let Some(icon_data) = icon_base64 {
                let _ = cache_app_icon(&conn, bundle_id, app_name, &icon_data);
                println!("已缓存应用图标: {}", bundle_id);
            }
        }
    }
}

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

/// 计算内容的SHA256哈希值
fn calculate_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();

    // 转换为十六进制字符串
    let mut hex_string = String::new();
    for byte in result {
        write!(&mut hex_string, "{:02x}", byte).unwrap();
    }
    hex_string
}

// 剪切板变化
fn handle_clipboard_change(app_handle: &AppHandle) -> Result<bool, String> {
    let clipboard_state = app_handle.state::<tauri_plugin_clipboard::Clipboard>();
    let clipboard_type = clipboard_state.available_types()?;

    // 初始化数据库连接
    let conn = init_database(&app_handle)?;

    // 获取当前时间作为时间戳
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 获取当前前台应用信息
    let (source_app, source_bundle_id) = match get_frontmost_app() {
        Ok(app_info) => {
            println!(
                "剪切板内容来自应用: {} ({})",
                app_info.name, app_info.bundle_id
            );
            (Some(app_info.name), Some(app_info.bundle_id))
        }
        Err(e) => {
            println!("获取前台应用失败: {}", e);
            (None, None)
        }
    };

    println!("clipboard_type: {:?}", clipboard_type);

    // 智能判断内容类型优先级
    let content_priority = determine_content_priority(
        &clipboard_state,
        clipboard_type.files,
        clipboard_type.image,
        clipboard_type.html,
        clipboard_type.text,
        clipboard_type.rtf,
    )?;

    println!("Determined content priority: {:?}", content_priority);

    let mut saved = false;
    let mut actually_saved = false; // 新增：跟踪是否真的保存了新数据

    // 按照智能优先级处理内容
    for ty in content_priority {
        if !saved {
            println!("Processing clipboard type: {}", ty);

            match ty {
                "image" => {
                    if let Ok(image_base64) = clipboard_state.read_image_base64() {
                        if !image_base64.is_empty() {
                            let content_hash = calculate_content_hash(&image_base64);
                            let preview = "图像内容".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "image".to_string(),
                                content: image_base64,
                                content_hash: Some(content_hash),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                                source_app: source_app.clone(),
                                source_bundle_id: source_bundle_id.clone(),
                                app_icon_base64: None,
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => {
                                    println!("图像已保存到数据库，ID: {}", id);
                                    actually_saved = true;

                                    // 缓存应用图标
                                    if let Some(ref bundle_id) = source_bundle_id {
                                        cache_app_icon_if_needed(
                                            &app_handle,
                                            bundle_id,
                                            source_app.as_deref(),
                                        );
                                    }
                                }
                                Err(e) => {
                                    if e == "内容重复" {
                                        println!("图像内容重复，跳过保存");
                                    } else {
                                        eprintln!("保存图像失败: {}", e);
                                    }
                                }
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "rtf" => {
                    if let Ok(rtf) = clipboard_state.read_rtf() {
                        if !rtf.is_empty() {
                            let content_hash = calculate_content_hash(&rtf);
                            let preview = "RTF格式文本".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "rtf".to_string(),
                                content: rtf,
                                content_hash: Some(content_hash),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                                source_app: source_app.clone(),
                                source_bundle_id: source_bundle_id.clone(),
                                app_icon_base64: None,
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => {
                                    println!("RTF已保存到数据库，ID: {}", id);
                                    actually_saved = true;
                                }
                                Err(e) => {
                                    if e == "内容重复" {
                                        println!("RTF内容重复，跳过保存");
                                    } else {
                                        eprintln!("保存RTF失败: {}", e);
                                    }
                                }
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
                            let content_hash = calculate_content_hash(&files_json);
                            let preview = if files.len() == 1 {
                                format!("1个文件: {}", files[0])
                            } else {
                                format!("{}个文件", files.len())
                            };
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "files".to_string(),
                                content: files_json,
                                content_hash: Some(content_hash),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                                source_app: source_app.clone(),
                                source_bundle_id: source_bundle_id.clone(),
                                app_icon_base64: None,
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => {
                                    println!("文件列表已保存到数据库，ID: {}", id);
                                    actually_saved = true;
                                }
                                Err(e) => {
                                    if e == "内容重复" {
                                        println!("文件列表内容重复，跳过保存");
                                    } else {
                                        eprintln!("保存文件列表失败: {}", e);
                                    }
                                }
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "text" => {
                    if let Ok(text) = clipboard_state.read_text() {
                        if !text.is_empty() {
                            let content_hash = calculate_content_hash(&text);
                            let preview = generate_preview(&text, 100);
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "text".to_string(),
                                content: text,
                                content_hash: Some(content_hash),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                                source_app: source_app.clone(),
                                source_bundle_id: source_bundle_id.clone(),
                                app_icon_base64: None,
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => {
                                    println!("文本已保存到数据库，ID: {}", id);
                                    actually_saved = true;
                                }
                                Err(e) => {
                                    if e == "内容重复" {
                                        println!("文本内容重复，跳过保存");
                                    } else {
                                        eprintln!("保存文本失败: {}", e);
                                    }
                                }
                            }
                            saved = true;
                            break;
                        }
                    }
                }
                "html" => {
                    if let Ok(html) = clipboard_state.read_html() {
                        if !html.is_empty() {
                            let cleaned_html = fallback_strip_head_and_meta(&html);
                            let content_hash = calculate_content_hash(&cleaned_html);
                            let preview = "HTML内容".to_string();
                            let history_item = ClipboardHistoryItem {
                                id: None,
                                content_type: "html".to_string(),
                                content: cleaned_html,
                                content_hash: Some(content_hash),
                                preview: Some(preview),
                                timestamp: timestamp.clone(),
                                source_app: source_app.clone(),
                                source_bundle_id: source_bundle_id.clone(),
                                app_icon_base64: None,
                            };
                            match save_to_database(&conn, &history_item) {
                                Ok(id) => {
                                    println!("HTML已保存到数据库，ID: {}", id);
                                    actually_saved = true;
                                }
                                Err(e) => {
                                    if e == "内容重复" {
                                        println!("HTML内容重复，跳过保存");
                                    } else {
                                        eprintln!("保存HTML失败: {}", e);
                                    }
                                }
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
    Ok(actually_saved)
}

pub fn setup_clipboard_monitor(app_handle: AppHandle) -> Result<(), String> {
    // 启动监听
    start_clipboard_monitor(app_handle.clone())?;

    // 监听剪贴板更新事件
    app_handle
        .clone()
        .listen("plugin:clipboard://clipboard-monitor/update", move |_| {
            match handle_clipboard_change(&app_handle) {
                Ok(saved) => {
                    // 只有当内容真的被保存时才通知前端更新
                    if saved {
                        if let Err(e) = app_handle.emit("clipboard-updated", ()) {
                            eprintln!("通知前端剪切板更新失败: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("处理剪贴板变化出错: {}", e);
                }
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
    offset: Option<u32>,
    content_type: Option<String>,
) -> Result<Vec<ClipboardHistoryItem>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);

    // 获取数据库连接
    let conn = init_database(&app)?;

    // 根据是否提供了 content_type 选择不同的 SQL，使用 LEFT JOIN 获取图标
    let sql = if content_type.is_some() {
        "SELECT h.id, h.content_type, h.content, h.content_hash, h.preview, h.timestamp, 
                h.source_app, h.source_bundle_id, i.icon_base64
         FROM clipboard_history h 
         LEFT JOIN app_icons i ON h.source_bundle_id = i.bundle_id
         WHERE h.content_type = ?1 ORDER BY h.id DESC LIMIT ?2 OFFSET ?3"
    } else {
        "SELECT h.id, h.content_type, h.content, h.content_hash, h.preview, h.timestamp, 
                h.source_app, h.source_bundle_id, i.icon_base64
         FROM clipboard_history h 
         LEFT JOIN app_icons i ON h.source_bundle_id = i.bundle_id
         ORDER BY h.id DESC LIMIT ?1 OFFSET ?2"
    };

    // 定义统一的映射闭包
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<ClipboardHistoryItem> {
        let content: String = row.get(2)?;
        let content_type: String = row.get(1)?;

        // 对文本和HTML内容进行HTML实体解码
        let decoded_content = if content_type == "text" || content_type == "html" {
            decode_html_entities(&content)
        } else {
            content
        };

        Ok(ClipboardHistoryItem {
            id: Some(row.get(0)?),
            content_type,
            content: decoded_content,
            content_hash: row.get::<_, Option<String>>(3)?,
            preview: row.get(4)?,
            timestamp: row.get(5)?,
            source_app: row.get::<_, Option<String>>(6)?,
            source_bundle_id: row.get::<_, Option<String>>(7)?,
            app_icon_base64: row.get::<_, Option<String>>(8)?,
        })
    };

    // 准备查询语句
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("准备查询失败: {}", e))?;

    // 执行查询，根据是否有 content_type 传递不同的参数
    let rows = if let Some(typ) = content_type.as_deref() {
        stmt.query_map(params![typ, limit, offset], map_row)
    } else {
        stmt.query_map(params![limit, offset], map_row)
    }
    .map_err(|e| format!("查询失败: {}", e))?;

    // 收集查询结果
    let mut items = Vec::new();
    for item in rows {
        items.push(item.map_err(|e| format!("处理行数据失败: {}", e))?);
    }

    Ok(items)
}
