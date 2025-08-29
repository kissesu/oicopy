import React from 'react';
import { useDatabaseOptimization } from './hooks';
import StatisticsCards from './StatisticsCards';
import OperationPanels from './OperationPanels';

import PerformancePanel from './PerformancePanel';
import { formatFileSize, getTypeDisplayName, getAppDisplayName, getErrorSolution } from './utils';
import './animations.css';

const DatabaseOptimization = () => {
  
  const {
    // 状态
    stats,
    loading,
    message,
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
    clearError,

    // 设置函数
    setMessage,
    setShowConfirmDialog,
    setMaintenanceResult,
    setPerformanceAnalysis,

    // 性能监控
    getPerformanceStats,
    getPerformanceWarnings,

    // 常量
    OPERATIONS
  } = useDatabaseOptimization();

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

        {/* 操作进度指示器 */}
        <div className={`mb-6 transition-opacity duration-300 ${loading && activeOperation ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="p-4 rounded-xl backdrop-blur-xl border border-blue-200/30 shadow-lg bg-blue-500/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center mr-3">
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full spin-smooth"></div>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-700">
                    {activeOperation === OPERATIONS.STATS && '正在获取统计信息...'}
                    {activeOperation === OPERATIONS.MAINTENANCE && '正在获取维护状态...'}
                    {activeOperation === OPERATIONS.ANALYSIS && '正在分析性能...'}
                  </p>
                  {estimatedTime && (
                    <p className="text-xs text-blue-600">
                      预计需要 {Math.ceil(estimatedTime / 1000)} 秒
                    </p>
                  )}
                </div>
              </div>
              {operationProgress !== null && (
                <span className="text-sm font-semibold text-blue-700">
                  {Math.round(operationProgress)}%
                </span>
              )}
            </div>
            {operationProgress !== null && (
              <div className="w-full bg-blue-200/30 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full progress-bar"
                  style={{ 
                    transform: `scaleX(${operationProgress / 100})`,
                    width: '100%'
                  }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* 状态消息 */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl backdrop-blur-xl border border-white/20 shadow-lg ${message.includes('失败') || message.includes('错误')
            ? 'bg-red-500/10 border-red-200/30'
            : 'bg-green-500/10 border-green-200/30'
            }`}>
            <div className="flex items-start">
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
                <p className={`text-xs font-medium mb-1 ${message.includes('失败') || message.includes('错误') ? 'text-red-700' : 'text-green-700'
                  }`}>{message}</p>
                
                {/* 如果是错误消息且有错误对象，显示解决建议 */}
                {(message.includes('失败') || message.includes('错误')) && error && (
                  <div className="mt-2">
                    <details className="group">
                      <summary className="text-xs text-red-600 cursor-pointer hover:text-red-700 transition-colors">
                        查看解决建议 ▼
                      </summary>
                      <div className="mt-2 bg-white/20 rounded p-2">
                        <ul className="space-y-1">
                          {getErrorSolution(new Error(error.message)).map((solution, index) => (
                            <li key={index} className="text-xs text-red-600 flex items-start">
                              <span className="w-1 h-1 bg-red-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                              {solution}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </div>
                )}
                
                {/* 成功消息的额外信息 */}
                {!message.includes('失败') && !message.includes('错误') && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-green-600">
                      操作完成时间: {new Date().toLocaleTimeString()}
                    </span>
                    <button
                      onClick={() => setMessage('')}
                      className="text-xs text-green-600 hover:text-green-700 transition-colors"
                    >
                      关闭
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 操作结果详情 */}
        {(maintenanceResult || performanceAnalysis) && (
          <div className="mb-6 space-y-4">


            {/* 维护结果详情 */}
            {maintenanceResult && (
              <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
                <div className="flex items-center mb-3">
                  <div className="w-6 h-6 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-lg flex items-center justify-center mr-2">
                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800">自动维护状态</h4>
                  <button 
                    onClick={() => setMaintenanceResult(null)}
                    className="ml-auto text-slate-400 hover:text-slate-600 button-smooth"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                  <div className="bg-white/30 rounded-lg p-2 text-center">
                    <div className="font-semibold text-slate-800">{maintenanceResult.records_cleaned}</div>
                    <div className="text-slate-600">处理记录</div>
                  </div>
                  <div className="bg-white/30 rounded-lg p-2 text-center">
                    <div className="font-semibold text-slate-800">{maintenanceResult.size_before_mb.toFixed(1)}MB</div>
                    <div className="text-slate-600">维护前大小</div>
                  </div>
                  <div className="bg-white/30 rounded-lg p-2 text-center">
                    <div className="font-semibold text-slate-800">{maintenanceResult.size_after_mb.toFixed(1)}MB</div>
                    <div className="text-slate-600">维护后大小</div>
                  </div>
                  <div className="bg-white/30 rounded-lg p-2 text-center">
                    <div className="font-semibold text-slate-800">{maintenanceResult.duration_ms}ms</div>
                    <div className="text-slate-600">耗时</div>
                  </div>
                </div>
                <div className="flex space-x-4 text-xs">
                  <div className={`flex items-center ${maintenanceResult.vacuum_completed ? 'text-green-600' : 'text-red-600'}`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={maintenanceResult.vacuum_completed ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"} clipRule="evenodd" />
                    </svg>
                    VACUUM
                  </div>
                  <div className={`flex items-center ${maintenanceResult.reindex_completed ? 'text-green-600' : 'text-red-600'}`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={maintenanceResult.reindex_completed ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"} clipRule="evenodd" />
                    </svg>
                    REINDEX
                  </div>
                  <div className={`flex items-center ${maintenanceResult.analyze_completed ? 'text-green-600' : 'text-red-600'}`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={maintenanceResult.analyze_completed ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"} clipRule="evenodd" />
                    </svg>
                    ANALYZE
                  </div>
                </div>
              </div>
            )}

            {/* 性能分析结果详情 */}
            {performanceAnalysis && (
              <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
                <div className="flex items-center mb-3">
                  <div className="w-6 h-6 bg-gradient-to-br from-purple-500/20 to-indigo-600/20 rounded-lg flex items-center justify-center mr-2">
                    <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-800">性能分析结果</h4>
                  <button 
                    onClick={() => setPerformanceAnalysis(null)}
                    className="ml-auto text-slate-400 hover:text-slate-600 button-smooth"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center mb-3">
                  <div className="text-2xl font-bold text-slate-800 mr-2">{performanceAnalysis.score}/100</div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    performanceAnalysis.score >= 90 ? 'bg-green-500/20 text-green-700' :
                    performanceAnalysis.score >= 70 ? 'bg-yellow-500/20 text-yellow-700' :
                    'bg-red-500/20 text-red-700'
                  }`}>
                    {performanceAnalysis.grade}
                  </div>
                </div>
                {performanceAnalysis.issues.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-slate-700 mb-2">发现的问题：</div>
                    <div className="space-y-1">
                      {performanceAnalysis.issues.map((issue, index) => (
                        <div key={index} className="text-xs text-red-700 bg-red-500/10 rounded px-2 py-1">
                          {issue}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {performanceAnalysis.recommendations.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-slate-700 mb-2">优化建议：</div>
                    <div className="space-y-1">
                      {performanceAnalysis.recommendations.map((recommendation, index) => (
                        <div key={index} className="text-xs text-blue-700 bg-blue-500/10 rounded px-2 py-1">
                          {recommendation}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
        </div>

        {/* 统计卡片 */}
        {loading && activeOperation === OPERATIONS.STATS && !stats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl animate-pulse">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="h-3 bg-slate-300/50 rounded w-16 mb-2"></div>
                    <div className="h-6 bg-slate-300/50 rounded w-12"></div>
                  </div>
                  <div className="w-8 h-8 bg-slate-300/50 rounded-xl"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error && error.operation === OPERATIONS.STATS && !stats ? (
          <div className="bg-red-500/10 backdrop-blur-xl rounded-xl p-6 border border-red-200/30 shadow-xl mb-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-red-700 mb-2">统计信息加载失败</h3>
              <p className="text-xs text-red-600 mb-4">{error.message}</p>
              
              {/* 错误时间 */}
              <p className="text-xs text-slate-500 mb-4">
                错误时间: {new Date(error.timestamp).toLocaleString()}
              </p>
              
              {/* 解决建议 */}
              <div className="bg-white/20 rounded-lg p-3 mb-4 text-left">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">解决建议：</h4>
                <ul className="space-y-1">
                  {getErrorSolution(new Error(error.message)).map((solution, index) => (
                    <li key={index} className="text-xs text-slate-600 flex items-start">
                      <span className="w-1 h-1 bg-slate-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></span>
                      {solution}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex justify-center space-x-2">
                <button
                  onClick={() => getStats(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-700 rounded-lg text-xs font-medium button-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  重试加载
                </button>
                <button
                  onClick={clearError}
                  className="px-4 py-2 bg-white/30 hover:bg-white/40 text-slate-700 rounded-lg text-xs font-medium button-smooth"
                >
                  忽略错误
                </button>
              </div>
            </div>
          </div>
        ) : !stats ? (
          <div className="bg-slate-500/10 backdrop-blur-xl rounded-xl p-6 border border-slate-200/30 shadow-xl mb-8">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 bg-slate-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">暂无统计数据</h3>
                <p className="text-xs text-slate-600 mb-4">点击下方按钮加载数据库统计信息</p>
                <button
                  onClick={() => getStats(true)}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-700 rounded-lg text-xs font-medium button-smooth"
                >
                  加载统计信息
                </button>
              </div>
            </div>
          </div>
        ) : (
          <StatisticsCards 
            stats={stats}
            loading={loading}
            activeOperation={activeOperation}
            OPERATIONS={OPERATIONS}
            formatFileSize={formatFileSize}
          />
        )}

        {/* 操作面板 */}
        <OperationPanels
          activeOperation={activeOperation}
          OPERATIONS={OPERATIONS}
          maintenanceResult={maintenanceResult}
        />

        {/* 详细统计 */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* 内容类型分布 */}
            <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-7 h-7 bg-gradient-to-br from-amber-500/20 to-yellow-600/20 rounded-lg flex items-center justify-center mr-3 backdrop-blur-sm">
                    <svg className="w-3 h-3 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">内容类型分布</h3>
                </div>
                {stats.type_stats && Object.keys(stats.type_stats).length > 0 && (
                  <span className="text-xs text-slate-500">
                    {Object.keys(stats.type_stats).length} 种类型
                  </span>
                )}
              </div>
              
              {!stats.type_stats || Object.keys(stats.type_stats).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-600 text-center">暂无内容类型数据</p>
                  <p className="text-xs text-slate-500 text-center mt-1">开始使用剪贴板后将显示类型分布</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                  {Object.entries(stats.type_stats)
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count], index) => {
                      const percentage = ((count / (stats.total_records || 1)) * 100).toFixed(1);
                      const colors = [
                        'bg-blue-500',
                        'bg-green-500', 
                        'bg-purple-500',
                        'bg-red-500',
                        'bg-yellow-500',
                        'bg-indigo-500',
                        'bg-pink-500',
                        'bg-teal-500'
                      ];
                      const color = colors[index % colors.length];
                      
                      return (
                        <div key={type} className="flex items-center justify-between p-3 bg-white/30 backdrop-blur-sm rounded-lg border border-white/20 hover:bg-white/40 transition-colors duration-300">
                          <div className="flex items-center flex-1">
                            <div className={`w-3 h-3 ${color} rounded-full mr-3 flex-shrink-0`}></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700 capitalize truncate">
                                  {getTypeDisplayName(type)}
                                </span>
                                <div className="text-right ml-2">
                                  <div className="text-xs font-semibold text-slate-800">{count.toLocaleString()}</div>
                                  <div className="text-xs text-slate-600">{percentage}%</div>
                                </div>
                              </div>
                              <div className="w-full bg-slate-200/50 rounded-full h-1.5 mt-2 overflow-hidden">
                                <div 
                                  className={`${color} h-1.5 rounded-full progress-bar`}
                                  style={{ 
                                    transform: `scaleX(${Math.min(parseFloat(percentage), 100) / 100})`,
                                    width: '100%'
                                  }}
                                ></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* 应用使用排行 */}
            <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-lg flex items-center justify-center mr-3 backdrop-blur-sm">
                    <svg className="w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">应用使用排行</h3>
                </div>
                {stats.app_stats && Object.keys(stats.app_stats).length > 0 && (
                  <span className="text-xs text-slate-500">
                    前 {Math.min(Object.keys(stats.app_stats).length, 10)} 名
                  </span>
                )}
              </div>
              
              {!stats.app_stats || Object.keys(stats.app_stats).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-600 text-center">暂无应用使用数据</p>
                  <p className="text-xs text-slate-500 text-center mt-1">使用不同应用复制内容后将显示排行</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                  {Object.entries(stats.app_stats)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10)
                    .map(([app, count], index) => {
                      const percentage = ((count / (stats.total_records || 1)) * 100).toFixed(1);
                      const isTopThree = index < 3;
                      
                      return (
                        <div key={app} className={`flex items-center justify-between p-3 rounded-lg transition-colors duration-300 ${
                          isTopThree
                            ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-200/30 backdrop-blur-sm'
                            : 'bg-white/30 backdrop-blur-sm border border-white/20 hover:bg-white/40'
                        }`}>
                          <div className="flex items-center flex-1 min-w-0">
                            <div className="w-8 h-8 flex items-center justify-center mr-3 flex-shrink-0">
                              {isTopThree ? (
                                <span className="text-lg">{['🥇', '🥈', '🥉'][index]}</span>
                              ) : (
                                <span className="w-6 h-6 bg-slate-400/20 rounded-full flex items-center justify-center text-slate-600 text-xs font-bold backdrop-blur-sm">
                                  {index + 1}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700 truncate">
                                  {getAppDisplayName(app)}
                                </span>
                                <div className="text-right ml-2">
                                  <div className="text-xs font-semibold text-slate-800">{count.toLocaleString()}</div>
                                  <div className="text-xs text-slate-600">{percentage}%</div>
                                </div>
                              </div>
                              {isTopThree && (
                                <div className="w-full bg-amber-200/30 rounded-full h-1.5 mt-2 overflow-hidden">
                                  <div 
                                    className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 rounded-full transition-transform duration-500 ease-out origin-left"
                                    style={{ 
                                      transform: `scaleX(${Math.min(parseFloat(percentage), 100) / 100})`,
                                      width: '100%'
                                    }}
                                  ></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}


      </div>

      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/90 backdrop-blur-xl rounded-xl p-6 border border-white/30 shadow-2xl max-w-md mx-4">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center mr-3">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-800">{showConfirmDialog.title}</h3>
            </div>
            
            <p className="text-sm text-slate-600 mb-6">{showConfirmDialog.message}</p>
            
            <div className="bg-amber-50/50 rounded-lg p-3 mb-6">
              <div className="flex items-start">
                <svg className="w-4 h-4 text-amber-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-xs text-amber-700">
                  <p className="font-medium mb-1">注意事项：</p>
                  <ul className="space-y-1">
                    <li>• 此操作将永久删除数据，无法恢复</li>
                    <li>• 建议在执行前确保重要数据已备份</li>
                    <li>• 操作完成后将自动刷新统计信息</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="flex-1 px-4 py-2 bg-slate-500/20 hover:bg-slate-500/30 text-slate-700 rounded-lg text-sm font-medium transition-colors duration-300"
              >
                {showConfirmDialog.cancelText}
              </button>
              <button
                onClick={() => {
                  showConfirmDialog.action();
                  setShowConfirmDialog(null);
                }}
                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-700 rounded-lg text-sm font-medium transition-colors duration-300"
              >
                {showConfirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

        {/* 性能监控面板 */}
        <PerformancePanel
          getPerformanceStats={getPerformanceStats}
          getPerformanceWarnings={getPerformanceWarnings}
        />
      </div>
    </div>
  );
};

export default DatabaseOptimization;