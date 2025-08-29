/**
 * 格式化文件大小显示
 * @param {number} sizeInMB - 以MB为单位的文件大小
 * @returns {string} 格式化后的文件大小字符串
 * @example
 * formatFileSize(0.5) // "512.0 KB"
 * formatFileSize(1.5) // "1.5 MB"
 * formatFileSize(1024) // "1.0 GB"
 */
export const formatFileSize = (sizeInMB) => {
  if (sizeInMB < 1) {
    return `${(sizeInMB * 1024).toFixed(1)} KB`;
  } else if (sizeInMB < 1024) {
    return `${sizeInMB.toFixed(1)} MB`;
  } else {
    return `${(sizeInMB / 1024).toFixed(1)} GB`;
  }
};

/**
 * 获取内容类型的中文显示名称
 * @param {string} type - 英文类型名称
 * @returns {string} 中文显示名称
 * @example
 * getTypeDisplayName('text') // "文本"
 * getTypeDisplayName('IMAGE') // "图片"
 * getTypeDisplayName('unknown') // "unknown"
 */
export const getTypeDisplayName = (type) => {
  const typeNames = {
    'text': '文本',
    'image': '图片',
    'file': '文件',
    'html': 'HTML',
    'rtf': 'RTF文档',
    'url': '链接',
    'code': '代码',
    'json': 'JSON',
    'xml': 'XML',
    'csv': 'CSV',
    'markdown': 'Markdown'
  };
  return typeNames[type.toLowerCase()] || type;
};

/**
 * 获取应用程序的中文显示名称
 * @param {string} app - 应用程序名称
 * @returns {string} 中文显示名称
 * @example
 * getAppDisplayName('chrome') // "Chrome浏览器"
 * getAppDisplayName('VSCODE') // "VS Code"
 * getAppDisplayName('') // "未知应用"
 * getAppDisplayName('custom-app') // "custom-app"
 */
export const getAppDisplayName = (app) => {
  if (!app || app === 'unknown' || app === '') {
    return '未知应用';
  }
  
  const appNames = {
    'chrome': 'Chrome浏览器',
    'firefox': 'Firefox浏览器',
    'safari': 'Safari浏览器',
    'vscode': 'VS Code',
    'code': 'VS Code',
    'sublime': 'Sublime Text',
    'atom': 'Atom编辑器',
    'notepad': '记事本',
    'word': 'Microsoft Word',
    'excel': 'Microsoft Excel',
    'powerpoint': 'PowerPoint',
    'finder': 'Finder',
    'terminal': '终端',
    'iterm': 'iTerm',
    'slack': 'Slack',
    'discord': 'Discord',
    'telegram': 'Telegram',
    'wechat': '微信',
    'qq': 'QQ'
  };
  
  const lowerApp = app.toLowerCase();
  return appNames[lowerApp] || app;
};



// 友好错误信息处理
export const getFriendlyErrorMessage = (error, operation) => {
  const errorStr = error.toString().toLowerCase();
  
  if (errorStr.includes('network') || errorStr.includes('connection')) {
    return `${operation}失败：网络连接问题，请检查网络连接后重试`;
  } else if (errorStr.includes('timeout')) {
    return `${operation}失败：操作超时，请稍后重试`;
  } else if (errorStr.includes('permission') || errorStr.includes('access')) {
    return `${operation}失败：权限不足，请检查数据库访问权限`;
  } else if (errorStr.includes('database') || errorStr.includes('sqlite')) {
    return `${operation}失败：数据库错误，请尝试重启应用`;
  } else if (errorStr.includes('locked')) {
    return `${operation}失败：数据库被锁定，请稍后重试`;
  } else if (errorStr.includes('disk') || errorStr.includes('space')) {
    return `${operation}失败：磁盘空间不足，请释放磁盘空间`;
  } else {
    return `${operation}失败：${error.message || '未知错误'}`;
  }
};

// 获取错误解决建议
export const getErrorSolution = (error) => {
  const errorStr = error.toString().toLowerCase();
  
  if (errorStr.includes('network') || errorStr.includes('connection')) {
    return [
      '检查网络连接是否正常',
      '尝试重启应用',
      '检查防火墙设置'
    ];
  } else if (errorStr.includes('timeout')) {
    return [
      '等待几秒后重试',
      '检查系统资源使用情况',
      '关闭其他占用资源的应用'
    ];
  } else if (errorStr.includes('permission') || errorStr.includes('access')) {
    return [
      '检查应用权限设置',
      '以管理员身份运行应用',
      '检查文件夹访问权限'
    ];
  } else if (errorStr.includes('database') || errorStr.includes('sqlite')) {
    return [
      '重启应用程序',
      '检查数据库文件是否损坏',
      '尝试恢复数据库备份'
    ];
  } else if (errorStr.includes('locked')) {
    return [
      '等待当前操作完成',
      '重启应用程序',
      '检查是否有其他进程占用数据库'
    ];
  } else if (errorStr.includes('disk') || errorStr.includes('space')) {
    return [
      '释放磁盘空间',
      '删除不需要的文件',
      '移动数据到其他磁盘'
    ];
  } else {
    return [
      '重试操作',
      '重启应用程序',
      '联系技术支持'
    ];
  }
};

