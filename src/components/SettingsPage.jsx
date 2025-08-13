import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

function SettingsPage() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // 加载设置
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await invoke('get_app_settings');
      if (settings && settings.retention_days) {
        setRetentionDays(settings.retention_days);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    setSaved(false);
    try {
      await invoke('save_app_settings', {
        retentionDays: retentionDays
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('保存设置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const [clearingData, setClearingData] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [currentDataCount, setCurrentDataCount] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // 获取当前数据数量
  const getCurrentDataCount = async () => {
    try {
      const countResult = await invoke('get_data_count');
      return countResult;
    } catch (error) {
      console.error('获取数据数量失败:', error);
      return 0;
    }
  };
  
  const handleClearAllClick = async () => {
    const count = await getCurrentDataCount();
    setCurrentDataCount(count);
    if (count === 0) {
      setErrorMessage('暂无数据需要清理');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }
    setShowConfirmDialog(true);
  };
  
  const confirmClearAll = async () => {
    setShowConfirmDialog(false);
    setClearingData(true);
    
    try {
      const deletedCount = await invoke('clear_all_history_command');
      setSuccessMessage(`成功清理了 ${deletedCount} 条历史记录！`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('清理所有历史记录失败:', error);
      setErrorMessage('清理失败，请稍后重试');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setClearingData(false);
    }
  };
  
  const cancelClearAll = () => {
    setShowConfirmDialog(false);
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="flex h-full">
        {/* 左侧导航栏 */}
        <div className="w-64 bg-white/80 backdrop-blur-sm border-r border-blue-200/50 p-6 shadow-lg">
          <div className="flex flex-col space-y-6">
            {/* 应用标题 */}
            <div className="text-center pb-4 border-b border-blue-200/50">
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">📋</span>
              </div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                OiCopy
              </h2>
              <p className="text-xs text-gray-500 mt-1">剪贴板管理器</p>
            </div>
            
            {/* 导航项 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3 p-3 bg-gradient-to-r from-blue-100 to-purple-100 rounded-xl border border-blue-200/50 shadow-sm">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">系统设置</div>
                  <div className="text-xs text-gray-500">数据管理与配置</div>
                </div>
              </div>
            </div>
            
            {/* 统计信息 */}
            <div className="mt-auto">
              <div className="bg-white/60 rounded-xl p-4 border border-blue-200/30 shadow-sm">
                <div className="text-xs text-gray-500 mb-2">当前配置</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">数据保留</span>
                  <span className="font-semibold text-blue-600">{retentionDays} 天</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 右侧内容区 */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            {/* 页面标题 */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
                系统设置
              </h1>
              <p className="text-gray-600">管理剪贴板历史数据的保留策略和清理选项</p>
            </div>
            
            <div className="space-y-8">
              {/* 历史数据保留设置 */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-blue-200/50 shadow-xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex items-center justify-center mr-3 shadow-md">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        数据保留时间
                      </h3>
                    </div>
                    <p className="text-gray-600 mb-6">
                      系统会自动删除超过指定天数的剪贴板历史记录，以优化存储空间
                    </p>
                    
                    <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-200/50">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={retentionDays}
                            onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                            className="w-24 px-4 py-3 text-center text-lg font-semibold border-2 border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
                          />
                        </div>
                        <span className="text-gray-700 font-medium">天后自动清理</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 美化的保存按钮 */}
                  <div className="ml-8 flex flex-col items-center">
                    <button
                      onClick={saveSettings}
                      disabled={loading}
                      className={`relative w-16 h-16 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                        saved
                          ? 'bg-gradient-to-br from-green-400 to-green-600 focus:ring-green-300'
                          : loading
                          ? 'bg-gradient-to-br from-gray-300 to-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:ring-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-center w-full h-full">
                        {loading ? (
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : saved ? (
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                          </svg>
                        )}
                      </div>
                    </button>
                    <p className="mt-3 text-sm font-medium text-center">
                      {loading ? (
                        <span className="text-gray-600">保存中...</span>
                      ) : saved ? (
                        <span className="text-green-600">✓ 已保存</span>
                      ) : (
                        <span className="text-gray-600">点击保存</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
              
              {/* 数据管理 */}
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-red-200/50 shadow-xl">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-red-400 to-pink-500 rounded-lg flex items-center justify-center mr-3 shadow-md">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        数据清理
                      </h3>
                    </div>
                    <p className="text-gray-600 mb-6">
                      立即清理所有历史记录，此操作不可恢复，请谨慎操作
                    </p>
                    
                    <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200/50">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-6 w-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-amber-800">
                            <strong>温馨提示：</strong>系统会根据设置的保留时间自动清理过期数据，通常无需手动干预
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 危险操作按钮 */}
                  <div className="ml-8 flex flex-col items-center">
                    <button
                      onClick={handleClearAllClick}
                      disabled={clearingData}
                      className={`relative w-16 h-16 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                        clearingData
                          ? 'bg-gradient-to-br from-gray-300 to-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-br from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 focus:ring-red-300'
                      }`}
                    >
                      <div className="flex items-center justify-center w-full h-full">
                        {clearingData ? (
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </div>
                    </button>
                    <p className="mt-3 text-sm font-medium text-center">
                      {clearingData ? (
                        <span className="text-gray-600">清理中...</span>
                      ) : (
                        <span className="text-red-600">清理全部</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 底部信息 */}
            <div className="mt-12 pt-8 border-t border-gray-200/50">
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-white/60 rounded-full border border-gray-200/50 shadow-sm">
                  <span className="text-sm text-gray-500">OiCopy 剪贴板管理器</span>
                  <span className="mx-2 text-gray-300">•</span>
                  <span className="text-sm font-medium text-blue-600">v1.0.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 确认对话框 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-gray-200">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除所有数据</h3>
              <p className="text-gray-600 mb-6">
                您即将删除 <span className="font-semibold text-red-600">{currentDataCount}</span> 条剪贴板历史记录。
                <br />此操作不可恢复，请确认是否继续？
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={cancelClearAll}
                  className="flex-1 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200 font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmClearAll}
                  className="flex-1 px-4 py-2 text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors duration-200 font-medium"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 成功消息提示 */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMessage}</span>
          </div>
        </div>
      )}
      
      {/* 错误消息提示 */}
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
