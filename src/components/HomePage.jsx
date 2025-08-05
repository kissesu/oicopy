import React from "react";
import { requestAccessibilityPermission, requestFullDiskAccessPermission } from "tauri-plugin-macos-permissions-api"
import { usePermissionContext } from "../context/permissionContext";


function HomePage() {
  const { isAccessible, setIsAccessible, isFullDiskAccessible, setIsFullDiskAccessible } = usePermissionContext();

  const requestAccessibilityPerm = async () => {
    setIsAccessible(await requestAccessibilityPermission());
    console.log("isAccessible", isAccessible)
  };

  // 请求完全磁盘访问权限
  const requestFullDiskAccessPerm = async () => {
    console.log('走了这里');
    
    setIsFullDiskAccessible(await requestFullDiskAccessPermission());
    console.log("isFullDiskAccessible", isFullDiskAccessible);
    
  };

  return (
    <div className="flex flex-col mx-2 font-bold">
      <div className="flex items-center gap-2 mx-2 my-2 py-1">
        {/* <span className="fas fa-info-circle text-green-500 text-md" ></span> */}
        <span className="material-icons text-green-500 !text-[18px]">info</span>
        <p className="text-xs ml-1">允许下面的权限, 然后重启 App</p>
      </div>
      <hr className="border-gray-300" />
      <div className="flex flex-col gap-4 my-4">
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="material-icons !text-md">accessibility</span>
            <p className="text-sm">辅助功能</p>
          </div>
          <p className="text-xs text-gray-700 w-40 text-start pl-4">允许辅助功能权限</p>
          { !isAccessible ?
            <button
              className="!text-white !text-[12px] w-25 px-10 !py-0 !bg-blue-500 text-white !rounded-sm"
              onClick={requestAccessibilityPerm}
            >允许</button>
            :
            <span
              className="!text-white !text-[12px] w-25 !py-0 !bg-green-500 text-white !rounded-sm"
            >已授权</span>
          }

        </div>
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="material-icons">save</span>
            <p className="text-sm">磁盘访问</p>
          </div>
          <p className="text-xs text-gray-700 w-40 text-start pl-4">允许完全磁盘访问权限</p>
          {
            !isFullDiskAccessible ?
              <button
                className="!text-white !text-[12px] w-25 px-10 !py-0 !bg-blue-500 text-white !rounded-sm"
                onClick={requestFullDiskAccessPerm}
              >允许</button>
              :
              <span
                className="!text-white !text-[12px] w-25 !py-0 !bg-green-500 text-white !rounded-sm"
              >已授权</span>
          }

        </div>
      </div>
    </div>
  );
}

export default HomePage;