/**
 * 带重试机制的异步操作执行器
 * @param {Function} operation - 要执行的异步操作
 * @param {number} maxRetries - 最大重试次数，默认3次
 * @returns {Promise} 操作结果
 * @throws {Error} 当所有重试都失败时抛出最后一次的错误
 * @example
 * const result = await withRetry(() => fetch('/api/data'), 3);
 */
export const withRetry = async (operation, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

// 生成智能优化建议
export const generateRecommendations = (stats, performanceAnalysis) => {
  const recommendations = [];
  
  if (!stats) return recommendations;

  // 基于WAL页数的建议
  if ((stats.wal_pages || 0) > 1000) {
    recommendations.push({
      type: 'info',
      priority: 'high',
      title: 'WAL文件过大',
      description: `WAL页数已达到 ${(stats.wal_pages || 0).toLocaleString()}，系统将自动执行维护操作以优化性能`,
      action: 'info',
      actionText: '了解更多',
      icon: '⚠️',
      category: 'performance'
    });
  } else if ((stats.wal_pages || 0) > 500) {
    recommendations.push({
      type: 'info',
      priority: 'medium',
      title: 'WAL文件较大',
      description: `WAL页数为 ${(stats.wal_pages || 0).toLocaleString()}，系统会定期自动执行维护操作`,
      action: 'info',
      actionText: '了解更多',
      icon: 'ℹ️',
      category: 'maintenance'
    });
  }

  // 基于记录数量的建议
  if ((stats.total_records || 0) > 100000) {
    recommendations.push({
      type: 'info',
      priority: 'medium',
      title: '记录数量较多',
      description: `当前有 ${(stats.total_records || 0).toLocaleString()} 条记录，可在系统设置中配置自动清理策略`,
      action: 'info',
      actionText: '了解更多',
      icon: '📊',
      category: 'storage'
    });
  }

  // 基于数据库大小的建议
  if ((stats.database_size_mb || 0) > 500) {
    recommendations.push({
      type: 'info',
      priority: 'high',
      title: '数据库文件过大',
      description: `数据库大小已达到 ${formatFileSize(stats.database_size_mb || 0)}，系统将自动执行维护操作并可在系统设置中配置自动清理`,
      action: 'info',
      actionText: '了解更多',
      icon: '💾',
      category: 'storage'
    });
  } else if ((stats.database_size_mb || 0) > 100) {
    recommendations.push({
      type: 'info',
      priority: 'medium',
      title: '数据库文件较大',
      description: `数据库大小为 ${formatFileSize(stats.database_size_mb || 0)}，建议在系统设置中配置自动清理策略`,
      action: 'info',
      actionText: '了解更多',
      icon: '📁',
      category: 'storage'
    });
  }

  // 基于WAL模式的建议
  if (!stats.wal_mode_enabled) {
    recommendations.push({
      type: 'info',
      priority: 'low',
      title: 'WAL模式未启用',
      description: 'WAL模式可以提高并发性能和数据安全性，建议启用',
      action: 'info',
      actionText: '了解更多',
      icon: '⚡',
      category: 'configuration'
    });
  }

  // 基于性能分析结果的建议
  if (performanceAnalysis) {
    if (performanceAnalysis.score < 70) {
      recommendations.push({
        type: 'error',
        priority: 'high',
        title: '性能评分较低',
        description: `当前性能评分为 ${performanceAnalysis.score}/100 (${performanceAnalysis.grade})，需要立即优化`,
        action: 'analysis',
        actionText: '查看详情',
        icon: '📊',
        category: 'performance'
      });
    } else if (performanceAnalysis.score < 85) {
      recommendations.push({
        type: 'warning',
        priority: 'medium',
        title: '性能有待提升',
        description: `当前性能评分为 ${performanceAnalysis.score}/100 (${performanceAnalysis.grade})，建议进行优化`,
        action: 'analysis',
        actionText: '查看详情',
        icon: '📈',
        category: 'performance'
      });
    }
  }

  // 基于数据分布的建议
  if (stats.type_stats && Object.keys(stats.type_stats).length > 0) {
    const totalRecords = stats.total_records || 0;
    const imageCount = stats.type_stats.image || 0;
    const fileCount = stats.type_stats.file || 0;
    
    if ((imageCount + fileCount) / totalRecords > 0.5) {
      recommendations.push({
        type: 'info',
        priority: 'low',
        title: '大文件内容较多',
        description: '图片和文件类型占比较高，这些内容通常占用更多存储空间，可在系统设置中配置清理策略',
        action: 'info',
        actionText: '了解更多',
        icon: '🖼️',
        category: 'storage'
      });
    }
  }

  // 通用建议
  if (recommendations.length === 0) {
    recommendations.push({
      type: 'success',
      priority: 'low',
      title: '数据库状态良好',
      description: '当前数据库运行状态良好，系统会自动执行定期维护操作以保持最佳性能',
      action: 'info',
      actionText: '了解更多',
      icon: '✅',
      category: 'maintenance'
    });
  }

  // 按优先级排序
  const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
  return recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
};