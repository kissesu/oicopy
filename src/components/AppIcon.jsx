import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getAppIcon, getAppIconByName } from '../utils/appIcons';

// 图标缓存
const iconCache = new Map();

function AppIcon({ bundleId, appName, size = 60, className = "" }) {
  const [iconData, setIconData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!bundleId || bundleId === 'unknown.bundle.id') {
      setError(true);
      return;
    }

    // 检查缓存
    if (iconCache.has(bundleId)) {
      const cached = iconCache.get(bundleId);
      if (cached === null) {
        setError(true);
      } else {
        setIconData(cached);
      }
      return;
    }

    // 获取图标
    const fetchIcon = async () => {
      setLoading(true);
      try {
        const result = await invoke('get_app_icon_by_bundle_id', { bundleId });
        console.log("result: ", result);
        console.log("result type: ", typeof result);
        console.log("result length: ", result?.length);
        
        // 检查结果是否为有效的 base64 字符串
        if (result && typeof result === 'string' && result.length > 0) {
          console.log("Setting iconData with valid result");
          iconCache.set(bundleId, result);
          setIconData(result);
          setError(false);
        } else {
          console.log("No valid result received - result is null or empty");
          iconCache.set(bundleId, null);
          setError(true);
        }
      } catch (err) {
        console.error('获取应用图标失败:', err);
        iconCache.set(bundleId, null);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchIcon();
    console.log("iconData", iconData);
    console.log("error", error);
    
  }, [bundleId]);

  if (loading) {
    return (
      <div 
        className={`inline-flex items-center justify-center bg-gray-200 rounded ${className}`}
        style={{ width: size, height: size }}
      >
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
      </div>
    );
  }

  if (error || !iconData) {
    // 使用 emoji 图标作为后备
    const emojiIcon = getAppIcon(bundleId) || getAppIconByName(appName);
    return (
      <span 
        className={`inline-flex items-center justify-center ${className}`}
        style={{ fontSize: size * 0.8 }}
      >
        {emojiIcon}
      </span>
    );
  }

  return (
    <img
      src={`data:image/png;base64,${iconData}`}
      alt={appName || 'App Icon'}
      className={`inline-block ${className}`}
      style={{ width: size, height: size }}
      onError={(e) => {
        console.error('图片加载失败:', e);
        console.log('Failed iconData length:', iconData?.length);
        setError(true);
      }}
    />
  );
}

export default AppIcon;