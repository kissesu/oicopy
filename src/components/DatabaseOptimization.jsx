import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import StatisticsCards from './DatabaseOptimization/StatisticsCards';
import PerformancePanel from './DatabaseOptimization/PerformancePanel';
import { formatFileSize } from './DatabaseOptimization/utils';
import { OPERATIONS } from './DatabaseOptimization/hooks';
import './DatabaseOptimization/animations.css';

const DatabaseOptimization = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true); // 初始为加载状态
  const [message, setMessage] = useState('');
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [performanceAnalysis, setPerformanceAnalysis] = useState(null);
  const [autoMaintenanceEnabled] = useState(true); // 固定为启用状态
  const [lastMaintenanceTime, setLastMaintenanceTime] = useState(null);
  const [activeOperation, setActiveOperation] = useState(null);

  // 获取统计信息
  const getStats = async () => {
    setLoading(true);
    setActiveOperation(OPERATIONS.STATS);
    try {
      const result = await invoke('get_database_statistics');
      const processedStats = {
        total_records: result.total_records || result.record_count || 0,
        database_size_mb: result.database_size_mb || result.db_size_mb || 0,
        index_count: result.index_count || 0,
        wal_mode_enabled: result.wal_mode_enabled || false,
        wal_pages: result.wal_pages || 0,
        type_stats: result.type_stats || {},
        app_stats: result.app_stats || {},
        last_updated: new Date().toISOString()
      };

      setStats(processedStats);
      setLastRefreshTime(new Date());
    } catch (error) {
      console.error('获取统计信息失败:', error);
      setMessage(`获取统计信息失败: ${error.message}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
      setActiveOperation(null);
    }
  };

  // 性能分析
  const analyzePerformance = async () => {
    setLoading(true);
    try {
      const result = await invoke('analyze_database_performance_command');
      setPerformanceAnalysis(result);
      setMessage(`性能分析完成：评分 ${result.score}/100 (${result.grade})`);
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('性能分析失败:', error);
      setMessage(`性能分析失败: ${error.message}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  // 自动维护
  const performAutoMaintenance = async () => {
    if (!autoMaintenanceEnabled) return;

    try {
      console.log('执行自动维护...');
      await invoke('perform_database_maintenance');
      setLastMaintenanceTime(new Date());
      console.log('自动维护完成');
      // 维护后刷新统计信息
      await getStats();
    } catch (error) {
      console.error('自动维护失败:', error);
    }
  };

  // 检查是否需要维护
  const shouldPerformMaintenance = () => {
    if (!stats || !autoMaintenanceEnabled) return false;

    // 如果从未维护过，或者距离上次维护超过24小时
    if (!lastMaintenanceTime) return true;

    const hoursSinceLastMaintenance = (Date.now() - lastMaintenanceTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastMaintenance >= 24;
  };

  // 页面加载时自动获取统计信息和执行性能分析
  useEffect(() => {
    const loadAllData = async () => {
      try {
        // 并行执行统计信息获取和性能分析
        await Promise.all([
          getStats(),
          analyzePerformance()
        ]);
      } catch (error) {
        console.error('数据加载失败:', error);
        setMessage('数据加载失败，请刷新页面重试');
      }
    };

    loadAllData();
  }, []);

  // 自动维护检查 - 每小时检查一次
  useEffect(() => {
    const checkMaintenance = () => {
      if (shouldPerformMaintenance()) {
        performAutoMaintenance();
      }
    };

    // 立即检查一次
    if (stats) {
      checkMaintenance();
    }

    // 每小时检查一次
    const interval = setInterval(checkMaintenance, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [stats, autoMaintenanceEnabled, lastMaintenanceTime]);

  // 性能监控相关函数（简化版）
  const getPerformanceStats = () => ({
    renderTime: 0,
    memoryUsage: {
      used: 0,
      total: 100,
      limit: 200
    },
    apiResponseTimes: [],
    componentUpdates: 0,
    avgApiResponseTime: 0,
    slowApiCalls: 0,
    totalApiCalls: 0
  });

  const getPerformanceWarnings = () => [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 p-6 relative overflow-hidden">
      {/* 背景装饰层 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-blue-50/20 to-purple-50/30"></div>
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-200/20 to-pink-200/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

      <div className="max-w-6xl mx-auto space-y-6 relative z-10">
        {/* 页面标题 */}
        <div className="flex items-center justify-between mb-8">
          <div className="text-start">
            <span className="text-xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent mb-2">
              数据库优化中心
            </span>
            <span className="ml-5 text-slate-600 text-xs">
              智能管理剪贴板数据，优化存储性能，保持系统高效运行
            </span>
          </div>
        </div>

        {/* 状态消息和自动加载提示 */}
        {loading && !message && (
          <div className="mb-6 p-4 rounded-xl backdrop-blur-xl border border-blue-200/30 bg-blue-500/10 shadow-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full spin-smooth"></div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-xs font-medium text-blue-700">正在自动加载数据库信息和性能分析...</p>
              </div>
            </div>
          </div>
        )}

        {message && (
          <div className={`mb-6 p-4 rounded-xl backdrop-blur-xl border border-white/20 shadow-lg ${message.includes('失败') || message.includes('错误')
              ? 'bg-red-500/10 border-red-200/30'
              : 'bg-green-500/10 border-green-200/30'
            }`}>
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {message.includes('失败') || message.includes('错误') ? (
                  <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="ml-3 flex-1">
                <p className={`text-xs font-medium ${message.includes('失败') || message.includes('错误') ? 'text-red-700' : 'text-green-700'
                  }`}>{message}</p>
              </div>
            </div>
          </div>
        )}

        {/* 统计信息头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-slate-800">数据库统计信息</h2>
            {lastRefreshTime && (
              <span className="text-xs text-slate-500">
                最后更新: {lastRefreshTime.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>自动维护已启用</span>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        {stats ? (
          <StatisticsCards
            stats={stats}
            loading={loading}
            activeOperation={activeOperation}
            OPERATIONS={OPERATIONS}
            formatFileSize={formatFileSize}
          />
        ) : (
          <div className="bg-slate-500/10 backdrop-blur-xl rounded-xl p-6 border border-slate-200/30 shadow-xl mb-8">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-slate-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">正在加载统计数据...</h3>
                <p className="text-xs text-slate-600 mb-4">请稍候，正在获取数据库信息</p>
                {loading && (
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full spin-smooth mx-auto"></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 操作面板 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* 性能分析 */}
          <div className="bg-white/20 backdrop-blur-xl rounded-xl p-6 border border-white/30 shadow-xl">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500/20 to-indigo-600/20 rounded-xl flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800">性能分析</h3>
            </div>

            {performanceAnalysis ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">性能评分</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold text-slate-800">{performanceAnalysis.score}/100</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${performanceAnalysis.score >= 90 ? 'bg-green-500/20 text-green-700' :
                        performanceAnalysis.score >= 70 ? 'bg-yellow-500/20 text-yellow-700' :
                          'bg-red-500/20 text-red-700'
                      }`}>
                      {performanceAnalysis.grade}
                    </span>
                  </div>
                </div>

                {performanceAnalysis.issues && performanceAnalysis.issues.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-700 mb-2">发现的问题：</div>
                    <div className="space-y-1">
                      {performanceAnalysis.issues.slice(0, 2).map((issue, index) => (
                        <div key={index} className="text-xs text-red-700 bg-red-500/10 rounded px-2 py-1">
                          {issue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full spin-smooth"></div>
                <span className="ml-2 text-xs text-slate-600">正在分析性能...</span>
              </div>
            ) : (
              <p className="text-xs text-slate-600 mb-4">性能分析将在页面加载时自动执行</p>
            )}
          </div>

          {/* 自动维护设置 */}
          <div className="bg-white/20 backdrop-blur-xl rounded-xl p-6 border border-white/30 shadow-xl text-start">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-xl flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-800">自动维护</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">自动维护状态</span>
                <div className="px-3 py-1 rounded-lg text-xs font-medium bg-green-500/20 text-green-700 border border-green-300/50">
                  已存在
                </div>
              </div>

              {lastMaintenanceTime && (
                <div className="text-xs text-slate-600">
                  上次维护: {lastMaintenanceTime.toLocaleString()}
                </div>
              )}

              <div className="text-xs text-slate-500">
                • 自动维护每24小时执行一次<br />
                • 包括VACUUM、REINDEX和ANALYZE操作<br />
                • 在系统空闲时自动运行
              </div>
            </div>
          </div>
        </div>

        {/* 性能监控面板 - 集成到主布局 */}
        <PerformancePanel
          show={true}
          onClose={() => { }}
          getPerformanceStats={getPerformanceStats}
          getPerformanceWarnings={getPerformanceWarnings}
        />
        {/* <div className="bg-white/20 backdrop-blur-xl rounded-xl p-6 border border-white/30 shadow-xl">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-cyan-600/20 rounded-xl flex items-center justify-center mr-3">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-800">性能监控</h3>
          </div>
          
          
        </div> */}
      </div>
    </div>
  );
};

export default DatabaseOptimization;