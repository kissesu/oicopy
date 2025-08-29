import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  getFriendlyErrorMessage, 
  withRetry, 
  generateRecommendations 
} from './utils';
import { usePerformanceMonitor, useDebounce } from './usePerformanceMonitor';

/**
 * 操作状态枚举
 * 定义数据库优化组件中的各种操作类型
 */
export const OPERATIONS = {
  STATS: 'stats',           // 统计信息获取
  MAINTENANCE: 'maintenance', // 数据库维护
  ANALYSIS: 'analysis'      // 性能分析
};

/**
 * 数据库优化组件的主要状态管理Hook
 * 
 * 提供数据库优化相关的所有状态和操作函数，包括：
 * - 统计信息管理
 * - 数据库维护操作

 * - 性能分析
 * - 智能建议生成
 * - 错误处理和用户反馈
 * - 性能监控
 * 
 * @returns {Object} 包含所有状态和操作函数的对象
 */
export const useDatabaseOptimization = () => {
  // 性能监控
  const { 
    recordApiTiming, 
    getPerformanceStats, 
    getPerformanceWarnings,
    startRenderTiming,
    endRenderTiming
  } = usePerformanceMonitor();

  // 基础状态
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeOperation, setActiveOperation] = useState(null);
  const [error, setError] = useState(null);

  // 操作结果状态
  const [performanceAnalysis, setPerformanceAnalysis] = useState(null);
  const [maintenanceResult, setMaintenanceResult] = useState(null);

  // 进度和时间状态
  const [operationProgress, setOperationProgress] = useState(null);
  const [estimatedTime, setEstimatedTime] = useState(null);

  // 自动刷新状态
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  // 建议和对话框状态
  const [recommendations, setRecommendations] = useState([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(null);

  // 防抖优化的消息设置
  const debouncedMessage = useDebounce(message, 300);

  // 清除错误状态
  const clearError = useCallback(() => {
    setError(null);
    setMessage('');
  }, []);

  // 统一错误处理函数
  const handleError = useCallback((error, operation) => {
    console.error(`${operation} failed:`, error);
    setError({
      operation,
      message: error.toString(),
      timestamp: new Date().toISOString()
    });
    setMessage(`${operation}失败: ${error}`);
  }, []);

  // 通用操作处理函数
  const handleOperation = useCallback(async (operationType, operation, successMessage) => {
    setActiveOperation(operationType);
    setLoading(true);
    setOperationProgress(null);
    setEstimatedTime(null);
    clearError();
    
    // 设置预计时间
    const estimatedTimes = {
      [OPERATIONS.STATS]: 2000,
      [OPERATIONS.MAINTENANCE]: 10000,
      [OPERATIONS.ANALYSIS]: 5000
    };
    
    const startTime = Date.now();
    const estimated = estimatedTimes[operationType] || 3000;
    setEstimatedTime(estimated);
    
    // 模拟进度更新
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / estimated) * 100, 95);
      setOperationProgress(progress);
    }, 100);
    
    try {
      const result = await withRetry(operation);
      
      // 记录API性能
      const duration = Date.now() - startTime;
      recordApiTiming(operationType, duration);
      
      // 完成进度
      setOperationProgress(100);
      
      if (successMessage) {
        setMessage(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      }
      return result;
    } catch (error) {
      // 记录失败的API调用
      const duration = Date.now() - startTime;
      recordApiTiming(`${operationType}_error`, duration);
      
      // 统计信息加载失败的友好提示
      const friendlyMessage = getFriendlyErrorMessage(error, operationType);
      handleError(new Error(friendlyMessage), operationType);
      throw error;
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setActiveOperation(null);
      setOperationProgress(null);
      setEstimatedTime(null);
    }
  }, [clearError, handleError, recordApiTiming]);

  // 获取数据库统计信息
  const getStats = useCallback(async (showSuccessMessage = false) => {
    try {
      const result = await handleOperation(
        OPERATIONS.STATS,
        () => invoke('get_database_statistics'),
        showSuccessMessage ? '统计信息已更新' : null
      );
      
      // 数据验证和处理
      if (!result || typeof result !== 'object') {
        throw new Error('API返回的数据格式无效');
      }

      const processedStats = {
        total_records: Math.max(0, Number(result.total_records || result.record_count || 0)),
        database_size_mb: Math.max(0, Number(result.database_size_mb || result.db_size_mb || 0)),
        index_count: Math.max(0, Number(result.index_count || 0)),
        wal_mode_enabled: Boolean(result.wal_mode_enabled),
        wal_pages: Math.max(0, Number(result.wal_pages || 0)),
        type_stats: result.type_stats && typeof result.type_stats === 'object' ? result.type_stats : {},
        app_stats: result.app_stats && typeof result.app_stats === 'object' ? result.app_stats : {},
        last_updated: new Date().toISOString()
      };

      // 验证处理后的数据
      if (isNaN(processedStats.total_records) || isNaN(processedStats.database_size_mb)) {
        throw new Error('统计数据包含无效的数值');
      }
      
      setStats(processedStats);
      setLastRefreshTime(new Date());
      
      // 生成智能建议
      const newRecommendations = generateRecommendations(processedStats, performanceAnalysis);
      setRecommendations(newRecommendations);
      
      // 清除之前的错误状态
      if (error && error.operation === OPERATIONS.STATS) {
        clearError();
      }
    } catch (error) {
      // 错误已在handleOperation中处理
    }
  }, [handleOperation, performanceAnalysis, error, clearError]);

  // 获取维护状态（只读）
  const getMaintenanceStatus = useCallback(async () => {
    try {
      const result = await handleOperation(
        OPERATIONS.MAINTENANCE,
        () => invoke('get_maintenance_status'),
        null // 不显示成功消息，因为这是只读操作
      );
      
      // 确保维护结果包含自动维护的状态信息
      const processedResult = {
        ...result,
        is_automatic: true, // 标记为自动维护
        next_maintenance: result.next_maintenance || null,
        last_maintenance: result.last_maintenance || null,
        maintenance_interval: result.maintenance_interval || 24 * 60 * 60 * 1000, // 24小时默认间隔
        auto_maintenance_enabled: true // 自动维护已启用
      };
      
      setMaintenanceResult(processedResult);
    } catch (error) {
      // 错误已在handleOperation中处理
    }
  }, [handleOperation]);



  // 性能分析
  const analyzePerformance = useCallback(async () => {
    try {
      const result = await handleOperation(
        OPERATIONS.ANALYSIS,
        () => invoke('analyze_database_performance_command'),
        (result) => `性能分析完成：评分 ${result.score}/100 (${result.grade})，发现 ${result.issues.length} 个问题`
      );
      setPerformanceAnalysis(result);
      
      // 基于性能分析结果更新建议
      if (stats) {
        const newRecommendations = generateRecommendations(stats, result);
        setRecommendations(newRecommendations);
      }
    } catch (error) {
      // 错误已在handleOperation中处理
    }
  }, [handleOperation, stats]);

  // 处理建议操作
  const handleRecommendationAction = useCallback(async (recommendation) => {
    try {
      switch (recommendation.action) {
        case 'maintenance':
          // 维护已完全自动化，不提供任何手动操作
          setMessage('数据库维护已完全自动化，系统会在后台自动执行所有维护操作，无需手动干预');
          break;
        case 'analysis':
          await analyzePerformance();
          break;
        case 'info':
          // 显示信息类建议
          setMessage(recommendation.description);
          break;
        default:
          console.log('未知操作类型:', recommendation.action);
      }
    } catch (error) {
      console.error('执行建议操作失败:', error);
    }
  }, [analyzePerformance, setMessage]);

  // 自动刷新机制 - 始终启用
  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading) {
        getStats();
      }
    }, 30000); // 每30秒刷新一次
    setRefreshInterval(interval);
    return () => clearInterval(interval);
  }, [loading, getStats]);

  // 自动加载统计信息和维护状态
  useEffect(() => {
    getStats();
    getMaintenanceStatus();
  }, [getStats, getMaintenanceStatus]);

  return {
    // 状态
    stats,
    loading,
    message: debouncedMessage,
    activeOperation,
    error,
    performanceAnalysis,
    maintenanceResult,
    operationProgress,
    estimatedTime,
    lastRefreshTime,
    recommendations,
    showConfirmDialog,

    // 操作函数
    getStats,
    getMaintenanceStatus,
    analyzePerformance,
    handleRecommendationAction,
    clearError,

    // 设置函数
    setMessage,
    setShowConfirmDialog,
    setMaintenanceResult,
    setPerformanceAnalysis,

    // 性能监控
    getPerformanceStats,
    getPerformanceWarnings,
    startRenderTiming,
    endRenderTiming,

    // 常量
    OPERATIONS
  };
};