import React, { useState, useEffect } from "react";
import { requestAccessibilityPermission, requestFullDiskAccessPermission } from "tauri-plugin-macos-permissions-api"
import { usePermissionContext } from "../context/permissionContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';


function HomePage() {
  const { isAccessible, setIsAccessible, isFullDiskAccessible, setIsFullDiskAccessible } = usePermissionContext();
  const [isSettingPanel, setIsSettingPanel] = useState(false);

  useEffect(() => {
    async function checkWindowType() {
      const currentWindow = getCurrentWindow();
      const windowLabel = currentWindow.label;
      const isSettingPanelWindow = windowLabel === 'check-permissions';
      setIsSettingPanel(isSettingPanelWindow);

      // 如果是 check-permissions 窗口，也检查一次权限状态
      if (isSettingPanelWindow) {
        console.log('在 check-permissions 窗口中检查权限状态');
        await checkCurrentPermissions();
      }
    }
    checkWindowType();
  }, []);

  // 检查当前权限状态
  const checkCurrentPermissions = async () => {
    try {
      const { checkAccessibilityPermission, checkFullDiskAccessPermission } = await import("tauri-plugin-macos-permissions-api");
      const currentAccessible = await checkAccessibilityPermission();
      const currentFullDiskAccessible = await checkFullDiskAccessPermission();

      console.log('实时权限检查结果:');
      console.log('当前窗口类型: ', isSettingPanel ? 'check-permissions' : 'other');
      console.log('辅助功能权限: ', currentAccessible);
      console.log('磁盘访问权限: ', currentFullDiskAccessible);

      setIsAccessible(currentAccessible);
      setIsFullDiskAccessible(currentFullDiskAccessible);

      return { currentAccessible, currentFullDiskAccessible };
    } catch (error) {
      console.error('检查权限状态失败:', error);
      return { currentAccessible: false, currentFullDiskAccessible: false };
    }
  };

  // 在 check-permissions 窗口中定时检查权限状态
  useEffect(() => {
    if (isSettingPanel) {
      console.log('开始定时检查权限状态');
      const interval = setInterval(async () => {
        console.log('定时检查权限状态...');
        await checkCurrentPermissions();
      }, 2000); // 每2秒检查一次

      return () => {
        console.log('停止定时检查权限状态');
        clearInterval(interval);
      };
    }
  }, [isSettingPanel]);

  // 监听权限状态变化，当权限都授权完成后自动切换到主面板
  useEffect(() => {
    console.log("isSettingPanel: ", isSettingPanel);
    console.log("isAccessible: ", isAccessible);
    console.log("isFullDiskAccessible: ", isFullDiskAccessible);
    if (isSettingPanel && isAccessible && isFullDiskAccessible) {
      const switchToMainPanel = async () => {
        try {
          console.log('权限已全部授权，准备切换到主面板');
          console.log('当前权限状态 - 辅助功能:', isAccessible, '磁盘访问:', isFullDiskAccessible);

          // 先关闭设置面板
          await invoke('hide_panel_window', { panelName: "check-permissions" });
          console.log('设置面板已关闭');

          // 稍等一下确保设置面板完全关闭
          await new Promise(resolve => setTimeout(resolve, 300));
          // 打开主面板
          await invoke('open_panel_window', { panelName: "copy-panel" });
          console.log('主面板已打开');
        } catch (error) {
          console.error('切换到主面板失败:', error);
        }
      };

      // 延迟一下，让用户看到权限已授权的状态
      setTimeout(switchToMainPanel, 1500);
    }
  }, [isSettingPanel, isAccessible, isFullDiskAccessible]);

  const requestAccessibilityPerm = async () => {
    try {
      const result = await requestAccessibilityPermission();
      console.log("辅助功能权限请求结果:", result);
      setIsAccessible(result);
    } catch (error) {
      console.error("请求辅助功能权限失败:", error);
    }
  };

  // 请求完全磁盘访问权限
  const requestFullDiskAccessPerm = async () => {
    try {
      const result = await requestFullDiskAccessPermission();
      console.log("磁盘访问权限请求结果:", result);
      setIsFullDiskAccessible(result);
    } catch (error) {
      console.error("请求磁盘访问权限失败:", error);
    }
  };



  return (
    <div className={`flex flex-col font-bold relative ${isSettingPanel ? 'h-full p-4 bg-gradient-to-br from-blue-50 to-white' : 'mx-2'}`}>


      <div className={`flex items-center gap-2 ${isSettingPanel ? 'mb-4' : 'mx-2 my-2 py-1'}`}>
        <span className="material-icons text-green-500 !text-[18px]">info</span>
        <p className="text-xs ml-1">
          {isSettingPanel ? '请授权下面的权限以使用剪贴板功能' : '允许下面的权限, 然后重启 App'}
        </p>
        {isSettingPanel && (
          <button
            onClick={checkCurrentPermissions}
            className="ml-auto text-xs px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors duration-200"
            title="刷新权限状态"
          >
            刷新
          </button>
        )}
      </div>

      {!isSettingPanel && <hr className="border-gray-300" />}

      {/* 权限状态提示 */}
      {isSettingPanel && (!isAccessible || !isFullDiskAccessible) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <span className="material-icons text-yellow-600 !text-[16px] mt-0.5">warning</span>
            <div className="text-xs text-yellow-800">
              <p className="font-medium mb-1">权限检测提示：</p>
              <p>如果您已在系统设置中授权但仍显示未授权，请尝试：</p>
              <p>1. 点击"刷新"按钮重新检查权限状态</p>
              <p>2. 完全退出应用后重新启动</p>
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-col gap-3 ${isSettingPanel ? 'bg-white rounded-lg p-4 shadow-sm border border-gray-200' : 'my-3'}`}>
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="material-icons !text-md text-blue-600">accessibility</span>
            <p className="text-sm font-medium">辅助功能</p>
          </div>
          <p className="text-xs text-gray-600 w-32 text-left">允许辅助功能权限</p>
          {!isAccessible ?
            <button
              className="text-white text-xs px-4 py-1 bg-blue-500 hover:bg-blue-600 rounded transition-colors duration-200 whitespace-nowrap"
              onClick={requestAccessibilityPerm}
            >允许</button>
            :
            <span className="text-white text-xs px-4 py-1 bg-green-500 rounded whitespace-nowrap">已授权</span>
          }
        </div>

        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="material-icons text-orange-600">storage</span>
            <p className="text-sm font-medium">磁盘访问</p>
          </div>
          <p className="text-xs text-gray-600 w-32 text-left">允许完全磁盘访问权限</p>
          {
            !isFullDiskAccessible ?
              <button
                className="text-white text-xs px-4 py-1 bg-blue-500 hover:bg-blue-600 rounded transition-colors duration-200 whitespace-nowrap"
                onClick={requestFullDiskAccessPerm}
              >允许</button>
              :
              <span className="text-white text-xs px-4 py-1 bg-green-500 rounded whitespace-nowrap">已授权</span>
          }
        </div>
      </div>
    </div>
  );
}

export default HomePage;
