import React, { useState, useEffect } from 'react';
import './animations.css';

const PerformancePanel = ({
  getPerformanceStats,
  getPerformanceWarnings
}) => {
  const [stats, setStats] = useState(null);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    const updateStats = () => {
      try {
        const performanceStats = getPerformanceStats();
        const performanceWarnings = getPerformanceWarnings();
        setStats(performanceStats);
        setWarnings(performanceWarnings);
      } catch (error) {
        console.error('获取性能统计失败:', error);
        // 设置默认值
        setStats({
          renderTime: 0,
          memoryUsage: { used: 0, total: 100, limit: 200 },
          apiResponseTimes: [],
          componentUpdates: 0,
          avgApiResponseTime: 0,
          slowApiCalls: 0,
          totalApiCalls: 0
        });
        setWarnings([]);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 1000);
    return () => clearInterval(interval);
  }, [getPerformanceStats, getPerformanceWarnings]);

  return (
    <div className="bg-white/20 backdrop-blur-xl rounded-xl p-6 border border-white/30 shadow-xl">
      <div className="flex items-center mb-6">
        <div className="w-8 h-8 bg-gradient-to-br from-purple-500/20 to-indigo-600/20 rounded-xl flex items-center justify-center mr-3">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          {/* <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg> */}
        </div>
        <h3 className="text-lg font-semibold text-slate-800">性能监控面板</h3>
      </div>

      {/* 性能警告 */}
      {warnings.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-red-700 mb-3">性能警告</h4>
          <div className="space-y-2">
            {warnings.map((warning, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${warning.severity === 'high'
                    ? 'bg-red-500/10 border-red-200/30 text-red-700'
                    : 'bg-amber-500/10 border-amber-200/30 text-amber-700'
                  }`}
              >
                <div className="flex items-center">
                  <span className="text-lg mr-2">
                    {warning.severity === 'high' ? '🚨' : '⚠️'}
                  </span>
                  <span className="text-sm font-medium">{warning.message}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 性能指标 */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-200/30">
            <div className="text-xs font-medium text-blue-700 mb-1">渲染时间</div>
            <div className="text-lg font-bold text-blue-800">
              {(stats.renderTime || 0).toFixed(1)}ms
            </div>
            <div className="text-xs text-blue-600">
              {(stats.renderTime || 0) < 50 ? '优秀' : (stats.renderTime || 0) < 100 ? '良好' : '需优化'}
            </div>
          </div>

          <div className="bg-green-500/10 rounded-lg p-4 border border-green-200/30">
            <div className="text-xs font-medium text-green-700 mb-1">组件更新次数</div>
            <div className="text-lg font-bold text-green-800">
              {stats.componentUpdates || 0}
            </div>
            <div className="text-xs text-green-600">
              自启动以来
            </div>
          </div>

          <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-200/30">
            <div className="text-xs font-medium text-purple-700 mb-1">平均API响应</div>
            <div className="text-lg font-bold text-purple-800">
              {stats.avgApiResponseTime || 0}ms
            </div>
            <div className="text-xs text-purple-600">
              最近10次调用
            </div>
          </div>

          <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-200/30">
            <div className="text-xs font-medium text-orange-700 mb-1">API调用总数</div>
            <div className="text-lg font-bold text-orange-800">
              {stats.totalApiCalls || 0}
            </div>
            <div className="text-xs text-orange-600">
              慢调用: {stats.slowApiCalls || 0}
            </div>
          </div>
        </div>
      )}

      {/* 内存使用情况 */}
      {stats && stats.memoryUsage && typeof stats.memoryUsage === 'object' && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">内存使用情况</h4>
          <div className="bg-slate-500/10 rounded-lg p-4 border border-slate-200/30">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-600">已使用</span>
              <span className="text-sm font-semibold text-slate-800">
                {stats.memoryUsage.used}MB / {stats.memoryUsage.total}MB
              </span>
            </div>
            <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full progress-bar"
                style={{
                  transform: `scaleX(${Math.min((stats.memoryUsage.used / stats.memoryUsage.total) * 100, 100) / 100})`,
                  width: '100%'
                }}
              ></div>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              限制: {stats.memoryUsage.limit}MB
            </div>
          </div>
        </div>
      )}

      {/* API调用历史 */}
      {stats && stats.apiResponseTimes && stats.apiResponseTimes.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">最近API调用</h4>
          <div className="max-h-40 overflow-y-auto">
            <div className="space-y-1">
              {stats.apiResponseTimes.slice(-10).reverse().map((timing, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 bg-white/30 rounded text-xs"
                >
                  <span className="font-medium text-slate-700">
                    {timing.operation}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className={`font-semibold ${timing.duration > 3000 ? 'text-red-600' :
                        timing.duration > 1000 ? 'text-amber-600' : 'text-green-600'
                      }`}>
                      {timing.duration}ms
                    </span>
                    <span className="text-slate-500">
                      {new Date(timing.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 性能建议 */}
      <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-200/30">
        <h4 className="text-sm font-semibold text-emerald-700 mb-2">性能优化建议</h4>
        <ul className="space-y-1 text-xs text-emerald-600 text-start">
          <li>• 保持组件渲染时间在50ms以下</li>
          <li>• API响应时间超过2秒时考虑优化</li>
          <li>• 内存使用超过100MB时注意优化</li>
          <li>• 避免频繁的组件重新渲染</li>
        </ul>
      </div>

    </div>
  );
};

export default PerformancePanel;