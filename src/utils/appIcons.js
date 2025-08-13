// 应用图标映射
export const APP_ICONS = {
  // 浏览器
  'com.google.Chrome': '🌐',
  'com.apple.Safari': '🧭',
  'org.mozilla.firefox': '🦊',
  'com.microsoft.edgemac': '🌊',
  'com.operasoftware.Opera': '🎭',
  
  // 开发工具
  'com.microsoft.VSCode': '💻',
  'com.jetbrains.intellij': '💡',
  'com.apple.dt.Xcode': '🔨',
  'com.github.atom': '⚛️',
  'com.sublimetext.4': '📝',
  
  // 聊天工具
  'com.openai.chat': '🤖',
  'com.tencent.xinWeChat': '💬',
  'com.tencent.qq': '🐧',
  'com.microsoft.teams': '👥',
  'us.zoom.xos': '📹',
  'com.slack.Slack': '💼',
  
  // 设计工具
  'com.adobe.photoshop': '🎨',
  'com.figma.Desktop': '🎯',
  'com.bohemiancoding.sketch3': '💎',
  'com.adobe.illustrator': '🖌️',
  
  // 办公软件
  'com.microsoft.Word': '📄',
  'com.microsoft.Excel': '📊',
  'com.microsoft.PowerPoint': '📈',
  'com.apple.iWork.Pages': '📝',
  'com.apple.iWork.Numbers': '🔢',
  'com.apple.iWork.Keynote': '🎤',
  
  // 媒体工具
  'com.spotify.client': '🎵',
  'com.apple.Music': '🎶',
  'com.apple.QuickTimePlayerX': '🎬',
  'com.adobe.PremierePro': '🎞️',
  
  // 系统工具
  'com.apple.finder': '📁',
  'com.apple.Terminal': '⚫',
  'com.apple.ActivityMonitor': '📊',
  'com.apple.systempreferences': '⚙️',
  
  // 默认图标
  'default': '📱'
};

// 根据 Bundle ID 获取应用图标
export function getAppIcon(bundleId) {
  if (!bundleId) return APP_ICONS.default;
  
  // 直接匹配
  if (APP_ICONS[bundleId]) {
    return APP_ICONS[bundleId];
  }
  
  // 模糊匹配
  const lowerBundleId = bundleId.toLowerCase();
  
  if (lowerBundleId.includes('chrome')) return '🌐';
  if (lowerBundleId.includes('safari')) return '🧭';
  if (lowerBundleId.includes('firefox')) return '🦊';
  if (lowerBundleId.includes('vscode') || lowerBundleId.includes('code')) return '💻';
  if (lowerBundleId.includes('chat') || lowerBundleId.includes('gpt')) return '🤖';
  if (lowerBundleId.includes('wechat')) return '💬';
  if (lowerBundleId.includes('qq')) return '🐧';
  if (lowerBundleId.includes('photoshop')) return '🎨';
  if (lowerBundleId.includes('figma')) return '🎯';
  if (lowerBundleId.includes('sketch')) return '💎';
  if (lowerBundleId.includes('word')) return '📄';
  if (lowerBundleId.includes('excel')) return '📊';
  if (lowerBundleId.includes('powerpoint')) return '📈';
  if (lowerBundleId.includes('spotify')) return '🎵';
  if (lowerBundleId.includes('music')) return '🎶';
  if (lowerBundleId.includes('terminal')) return '⚫';
  if (lowerBundleId.includes('finder')) return '📁';
  
  return APP_ICONS.default;
}

// 根据应用名称获取图标（备用方案）
export function getAppIconByName(appName) {
  if (!appName) return APP_ICONS.default;
  
  const lowerName = appName.toLowerCase();
  
  if (lowerName.includes('chrome')) return '🌐';
  if (lowerName.includes('safari')) return '🧭';
  if (lowerName.includes('firefox')) return '🦊';
  if (lowerName.includes('visual studio code') || lowerName.includes('vscode')) return '💻';
  if (lowerName.includes('chatgpt') || lowerName.includes('chat')) return '🤖';
  if (lowerName.includes('wechat') || lowerName.includes('微信')) return '💬';
  if (lowerName.includes('qq')) return '🐧';
  if (lowerName.includes('photoshop')) return '🎨';
  if (lowerName.includes('figma')) return '🎯';
  if (lowerName.includes('sketch')) return '💎';
  if (lowerName.includes('word')) return '📄';
  if (lowerName.includes('excel')) return '📊';
  if (lowerName.includes('powerpoint')) return '📈';
  if (lowerName.includes('spotify')) return '🎵';
  if (lowerName.includes('music') || lowerName.includes('音乐')) return '🎶';
  if (lowerName.includes('terminal') || lowerName.includes('终端')) return '⚫';
  if (lowerName.includes('finder') || lowerName.includes('访达')) return '📁';
  
  return APP_ICONS.default;
}