use std::time::Instant;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::fmt;

// 性能优化相关错误类型
#[derive(Debug)]
#[allow(dead_code)]
pub enum PerformanceError {
    AnalysisTimeout { timeout_ms: u64 },
    ContentTooLarge { size: usize, limit: usize },
    MonitoringError(String),
}

impl fmt::Display for PerformanceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PerformanceError::AnalysisTimeout { timeout_ms } => {
                write!(f, "分析超时: 处理时间超过 {}ms", timeout_ms)
            }
            PerformanceError::ContentTooLarge { size, limit } => {
                write!(f, "内容过大: 大小 {} 超过限制 {}", size, limit)
            }
            PerformanceError::MonitoringError(msg) => {
                write!(f, "性能监控错误: {}", msg)
            }
        }
    }
}

impl std::error::Error for PerformanceError {}

// 分析配置
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AnalysisConfig {
    pub similarity_threshold: f64,        // 默认: 0.95
    pub analysis_timeout_ms: u64,         // 默认: 200
    pub max_content_size: usize,          // 默认: 1MB
    pub enable_app_detection: bool,       // 默认: true
    pub enable_redundancy_scoring: bool,  // 默认: true
    pub log_analysis_details: bool,       // 默认: false
}

impl Default for AnalysisConfig {
    fn default() -> Self {
        Self {
            similarity_threshold: 0.95,
            analysis_timeout_ms: 200,
            max_content_size: 1024 * 1024, // 1MB
            enable_app_detection: true,
            enable_redundancy_scoring: true,
            log_analysis_details: false,
        }
    }
}

// 性能监控器
#[derive(Debug)]
pub struct PerformanceMonitor {
    start_time: Instant,
    timeout_ms: u64,
    max_content_size: usize,
    analysis_count: Arc<AtomicU64>,
    total_time_ms: Arc<AtomicU64>,
}

impl PerformanceMonitor {
    pub fn new(config: &AnalysisConfig) -> Self {
        Self {
            start_time: Instant::now(),
            timeout_ms: config.analysis_timeout_ms,
            max_content_size: config.max_content_size,
            analysis_count: Arc::new(AtomicU64::new(0)),
            total_time_ms: Arc::new(AtomicU64::new(0)),
        }
    }

    // 检查是否超时
    pub fn check_timeout(&self) -> Result<(), PerformanceError> {
        let elapsed = self.start_time.elapsed();
        if elapsed.as_millis() as u64 > self.timeout_ms {
            return Err(PerformanceError::AnalysisTimeout {
                timeout_ms: self.timeout_ms,
            });
        }
        Ok(())
    }

    // 检查内容大小限制
    pub fn check_content_size(&self, content: &str) -> Result<(), PerformanceError> {
        let size = content.len();
        if size > self.max_content_size {
            return Err(PerformanceError::ContentTooLarge {
                size,
                limit: self.max_content_size,
            });
        }
        Ok(())
    }

    // 获取剩余时间（毫秒）
    #[allow(dead_code)]
    pub fn remaining_time_ms(&self) -> u64 {
        let elapsed = self.start_time.elapsed().as_millis() as u64;
        if elapsed >= self.timeout_ms {
            0
        } else {
            self.timeout_ms - elapsed
        }
    }

    // 记录分析完成
    pub fn record_completion(&self) {
        let elapsed = self.start_time.elapsed().as_millis() as u64;
        self.analysis_count.fetch_add(1, Ordering::Relaxed);
        self.total_time_ms.fetch_add(elapsed, Ordering::Relaxed);
    }

    // 获取平均处理时间
    #[allow(dead_code)]
    pub fn average_time_ms(&self) -> f64 {
        let count = self.analysis_count.load(Ordering::Relaxed);
        let total = self.total_time_ms.load(Ordering::Relaxed);
        if count == 0 {
            0.0
        } else {
            total as f64 / count as f64
        }
    }

