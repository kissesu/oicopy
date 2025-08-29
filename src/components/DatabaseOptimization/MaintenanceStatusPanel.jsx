import React from 'react';
import './animations.css';

/**
 * 维护状态面板组件
 * 显示自动维护系统的状态信息，不提供任何手动操作
 */
const MaintenanceStatusPanel = ({ maintenanceResult, activeOperation, OPERATIONS }) => {
  // 计算下次维护时间
  const getNextMaintenanceTime = () => {
    if (maintenanceResult?.next_maintenance) {
      return new Date(maintenanceResult.next_maintenance);
    }
    
    // 如果没有明确的下次维护时间，基于上次维护时间计算
    if (maintenanceResult?.last_maintenance) {
      const lastMaintenance = new Date(maintenanceResult.last_maintenance);
      const nextMaintenance = new Date(lastMaintenance.getTime() + 24 * 60 * 60 * 1000); // 24小时后
      return nextMaintenance;
    }
    
    return null;
  };

  // 计算维护状态
  const getMaintenanceStatus = () => {
    if (activeOperation === OPERATIONS.MAINTENANCE) {
      return {
        status: 'loading',
        text: '获取维护状态...',
        color: 'blue'
      };
    }
    
    if (!maintenanceResult) {
      return {
        status: 'unknown',
        text: '维护状态未知',
        color: 'gray'
      };
    }
    
    const nextMaintenance = getNextMaintenanceTime();
    const now = new Date();
    
    if (nextMaintenance && nextMaintenance > now) {
      const hoursUntilNext = Math.ceil((nextMaintenance - now) / (1000 * 60 * 60));
      return {
        status: 'scheduled',
        text: `下次维护: ${hoursUntilNext}小时后`,
        color: 'green'
      };
    }
    
    return {
      status: 'active',
      text: '自动维护已启用',
      color: 'green'
    };
  };

  const maintenanceStatus = getMaintenanceStatus();
  const nextMaintenance = getNextMaintenanceTime();

  return (
    <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl text-start">
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-xl flex items-center justify-center mr-3 backdrop-blur-sm">
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800 text-start">自动维护系统</h3>
          <p className="text-xs text-slate-600">系统后台自动执行数据库维护，无需手动干预</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* 维护状态指示器 */}
        <div className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium border backdrop-blur-sm ${
          maintenanceStatus.color === 'blue' 
            ? 'bg-blue-500/20 text-blue-700 border-blue-300/50'
            : maintenanceStatus.color === 'green'
            ? 'bg-green-500/20 text-green-700 border-green-300/50'
            : 'bg-gray-500/20 text-gray-700 border-gray-300/50'
        }`}>
          {maintenanceStatus.status === 'loading' ? (
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full spin-smooth mr-2"></div>
          ) : (
            <div className={`w-3 h-3 rounded-full mr-2 ${
              maintenanceStatus.color === 'green' ? 'bg-green-600' : 'bg-gray-400'
            }`}></div>
          )}
          <span className="text-xs">{maintenanceStatus.text}</span>
        </div>

        {/* 维护详细信息 */}
        {maintenanceResult && (
          <div className="bg-white/30 rounded-lg p-3 space-y-2">
            <div className="grid grid-cols-1 gap-2 text-xs text-left">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">维护周期:</span>
                <span className="text-slate-800 font-medium">24小时</span>
              </div>
              
              {maintenanceResult.last_maintenance && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">上次维护:</span>
                  <span className="text-slate-800 font-medium">
                    {new Date(maintenanceResult.last_maintenance).toLocaleString()}
                  </span>
                </div>
              )}
              
              {nextMaintenance && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">下次维护:</span>
                  <span className="text-slate-800 font-medium">
                    {nextMaintenance.toLocaleString()}
                  </span>
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-slate-600">维护状态:</span>
                <span className="text-green-700 font-medium">自动运行中</span>
              </div>
            </div>

            {/* 维护操作状态 */}
            {maintenanceResult.vacuum_completed !== undefined && (
              <div className="border-t border-white/20 pt-2 mt-2">
                <div className="text-xs text-slate-600 mb-2">最近维护操作:</div>
                <div className="flex space-x-4 text-xs">
                  <div className={`flex items-center ${
                    maintenanceResult.vacuum_completed ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={
                        maintenanceResult.vacuum_completed 
                          ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      } clipRule="evenodd" />
                    </svg>
                    VACUUM
                  </div>
                  <div className={`flex items-center ${
                    maintenanceResult.reindex_completed ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={
                        maintenanceResult.reindex_completed 
                          ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      } clipRule="evenodd" />
                    </svg>
                    REINDEX
                  </div>
                  <div className={`flex items-center ${
                    maintenanceResult.analyze_completed ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d={
                        maintenanceResult.analyze_completed 
                          ? "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          : "M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      } clipRule="evenodd" />
                    </svg>
                    ANALYZE
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 维护说明 */}
        <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-200/30">
          <div className="flex items-start">
            <div className="w-4 h-4 bg-blue-500/20 rounded-full flex items-center justify-center mr-2 mt-0.5">
              <svg className="w-2 h-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-blue-700 font-medium mb-1">自动维护说明</p>
              <p className="text-xs text-blue-600">
                系统会在后台自动执行VACUUM、REINDEX和ANALYZE操作，优化数据库性能和存储效率。
                维护操作会在系统空闲时自动进行，不会影响正常使用。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceStatusPanel;