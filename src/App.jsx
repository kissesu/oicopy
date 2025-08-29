import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { HashRouter, Routes, Route } from "react-router-dom";
import { PermissionContext } from "./context/permissionContext";
import HomePage from "./components/CheckPermissions";
import PanelPage from "./components/PanelPage";
import SettingsPage from "./components/Settings";
import { checkAccessibilityPermission, checkFullDiskAccessPermission } from "tauri-plugin-macos-permissions-api";
import { invoke } from "@tauri-apps/api/core";



const checkPermissions = async () => {
  const isAccessible = await checkAccessibilityPermission();
  const isFullDiskAccessible = await checkFullDiskAccessPermission();

  return { isAccessible, isFullDiskAccessible };
}

class MyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <div>出错啦：{this.state.error?.message}</div>;
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isAccessible, isFullDiskAccessible, setIsAccessible, setIsFullDiskAccessible } = useContext(PermissionContext);
  const navigate = useNavigate();

  useEffect(() => {
    async function checkAndNavigate() {
      // 获取当前窗口标签
      const currentWindow = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
      const windowLabel = currentWindow.label;

      // 如果是设置窗口，直接导航到设置页面，不进行权限检查
      if (windowLabel === 'settings') {
        navigate('/settings');
        return;
      }

      // 如果是权限设置窗口，直接导航到首页（权限设置页面），不进行权限检查
      if (windowLabel === 'check-permissions') {
        navigate('/');
        return;
      }

      // 只有 copy-panel 窗口才进行权限检查和窗口管理
      if (windowLabel === 'copy-panel') {
        // 调用外部定义的 checkPermissions（不要在这里再声明一遍！）
        const { isAccessible, isFullDiskAccessible } = await checkPermissions();

        setIsAccessible(isAccessible);
        setIsFullDiskAccessible(isFullDiskAccessible);
        console.log("isAccessible: ", isAccessible, "isFullDiskAccessible: ", isFullDiskAccessible);

        if (isAccessible && isFullDiskAccessible) {
          // 权限足够，显示面板页面
          navigate("/panel");
        } else {
          // 权限不足，隐藏当前窗口并打开权限设置窗口
          const currentWindow = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
          await currentWindow.hide();
          invoke("open_panel_window", { panelName: "check-permissions" });
        }
      } else {
        // 其他窗口保持在默认路由（首页）
        navigate('/');
      }
    }
    checkAndNavigate();
  }, [navigate]);

  return (
    <main className="app-container !w-full h-full !pt-0">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/panel" element={<PanelPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </main>
  )
}

function App() {

  const [isAccessible, setIsAccessible] = useState(false);
  const [isFullDiskAccessible, setIsFullDiskAccessible] = useState(false);

  return (
    <PermissionContext.Provider
      value={{
        isAccessible,
        setIsAccessible,
        isFullDiskAccessible,
        setIsFullDiskAccessible
      }}
    >
      <HashRouter>
        <MyErrorBoundary>
          <AppContent />
        </MyErrorBoundary>
        {/* <AppContent /> */}
      </HashRouter>
    </PermissionContext.Provider>
  );
}

export default App;
