import React from 'react';
import MaintenanceStatusPanel from './MaintenanceStatusPanel';
import './animations.css';

const OperationPanels = ({ 
  activeOperation, 
  OPERATIONS,
  maintenanceResult
}) => {
  return (
    <div className="max-w-2xl mx-auto mb-8 space-y-4">
      {/* 自动维护状态面板 */}
      <MaintenanceStatusPanel
        maintenanceResult={maintenanceResult}
        loading={false}
        activeOperation={activeOperation}
        OPERATIONS={OPERATIONS}
      />

      {/* 性能分析状态显示 */}
      {activeOperation === OPERATIONS.ANALYSIS && (
        <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
          <div className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium bg-purple-500/20 text-purple-700 border border-purple-300/50 backdrop-blur-sm">
            <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full spin-smooth mr-2"></div>
            <span className="text-xs">性能分析中...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperationPanels;