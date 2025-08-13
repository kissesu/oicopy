import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import AppIcon from './AppIcon';

function AppInfoTest() {
  const [appInfo, setAppInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const getCurrentApp = async () => {
    setLoading(true);
    try {
      const info = await invoke('get_current_app_info');
      setAppInfo(info);
      console.log('当前前台应用:', info);
    } catch (error) {
      console.error('获取应用信息失败:', error);
      setAppInfo({ error: error.toString() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">应用信息测试</h2>

      <button
        onClick={getCurrentApp}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? '获取中...' : '获取当前前台应用'}
      </button>

      {appInfo && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <h3 className="font-semibold mb-2">当前前台应用信息：</h3>
          {appInfo.error ? (
            <p className="text-red-500"><strong>错误:</strong> {appInfo.error}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-2">
                <AppIcon
                  bundleId={appInfo.bundle_id}
                  appName={appInfo.name}
                  size={32}
                />
                <div>
                  <p><strong>应用名称:</strong> {appInfo.name}</p>
                  <p><strong>Bundle ID:</strong> {appInfo.bundle_id}</p>
                </div>
              </div>
              {appInfo.icon_path && (
                <p className="text-sm text-gray-600"><strong>图标路径:</strong> {appInfo.icon_path}</p>
              )}
              {appInfo.icon_base64 && (
                <p className="text-sm text-green-600">✓ 成功获取应用图标</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AppInfoTest;