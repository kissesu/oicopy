/**
 * 剪贴板缓存系统的数据模型和类型定义
 */

/**
 * 缓存记录接口
 * @typedef {Object} CacheRecord
 * @property {number} id - 记录ID
 * @property {string} content_type - 内容类型 ('text', 'html', 'image', 'files', 'rtf')
 * @property {string} content - 内容数据
 * @property {string} [content_hash] - 内容哈希值
 * @property {string} preview - 预览文本
 * @property {string} timestamp - 时间戳
 * @property {string} [source_app] - 来源应用名称
 * @property {string} [source_bundle_id] - 来源应用Bundle ID
 * @property {string} [app_icon_base64] - 应用图标Base64
 * @property {number} cached_at - 缓存时间戳
 * @property {number} access_count - 访问次数
 * @property {number} last_accessed - 最后访问时间
 * @property {boolean} is_favorite - 是否收藏
 * @property {'favorite'|'hot'|'normal'} cache_tier - 缓存层级
 * @property {number} fifo_order - FIFO排序序号
 * @property {boolean} [_compressed] - 是否已压缩
 */

/**
 * 缓存统计信息
 * @typedef {Object} CacheStats
 * @property {number} totalRecords - 总记录数
 * @property {number} memoryUsage - 内存使用量（字节）
 * @property {number} hitCount - 缓存命中次数
 * @property {number} missCount - 缓存未命中次数
 * @property {number} hitRate - 缓存命中率
 * @property {number} lastSync - 最后同步时间
 * @property {number} pendingSyncs - 待同步操作数量
 * @property {TierStats} tierStats - 各层级统计
 */

/**
 * 层级统计信息
 * @typedef {Object} TierStats
 * @property {number} favorite - 收藏层记录数
 * @property {number} hot - 热点层记录数
 * @property {number} normal - 普通层记录数
 * @property {number} total - 总记录数
 */

/**
 * 预加载状态
 * @typedef {Object} PreloadStatus
 * @property {'idle'|'loading'|'completed'|'error'} status - 预加载状态
 * @property {number} progress - 进度百分比 (0-100)
 * @property {number} loadedRecords - 已加载记录数
 * @property {number} [totalRecords] - 总记录数
 * @property {string} [errorMessage] - 错误信息
 */

/**
 * 内存使用详情
 * @typedef {Object} MemoryDetails
 * @property {number} total - 总内存使用量
 * @property {Object} byTier - 按层级的内存使用
 * @property {number} byTier.favorite - 收藏层内存使用
 * @property {number} byTier.hot - 热点层内存使用
 * @property {number} byTier.normal - 普通层内存使用
 * @property {number} averageRecordSize - 平均记录大小
 * @property {Array<Object>} largestRecords - 最大的记录列表
 */

/**
 * 同步操作类型
 * @typedef {'add'|'update'|'delete'|'favorite'|'batch'} SyncOperationType
 */

/**
 * 同步任务
 * @typedef {Object} SyncTask
 * @property {string} id - 任务ID
 * @property {SyncOperationType} type - 操作类型
 * @property {Object} data - 操作数据
 * @property {number} priority - 优先级 (1-10, 数字越大优先级越高)
 * @property {number} createdAt - 创建时间
 * @property {number} retryCount - 重试次数
 * @property {number} maxRetries - 最大重试次数
 * @property {string} [error] - 错误信息
 */

/**
 * 缓存配置
 * @typedef {Object} CacheConfig
 * @property {number} maxSize - 最大缓存大小
 * @property {number} favoriteLimit - 收藏层限制
 * @property {number} hotLimit - 热点层限制
 * @property {number} memoryThreshold - 内存阈值（字节）
 * @property {number} expireTime - 过期时间（毫秒）
 * @property {boolean} enableCompression - 是否启用压缩
 * @property {number} compressionThreshold - 压缩阈值（字节）
 */

/**
 * 缓存记录验证器
 */
export class CacheRecordValidator {
  /**
   * 验证缓存记录格式
   * @param {Object} record - 待验证的记录
   * @returns {boolean} 是否有效
   */
  static validate(record) {
    if (!record || typeof record !== 'object') {
      return false;
    }

    // 必需字段检查
    const requiredFields = ['id', 'content_type', 'content', 'timestamp'];
    for (const field of requiredFields) {
      if (record[field] === undefined || record[field] === null) {
        console.warn(`缓存记录缺少必需字段: ${field}`);
        return false;
      }
    }

    // 类型检查
    if (typeof record.id !== 'number' && typeof record.id !== 'string') {
      console.warn('记录ID必须是数字或字符串');
      return false;
    }

    if (typeof record.content_type !== 'string') {
      console.warn('内容类型必须是字符串');
      return false;
    }

    // 内容类型验证
    const validTypes = ['text', 'html', 'image', 'files', 'rtf'];
    if (!validTypes.includes(record.content_type)) {
      console.warn(`无效的内容类型: ${record.content_type}`);
      return false;
    }

    // 时间戳验证
    const timestamp = new Date(record.timestamp);
    if (isNaN(timestamp.getTime())) {
      console.warn('无效的时间戳格式');
      return false;
    }

    return true;
  }

