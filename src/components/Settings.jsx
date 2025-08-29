import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useLocation, useNavigate } from 'react-router-dom';
import DatabaseOptimization from './DatabaseOptimization';

function SettingsPage() {
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('general'); // 新增：当前激活的标签页
  const [initialLoading, setInitialLoading] = useState(true); // 新增：初始加载状态
  const location = useLocation();
  const navigate = useNavigate();

  console.log('SettingsPage - 组件开始渲染, initialLoading:', initialLoading, '当前路径:', location.pathname);

  useEffect(() => {
    // 确保在正确的路由上
    if (location.pathname !== '/settings') {
      console.log('SettingsPage - 路由不正确，重定向到/settings');
      navigate('/settings', { replace: true });
      return;
    }
    
    console.log('SettingsPage - useEffect 触发，开始加载设置');
    // 加载设置
    loadSettings();
  }, [location.pathname, navigate]);

  const loadSettings = async () => {
    try {
      console.log('SettingsPage - 开始加载设置...');
      setInitialLoading(true);
      const settings = await invoke('get_app_settings');
      console.log('SettingsPage - 获取到设置:', settings);
      if (settings && settings.retention_days) {
        setRetentionDays(settings.retention_days);
      }
    } catch (error) {
      console.error('SettingsPage - 加载设置失败:', error);
    } finally {
      console.log('SettingsPage - 设置加载完成，设置 initialLoading 为 false');
      setInitialLoading(false);
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

      // 通知面板页面数据已清理
      await invoke('emit_data_cleared_event');
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

  // 计算滑块位置
  const getSliderPosition = () => {
    const options = [1, 7, 30, 365, -1];
    const index = options.indexOf(retentionDays);
    return index !== -1 ? index * 20 : 40; // 如果不是预设值，默认显示在"个月"位置
  };

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 relative overflow-hidden">
      {/* 背景装饰层 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-blue-50/20 to-purple-50/30"></div>
      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-200/20 to-purple-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-200/20 to-pink-200/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>


      {/* 主要内容 - 始终显示，但在加载期间显示骨架屏 */}
      <div className="flex h-full relative z-10">
        {/* 左侧导航栏 */}
        <div className="w-64 bg-white/20 backdrop-blur-xl border-r border-white/30 p-6 shadow-xl">
          <div className="flex flex-col space-y-6">
            {/* 应用标题 */}
            <div className="text-center pb-4 border-b border-white/30">
              <div className="w-16 h-16 mx-auto mb-3 bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center shadow-xl border border-white/30">
                <span className="text-2xl">📋</span>
              </div>
              <h2 className="text-lg font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
                OiCopy
              </h2>
              <p className="text-xs text-slate-500 mt-1">剪贴板管理器</p>
            </div>

            {/* 导航项 */}
            <div className="space-y-2">
              {/* 系统设置 */}
              <button
                onClick={() => setActiveTab('general')}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl border backdrop-blur-sm shadow-lg transition-all duration-300 ${activeTab === 'general'
                  ? 'bg-white/30 border-white/40 shadow-xl'
                  : 'bg-white/15 border-white/20 hover:bg-white/25'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-lg ${activeTab === 'general'
                  ? 'bg-gradient-to-br from-blue-500/80 to-purple-600/80'
                  : 'bg-white/20 border border-white/30'
                  }`}>
                  <svg className={`w-5 h-5 ${activeTab === 'general' ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">系统设置</div>
                  <div className="text-xs text-slate-600">数据管理与配置</div>
                </div>
              </button>

              {/* 数据库优化 */}
              <button
                onClick={() => setActiveTab('database')}
                className={`w-full flex items-center space-x-3 p-3 rounded-xl border backdrop-blur-sm shadow-lg transition-all duration-300 ${activeTab === 'database'
                  ? 'bg-white/30 border-white/40 shadow-xl'
                  : 'bg-white/15 border-white/20 hover:bg-white/25'
                  }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-lg ${activeTab === 'database'
                  ? 'bg-gradient-to-br from-green-500/80 to-blue-600/80'
                  : 'bg-white/20 border border-white/30'
                  }`}>
                  <svg className={`w-5 h-5 ${activeTab === 'database' ? 'text-white' : 'text-slate-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-slate-800">数据库优化</div>
                  <div className="text-xs text-slate-600">性能监控与维护</div>
                </div>
              </button>
            </div>

            {/* 统计信息 */}
            <div className="mt-auto">
              <div className="bg-white/20 backdrop-blur-xl rounded-xl p-4 border border-white/30 shadow-xl">
                <div className="text-xs text-slate-500 mb-2">当前配置</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">数据保留</span>
                  {initialLoading ? (
                    <div className="w-16 h-5 bg-gradient-to-r from-white/40 to-white/20 rounded-lg animate-pulse"></div>
                  ) : (
                    <span className="font-semibold text-blue-600">{retentionDays === -1 ? "永久" : retentionDays+" 天"}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 p-8 overflow-y-auto no-scrollbar">
          <div className="max-w-4xl mx-auto">
            {/* 页面标题 */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent mb-2">
                {activeTab === 'general' ? '系统设置' : '数据库优化'}
              </h1>
              <p className="text-slate-600">
                {activeTab === 'general'
                  ? '管理剪贴板历史数据的保留策略和清理选项'
                  : '监控数据库性能，执行维护任务和优化操作'
                }
              </p>
              
              {/* 加载状态指示器 */}
              {initialLoading && (
                <div className="mt-4 flex items-center space-x-3 p-3 bg-blue-500/10 backdrop-blur-sm rounded-xl border border-blue-200/30">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium text-blue-700">正在加载设置数据...</span>
                </div>
              )}
            </div>

            {/* 根据activeTab显示不同内容 */}
            {activeTab === 'general' ? (
              <div className="space-y-8">
                {/* 历史数据保留设置 */}
                <div className="bg-white/20 backdrop-blur-xl rounded-2xl p-6 border border-white/30 shadow-xl">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-green-500/20 to-blue-600/20 rounded-xl flex items-center justify-center mr-3 backdrop-blur-sm shadow-lg border border-white/30">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800">
                          数据保留时间
                        </h3>
                      </div>
                      <p className="text-slate-600 mb-6">
                        系统会自动删除超过指定天数的剪贴板历史记录，以优化存储空间
                      </p>

                      {initialLoading ? (
                        // 加载期间的骨架屏 - 更明显的效果
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="space-y-4">
                            {/* 分段控制器骨架屏 */}
                            <div className="bg-slate-200/40 rounded-2xl p-1">
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <div key={i} className="flex-1 py-3 px-2">
                                    <div className="w-12 h-6 bg-gradient-to-r from-white/30 to-white/10 rounded-lg animate-pulse mx-auto"></div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* 说明文字骨架屏 */}
                            <div className="text-center space-y-2">
                              <div className="w-64 h-4 bg-gradient-to-r from-white/30 to-white/10 rounded animate-pulse mx-auto"></div>
                              <div className="w-48 h-4 bg-gradient-to-r from-white/20 to-white/5 rounded animate-pulse mx-auto"></div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 正常内容
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <div className="space-y-4">
                            {/* 分段控制器 */}
                            <div className="relative bg-slate-200/40 backdrop-blur-sm rounded-2xl p-1 shadow-inner">
                              {/* 滑动指示器 - 纯白色滑块 */}
                              <div
                                className="absolute top-1 bottom-1 bg-white rounded-xl shadow-lg transition-all duration-300 ease-out"
                                style={{
                                  width: 'calc(20% - 2px)',
                                  left: `calc(${getSliderPosition()}% + 1px)`,
                                }}
                              />

                              {/* 选项区域 - 不是按钮，只是文字 */}
                              <div className="flex relative">
                                {[
                                  { label: '天', days: 1 },
                                  { label: '周', days: 7 },
                                  { label: '月', days: 30 },
                                  { label: '年', days: 365 },
                                  { label: '永久', days: -1 }
                                ].map((option, index) => (
                                  <div
                                    key={option.days}
                                    onClick={() => setRetentionDays(option.days)}
                                    className="relative z-10 flex-1 py-3 px-2 text-sm font-medium text-slate-700 cursor-pointer text-center transition-all duration-200 hover:text-slate-900"
                                  >
                                    {option.label}
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* 自定义天数输入（仅在选择了非预设值时显示） */}
                            {![1, 7, 30, 365, -1].includes(retentionDays) && (
                              <div className="flex items-center justify-center space-x-3 p-3 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
                                <span className="text-slate-600 text-sm">自定义:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={retentionDays}
                                  onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                                  className="w-20 px-3 py-2 text-center text-sm font-semibold border border-white/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 bg-white/20 backdrop-blur-sm text-slate-800"
                                />
                                <span className="text-slate-600 text-sm">天后自动清理</span>
                              </div>
                            )}

                            {/* 显示当前设置 */}
                            <div className="text-center">
                              <span className="text-slate-600 text-sm">
                                {retentionDays === -1
                                  ? '数据将永久保留，不会自动清理'
                                  : `${retentionDays} 天后自动清理历史数据`
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 美化的保存按钮 */}
                    <div className="ml-8 flex flex-col items-center">
                      <button
                        onClick={saveSettings}
                        disabled={loading || initialLoading}
                        className={`relative w-16 h-16 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-offset-2 backdrop-blur-xl border border-white/30 ${saved
                          ? 'bg-gradient-to-br from-green-500/80 to-green-600/80 focus:ring-green-300/50'
                          : loading || initialLoading
                            ? 'bg-white/20 cursor-not-allowed'
                            : 'bg-gradient-to-br from-blue-500/80 to-purple-600/80 hover:from-blue-600/80 hover:to-purple-700/80 focus:ring-blue-300/50'
                          }`}
                      >
                        <div className="flex items-center justify-center w-full h-full">
                          {loading || initialLoading ? (
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
                        {loading || initialLoading ? (
                          <span className="text-slate-600">加载中...</span>
                        ) : saved ? (
                          <span className="text-green-600">✓ 已保存</span>
                        ) : (
                          <span className="text-slate-600">点击保存</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 数据管理 */}
                <div className="bg-white/20 backdrop-blur-xl rounded-2xl p-6 border border-white/30 shadow-xl">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-red-500/20 to-pink-600/20 rounded-xl flex items-center justify-center mr-3 backdrop-blur-sm shadow-lg border border-white/30">
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800">
                          数据清理
                        </h3>
                      </div>
                      <p className="text-slate-600 mb-6">
                        立即清理所有历史记录，此操作不可恢复，请谨慎操作
                      </p>

                      <div className="bg-amber-500/10 backdrop-blur-sm p-4 rounded-xl border border-amber-200/30">
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        disabled={clearingData || initialLoading}
                        className={`relative w-16 h-16 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-offset-2 backdrop-blur-xl border border-white/30 ${clearingData || initialLoading
                          ? 'bg-white/20 cursor-not-allowed'
                          : 'bg-gradient-to-br from-red-500/80 to-red-600/80 hover:from-red-600/80 hover:to-red-700/80 focus:ring-red-300/50'
                          }`}
                      >
                        <div className="flex items-center justify-center w-full h-full">
                          {clearingData || initialLoading ? (
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </div>
                      </button>
                      <p className="mt-3 text-sm font-medium text-center">
                        {clearingData || initialLoading ? (
                          <span className="text-slate-600">加载中...</span>
                        ) : (
                          <span className="text-red-600">清理全部</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 数据库优化页面 */
              <div className="space-y-6">
                <DatabaseOptimization />
              </div>
            )}

            {/* 底部信息 */}
            <div className="mt-12 pt-8 border-t border-white/30">
              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-white/20 backdrop-blur-xl rounded-full border border-white/30 shadow-xl">
                  <span className="text-sm text-slate-500">OiCopy 剪贴板管理器</span>
                  <span className="mx-2 text-slate-300">•</span>
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
          <div className="bg-white/100 backdrop-blur-xl rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-white/30">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-500/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-red-200/30">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">确认删除所有数据</h3>
              <p className="text-slate-600 mb-6">
                您即将删除 <span className="font-semibold text-red-600">{currentDataCount}</span> 条剪贴板历史记录。
                <br />此操作不可恢复，请确认是否继续？
              </p>
              <div className="flex space-x-4">
                <button
                  onClick={cancelClearAll}
                  className="flex-1 px-4 py-2 text-slate-600 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-colors duration-200 font-medium border border-white/30"
                >
                  取消
                </button>
                <button
                  onClick={confirmClearAll}
                  className="flex-1 px-4 py-2 text-white bg-red-500/80 backdrop-blur-sm rounded-lg hover:bg-red-600/80 transition-colors duration-200 font-medium border border-red-400/30"
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
          <div className="bg-green-500/90 backdrop-blur-xl text-white px-6 py-3 rounded-xl shadow-2xl border border-green-400/30 flex items-center space-x-2">
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
          <div className="bg-red-500/90 backdrop-blur-xl text-white px-6 py-3 rounded-xl shadow-2xl border border-red-400/30 flex items-center space-x-2">
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