    // 获取处理次数
    #[allow(dead_code)]
    pub fn analysis_count(&self) -> u64 {
        self.analysis_count.load(Ordering::Relaxed)
    }
}

// 优化的内容分析器
pub struct OptimizedContentAnalyzer {
    config: AnalysisConfig,
}

impl OptimizedContentAnalyzer {
    pub fn new(config: AnalysisConfig) -> Self {
        Self { config }
    }

    // 带性能监控的内容分析
    pub fn analyze_with_monitoring<F, R>(&self, content: &str, analysis_fn: F) -> Result<R, PerformanceError>
    where
        F: FnOnce(&str, &PerformanceMonitor) -> Result<R, PerformanceError>,
    {
        let monitor = PerformanceMonitor::new(&self.config);
        
        // 检查内容大小
        monitor.check_content_size(content)?;
        
        // 执行分析
        let result = analysis_fn(content, &monitor)?;
        
        // 记录完成
        monitor.record_completion();
        
        if self.config.log_analysis_details {
            println!("Analysis completed in {}ms", monitor.start_time.elapsed().as_millis());
        }
        
        Ok(result)
    }

    // 优化的相似度计算（带超时控制）
    pub fn calculate_similarity_optimized(
        &self,
        html: &str,
        text: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<f64, PerformanceError> {
        monitor.check_timeout()?;

        // 如果内容过大，使用快速启发式算法
        if html.len() > 50000 || text.len() > 50000 {
            return self.calculate_similarity_fast(html, text, monitor);
        }

        // 标准相似度计算
        self.calculate_similarity_standard(html, text, monitor)
    }

    // 快速相似度计算（用于大内容）
    fn calculate_similarity_fast(
        &self,
        html: &str,
        text: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<f64, PerformanceError> {
        monitor.check_timeout()?;

        // 使用采样方法进行快速比较
        let sample_size = 1000.min(html.len()).min(text.len());
        let html_sample = &html[..sample_size];
        let text_sample = &text[..sample_size];

        // 简单的字符匹配率
        let mut matches = 0;
        let chars1: Vec<char> = html_sample.chars().collect();
        let chars2: Vec<char> = text_sample.chars().collect();
        
        let min_len = chars1.len().min(chars2.len());
        for i in 0..min_len {
            if chars1[i] == chars2[i] {
                matches += 1;
            }
            
            // 每100次比较检查一次超时
            if i % 100 == 0 {
                monitor.check_timeout()?;
            }
        }

        Ok(matches as f64 / min_len as f64)
    }

    // 标准相似度计算
    fn calculate_similarity_standard(
        &self,
        html: &str,
        text: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<f64, PerformanceError> {
        monitor.check_timeout()?;

        // 提取HTML中的文本
        let html_text = self.extract_text_from_html_optimized(html, monitor)?;
        let text_clean = text.split_whitespace().collect::<Vec<&str>>().join(" ");

        if html_text.is_empty() || text_clean.is_empty() {
            return Ok(0.0);
        }

        monitor.check_timeout()?;

        // 使用优化的Jaccard相似度计算
        let similarity = self.calculate_jaccard_similarity(&html_text, &text_clean, monitor)?;
        
        Ok(similarity)
    }

    // 优化的HTML文本提取
    fn extract_text_from_html_optimized(
        &self,
        html: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<String, PerformanceError> {
        monitor.check_timeout()?;

        // 如果HTML过大，只处理前面部分
        let html_to_process = if html.len() > 100000 {
            &html[..100000]
        } else {
            html
        };

        // 简化的HTML标签移除（避免复杂正则表达式）
        let mut result = String::with_capacity(html_to_process.len() / 2);
        let mut in_tag = false;
        let mut in_script_or_style = false;
        let mut tag_name = String::new();

        for (i, ch) in html_to_process.char_indices() {
            // 每1000个字符检查一次超时
            if i % 1000 == 0 {
                monitor.check_timeout()?;
            }

            match ch {
                '<' => {
                    in_tag = true;
                    tag_name.clear();
                }
                '>' => {
                    if in_tag {
                        in_tag = false;
                        // 检查是否是script或style标签
                        let tag_lower = tag_name.to_lowercase();
                        if tag_lower.starts_with("script") || tag_lower.starts_with("style") {
                            in_script_or_style = true;
                        } else if tag_lower.starts_with("/script") || tag_lower.starts_with("/style") {
                            in_script_or_style = false;
                        }
                    }
                }
                _ => {
                    if in_tag {
                        tag_name.push(ch);
                    } else if !in_script_or_style {
                        result.push(ch);
                    }
                }
            }
        }

        // 清理空白字符
        let cleaned = result
            .split_whitespace()
            .collect::<Vec<&str>>()
            .join(" ");

        Ok(cleaned)
    }

    // 优化的Jaccard相似度计算
    fn calculate_jaccard_similarity(
        &self,
        text1: &str,
        text2: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<f64, PerformanceError> {
        monitor.check_timeout()?;

        use std::collections::HashSet;

        let words1: HashSet<&str> = text1.split_whitespace().collect();
        let words2: HashSet<&str> = text2.split_whitespace().collect();

        monitor.check_timeout()?;

        let intersection = words1.intersection(&words2).count();
        let union = words1.union(&words2).count();

        if union == 0 {
            Ok(0.0)
        } else {
            Ok(intersection as f64 / union as f64)
        }
    }

    // 优化的应用程序检测（带超时控制）
    pub fn detect_application_optimized(
        &self,
        html: &str,
        monitor: &PerformanceMonitor,
    ) -> Result<Option<String>, PerformanceError> {
        monitor.check_timeout()?;

        if !self.config.enable_app_detection {
            return Ok(None);
        }

        // 快速检测常见模式
        let html_lower = html.to_lowercase();
        
        // 检查ChatGPT模式
        if html_lower.contains("data-testid=\"conversation-turn") 
            || html_lower.contains("markdown prose w-full") {
            return Ok(Some("ChatGPT".to_string()));
        }

        monitor.check_timeout()?;

        // 检查Office模式
        if html_lower.contains("mso-") 
            || html_lower.contains("xmlns:o=") 
            || html_lower.contains("<!--[if") {
            return Ok(Some("MicrosoftOffice".to_string()));
        }

        monitor.check_timeout()?;

        // 检查Apple模式
        if html_lower.contains("apple-converted-space") 
            || html_lower.contains("webkit-") {
            return Ok(Some("AppleEcosystem".to_string()));
        }

        Ok(None)
    }
}

// 性能基准测试结构
#[derive(Debug)]
#[allow(dead_code)]
pub struct PerformanceBenchmark {
    pub test_name: String,
    pub content_size: usize,
    pub processing_time_ms: u64,
    pub success: bool,
    pub error_message: Option<String>,
}

impl PerformanceBenchmark {
    #[allow(dead_code)]
    pub fn new(test_name: String, content_size: usize) -> Self {
        Self {
            test_name,
            content_size,
            processing_time_ms: 0,
            success: false,
            error_message: None,
        }
    }

    #[allow(dead_code)]
    pub fn record_success(&mut self, processing_time_ms: u64) {
        self.processing_time_ms = processing_time_ms;
        self.success = true;
        self.error_message = None;
    }

    #[allow(dead_code)]
    pub fn record_failure(&mut self, processing_time_ms: u64, error: String) {
        self.processing_time_ms = processing_time_ms;
        self.success = false;
        self.error_message = Some(error);
    }
}

// 性能基准测试套件
#[allow(dead_code)]
pub struct PerformanceBenchmarkSuite {
    config: AnalysisConfig,
    analyzer: OptimizedContentAnalyzer,
}

impl PerformanceBenchmarkSuite {
    #[allow(dead_code)]
    pub fn new(config: AnalysisConfig) -> Self {
        let analyzer = OptimizedContentAnalyzer::new(config.clone());
        Self { config, analyzer }
    }

    // 运行基准测试
    #[allow(dead_code)]
    pub fn run_benchmarks(&self) -> Vec<PerformanceBenchmark> {
        let mut results = Vec::new();

        // 测试1: 小内容处理
        results.push(self.benchmark_small_content());

        // 测试2: 中等内容处理
        results.push(self.benchmark_medium_content());

        // 测试3: 大内容处理
        results.push(self.benchmark_large_content());

        // 测试4: 相似度计算性能
        results.push(self.benchmark_similarity_calculation());

        // 测试5: 应用程序检测性能
        results.push(self.benchmark_app_detection());

        results
    }

    fn benchmark_small_content(&self) -> PerformanceBenchmark {
        let mut benchmark = PerformanceBenchmark::new("Small Content".to_string(), 1000);
        let content = "a".repeat(1000);
        
        let start = Instant::now();
        match self.analyzer.analyze_with_monitoring(&content, |content, monitor| {
            self.analyzer.calculate_similarity_optimized(content, "test", monitor)
        }) {
            Ok(_) => benchmark.record_success(start.elapsed().as_millis() as u64),
            Err(e) => benchmark.record_failure(start.elapsed().as_millis() as u64, format!("{:?}", e)),
        }

        benchmark
    }

    fn benchmark_medium_content(&self) -> PerformanceBenchmark {
        let mut benchmark = PerformanceBenchmark::new("Medium Content".to_string(), 50000);
        let content = "a".repeat(50000);
        
        let start = Instant::now();
        match self.analyzer.analyze_with_monitoring(&content, |content, monitor| {
            self.analyzer.calculate_similarity_optimized(content, "test", monitor)
        }) {
            Ok(_) => benchmark.record_success(start.elapsed().as_millis() as u64),
            Err(e) => benchmark.record_failure(start.elapsed().as_millis() as u64, format!("{:?}", e)),
        }

        benchmark
    }

    fn benchmark_large_content(&self) -> PerformanceBenchmark {
        let mut benchmark = PerformanceBenchmark::new("Large Content".to_string(), 500000);
        let content = "a".repeat(500000);
        
        let start = Instant::now();
        match self.analyzer.analyze_with_monitoring(&content, |content, monitor| {
            self.analyzer.calculate_similarity_optimized(content, "test", monitor)
        }) {
            Ok(_) => benchmark.record_success(start.elapsed().as_millis() as u64),
            Err(e) => benchmark.record_failure(start.elapsed().as_millis() as u64, format!("{:?}", e)),
        }

        benchmark
    }

    fn benchmark_similarity_calculation(&self) -> PerformanceBenchmark {
        let mut benchmark = PerformanceBenchmark::new("Similarity Calculation".to_string(), 10000);
        let html = format!("<div>{}</div>", "test content ".repeat(1000));
        let text = "test content ".repeat(1000);
        
        let start = Instant::now();
        match self.analyzer.analyze_with_monitoring(&html, |html, monitor| {
            self.analyzer.calculate_similarity_optimized(html, &text, monitor)
        }) {
            Ok(_) => benchmark.record_success(start.elapsed().as_millis() as u64),
            Err(e) => benchmark.record_failure(start.elapsed().as_millis() as u64, format!("{:?}", e)),
        }

        benchmark
    }

    fn benchmark_app_detection(&self) -> PerformanceBenchmark {
        let mut benchmark = PerformanceBenchmark::new("App Detection".to_string(), 5000);
        let content = format!(
            r#"<div data-testid="conversation-turn" class="markdown prose w-full">{}</div>"#,
            "content ".repeat(500)
        );
        
        let start = Instant::now();
        match self.analyzer.analyze_with_monitoring(&content, |content, monitor| {
            self.analyzer.detect_application_optimized(content, monitor)
        }) {
            Ok(_) => benchmark.record_success(start.elapsed().as_millis() as u64),
            Err(e) => benchmark.record_failure(start.elapsed().as_millis() as u64, format!("{:?}", e)),
        }

        benchmark
    }

    // 打印基准测试结果
    #[allow(dead_code)]
    pub fn print_results(&self, results: &[PerformanceBenchmark]) {
        println!("\n=== Performance Benchmark Results ===");
        println!("Target: Analysis should complete within {}ms", self.config.analysis_timeout_ms);
        println!("Max content size: {} bytes", self.config.max_content_size);
        println!();

        for result in results {
            let status = if result.success { "✓ PASS" } else { "✗ FAIL" };
            let time_status = if result.processing_time_ms <= self.config.analysis_timeout_ms {
                "✓"
            } else {
                "✗"
            };

            println!("{} {} - {} bytes - {}ms {}", 
                status, 
                result.test_name, 
                result.content_size, 
                result.processing_time_ms,
                time_status
            );

            if let Some(ref error) = result.error_message {
                println!("    Error: {}", error);
            }
        }

        // 统计信息
        let total_tests = results.len();
        let passed_tests = results.iter().filter(|r| r.success).count();
        let within_time_limit = results.iter()
            .filter(|r| r.processing_time_ms <= self.config.analysis_timeout_ms)
            .count();

        println!();
        println!("Summary:");
        println!("  Tests passed: {}/{}", passed_tests, total_tests);
        println!("  Within time limit: {}/{}", within_time_limit, total_tests);
        
        if total_tests > 0 {
            let avg_time: f64 = results.iter()
                .map(|r| r.processing_time_ms as f64)
                .sum::<f64>() / total_tests as f64;
            println!("  Average time: {:.1}ms", avg_time);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_performance_monitor_timeout() {
        let config = AnalysisConfig {
            analysis_timeout_ms: 10, // 10ms timeout for testing
            ..Default::default()
        };
        let monitor = PerformanceMonitor::new(&config);
        
        // Should not timeout immediately
        assert!(monitor.check_timeout().is_ok());
        
        // Wait longer than timeout
        std::thread::sleep(Duration::from_millis(15));
        
        // Should timeout now
        assert!(monitor.check_timeout().is_err());
    }

    #[test]
    fn test_content_size_limit() {
        let config = AnalysisConfig {
            max_content_size: 100,
            ..Default::default()
        };
        let monitor = PerformanceMonitor::new(&config);
        
        // Small content should pass
        assert!(monitor.check_content_size("small").is_ok());
        
        // Large content should fail
        let large_content = "a".repeat(200);
        assert!(monitor.check_content_size(&large_content).is_err());
    }

    #[test]
    fn test_optimized_similarity_calculation() {
        let config = AnalysisConfig::default();
        let analyzer = OptimizedContentAnalyzer::new(config);
        
        let html = "<div>Hello world</div>";
        let text = "Hello world";
        
        let result = analyzer.analyze_with_monitoring(html, |html, monitor| {
            analyzer.calculate_similarity_optimized(html, text, monitor)
        });
        
        assert!(result.is_ok());
        let similarity = result.unwrap();
        assert!(similarity > 0.8); // Should be high similarity
    }

    #[test]
    fn test_app_detection_optimization() {
        let config = AnalysisConfig::default();
        let analyzer = OptimizedContentAnalyzer::new(config);
        
        let chatgpt_html = r#"<div data-testid="conversation-turn">Content</div>"#;
        
        let result = analyzer.analyze_with_monitoring(chatgpt_html, |html, monitor| {
            analyzer.detect_application_optimized(html, monitor)
        });
        
        assert!(result.is_ok());
        let detected = result.unwrap();
        assert_eq!(detected, Some("ChatGPT".to_string()));
    }

    #[test]
    fn test_benchmark_suite() {
        let config = AnalysisConfig {
            analysis_timeout_ms: 1000, // 1 second for testing
            ..Default::default()
        };
        let suite = PerformanceBenchmarkSuite::new(config);
        
        let results = suite.run_benchmarks();
        
        // All tests should complete
        assert!(!results.is_empty());
        
        // Print results for manual inspection
        suite.print_results(&results);
    }
}