  /**
   * 验证并清理记录
   * @param {Object} record - 待清理的记录
   * @returns {Object|null} 清理后的记录或null
   */
  static sanitize(record) {
    if (!this.validate(record)) {
      return null;
    }

    const sanitized = {
      id: record.id,
      content_type: record.content_type,
      content: String(record.content || ''),
      content_hash: record.content_hash || null,
      preview: String(record.preview || ''),
      timestamp: record.timestamp,
      source_app: record.source_app || null,
      source_bundle_id: record.source_bundle_id || null,
      app_icon_base64: record.app_icon_base64 || null,
      
      // 缓存特有字段
      cached_at: record.cached_at || Date.now(),
      access_count: Math.max(0, parseInt(record.access_count) || 0),
      last_accessed: record.last_accessed || Date.now(),
      is_favorite: Boolean(record.is_favorite),
      cache_tier: this._validateTier(record.cache_tier),
      fifo_order: parseInt(record.fifo_order) || 0,
      _compressed: Boolean(record._compressed)
    };

    return sanitized;
  }

  /**
   * 验证缓存层级
   * @param {string} tier - 层级名称
   * @returns {string} 有效的层级名称
   */
  static _validateTier(tier) {
    const validTiers = ['favorite', 'hot', 'normal'];
    return validTiers.includes(tier) ? tier : 'normal';
  }
}

/**
 * 缓存统计计算器
 */
export class CacheStatsCalculator {
  /**
   * 计算内存使用量
   * @param {Array<CacheRecord>} records - 记录数组
   * @returns {number} 内存使用量（字节）
   */
  static calculateMemoryUsage(records) {
    let totalSize = 0;
    
    for (const record of records) {
      // 基础对象大小
      totalSize += 200; // 估算对象开销
      
      // 字符串字段大小
      totalSize += (record.content || '').length * 2;
      totalSize += (record.preview || '').length * 2;
      totalSize += (record.content_hash || '').length * 2;
      totalSize += (record.source_app || '').length * 2;
      totalSize += (record.source_bundle_id || '').length * 2;
      totalSize += (record.app_icon_base64 || '').length * 2;
      totalSize += record.timestamp.length * 2;
      
      // 数字字段大小
      totalSize += 8 * 6; // 6个数字字段，每个8字节
      
      // 布尔字段大小
      totalSize += 4 * 2; // 2个布尔字段，每个4字节
    }
    
    return totalSize;
  }

  /**
   * 计算缓存命中率
   * @param {number} hitCount - 命中次数
   * @param {number} missCount - 未命中次数
   * @returns {number} 命中率 (0-1)
   */
  static calculateHitRate(hitCount, missCount) {
    const total = hitCount + missCount;
    return total > 0 ? hitCount / total : 0;
  }

  /**
   * 分析记录大小分布
   * @param {Array<CacheRecord>} records - 记录数组
   * @returns {Object} 大小分布统计
   */
  static analyzeRecordSizes(records) {
    const sizes = records.map(record => {
      const size = this.calculateMemoryUsage([record]);
      return { id: record.id, type: record.content_type, size };
    });

    sizes.sort((a, b) => b.size - a.size);

    const totalSize = sizes.reduce((sum, item) => sum + item.size, 0);
    const averageSize = totalSize / sizes.length || 0;

    return {
      total: totalSize,
      average: averageSize,
      largest: sizes.slice(0, 5),
      smallest: sizes.slice(-5).reverse(),
      byType: this._groupSizesByType(sizes)
    };
  }

  /**
   * 按类型分组大小统计
   * @param {Array} sizes - 大小数组
   * @returns {Object} 按类型分组的统计
   */
  static _groupSizesByType(sizes) {
    const grouped = {};
    
    for (const item of sizes) {
      if (!grouped[item.type]) {
        grouped[item.type] = {
          count: 0,
          totalSize: 0,
          averageSize: 0
        };
      }
      
      grouped[item.type].count++;
      grouped[item.type].totalSize += item.size;
    }
    
    // 计算平均大小
    for (const type in grouped) {
      grouped[type].averageSize = grouped[type].totalSize / grouped[type].count;
    }
    
    return grouped;
  }
}

/**
 * 缓存事件类型
 */
export const CacheEvents = {
  RECORD_ADDED: 'record_added',
  RECORD_UPDATED: 'record_updated',
  RECORD_REMOVED: 'record_removed',
  RECORD_FAVORITED: 'record_favorited',
  RECORD_UNFAVORITED: 'record_unfavorited',
  TIER_PROMOTED: 'tier_promoted',
  TIER_DEMOTED: 'tier_demoted',
  CACHE_CLEARED: 'cache_cleared',
  MEMORY_WARNING: 'memory_warning',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed'
};

/**
 * 缓存常量
 */
export const CacheConstants = {
  DEFAULT_MAX_SIZE: 100,
  DEFAULT_FAVORITE_LIMIT: 50,
  DEFAULT_HOT_LIMIT: 30,
  DEFAULT_MEMORY_THRESHOLD: 50 * 1024 * 1024, // 50MB
  DEFAULT_EXPIRE_TIME: 24 * 60 * 60 * 1000, // 24小时
  DEFAULT_COMPRESSION_THRESHOLD: 10000, // 10KB
  
  TIER_NAMES: {
    FAVORITE: 'favorite',
    HOT: 'hot',
    NORMAL: 'normal'
  },
  
  CONTENT_TYPES: {
    TEXT: 'text',
    HTML: 'html',
    IMAGE: 'image',
    FILES: 'files',
    RTF: 'rtf'
  }
};

export default {
  CacheRecordValidator,
  CacheStatsCalculator,
  CacheEvents,
  CacheConstants
};