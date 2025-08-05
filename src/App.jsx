import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";
import { HashRouter, Routes, Route } from "react-router-dom";
import { PermissionContext } from "./context/permissionContext";
import HomePage from "./components/HomePage";
import PanelPage from "./components/PanelPage";
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
      // 调用外部定义的 checkPermissions（不要在这里再声明一遍！）
      const { isAccessible, isFullDiskAccessible } = await checkPermissions();

      setIsAccessible(isAccessible);
      setIsFullDiskAccessible(isFullDiskAccessible);
      console.log("isAccessible: ", isAccessible, "isFullDiskAccessible: ", isFullDiskAccessible);

      if (isAccessible && isFullDiskAccessible) {
        // // 确认 getCurrentWindow() 返回的是 Promise
        // await getCurrentWindow().setDecorations(false);
        navigate("/panel");
        invoke("open_panel_window", { panelName: "copy-panel" });
      } else {
        invoke("open_panel_window", { panelName: "setting-panel" });
      }
    }
    checkAndNavigate();
  }, [isAccessible, isFullDiskAccessible, navigate]);
  return (
    <main className="app-container !w-full h-full !pt-0">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/panel" element={<PanelPage />} />
      </Routes>
    </main>
  )
}

function App() {

  const [isAccessible, setIsAccessible] = useState(true);
  const [isFullDiskAccessible, setIsFullDiskAccessible] = useState(true);

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
