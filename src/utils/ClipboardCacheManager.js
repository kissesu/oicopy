import { 
  CacheRecordValidator, 
  CacheStatsCalculator, 
  CacheEvents, 
  CacheConstants 
} from './CacheTypes.js';

/**
 * 剪贴板缓存管理器
 * 实现 FIFO + 收藏 + LRU 混合缓存策略
 */
class ClipboardCacheManager {
  constructor(maxSize = CacheConstants.DEFAULT_MAX_SIZE, 
              favoriteLimit = CacheConstants.DEFAULT_FAVORITE_LIMIT, 
              hotLimit = CacheConstants.DEFAULT_HOT_LIMIT) {
    // 缓存配置
    this.maxSize = maxSize;
    this.favoriteLimit = favoriteLimit;
    this.hotLimit = hotLimit;
    
    // 三层缓存存储
    this.favoriteRecords = new Map(); // 收藏层：永久保护
    this.hotRecords = new Map();      // 热点层：LRU管理
    this.normalRecords = [];          // 普通层：FIFO管理
    
    // 统计信息
    this.stats = {
      totalRecords: 0,
      memoryUsage: 0,
      hitCount: 0,
      missCount: 0,
      lastSync: Date.now(),
      pendingSyncs: 0
    };
    
    // FIFO 序号计数器
    this.fifoCounter = 0;
    
    // LRU 访问顺序链表（简化实现）
    this.lruOrder = [];
    
    // 事件监听器
    this.eventListeners = new Map();
    
    console.log('ClipboardCacheManager 初始化完成', {
      maxSize: this.maxSize,
      favoriteLimit: this.favoriteLimit,
      hotLimit: this.hotLimit
    });
  }

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 监听器函数
   */
  addEventListener(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {Function} listener - 监听器函数
   */
  removeEventListener(event, listener) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {Object} data - 事件数据
   */
  _emitEvent(event, data) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          console.error(`事件监听器执行失败 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 获取缓存的历史记录
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @returns {Array} 缓存的记录数组
   */
  getCachedHistory(limit = 50, offset = 0) {
    const startTime = performance.now();
    
    try {
      // 合并三层缓存的数据
      const allRecords = this._getAllRecordsSorted();
      
      // 应用分页
      const result = allRecords.slice(offset, offset + limit);
      
      // 更新统计信息
      this.stats.hitCount++;
      const endTime = performance.now();
      
      console.log(`缓存查询完成: ${result.length}条记录, 耗时: ${(endTime - startTime).toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      console.error('获取缓存历史失败:', error);
      this.stats.missCount++;
      return [];
    }
  }

  /**
   * 添加新记录到缓存顶部
   * @param {Object} record - 剪贴板记录
   */
  prependRecord(record) {
    try {
      // 验证记录格式
      if (!this._validateRecord(record)) {
        console.error('无效的记录格式:', record);
        return false;
      }

      // 增强记录信息
      const enhancedRecord = this._enhanceRecord(record);
      
      // 检查是否已存在（基于content_hash）
      if (this._recordExists(enhancedRecord)) {
        console.log('记录已存在，跳过添加:', enhancedRecord.id);
        return false;
      }

      // 添加到普通层（新记录默认进入FIFO队列）
      this.normalRecords.unshift(enhancedRecord);
      this.stats.totalRecords++;
      
      // 检查是否需要淘汰
      this._evictIfNeeded();
      
      // 更新内存使用统计
      this._updateMemoryUsage();
      
      // 触发事件
      this._emitEvent(CacheEvents.RECORD_ADDED, {
        record: enhancedRecord,
        tier: enhancedRecord.cache_tier
      });
      
      console.log('新记录已添加到缓存:', {
        id: enhancedRecord.id,
        type: enhancedRecord.content_type,
        tier: enhancedRecord.cache_tier
      });
      
      return true;
    } catch (error) {
      console.error('添加记录到缓存失败:', error);
      return false;
    }
  }

  /**
   * 批量添加记录到缓存末尾
   * @param {Array} records - 记录数组
   */
  appendRecords(records) {
    if (!Array.isArray(records)) {
      console.error('appendRecords 需要数组参数');
      return false;
    }

    let addedCount = 0;
    
    try {
      for (const record of records) {
        if (this._validateRecord(record)) {
          const enhancedRecord = this._enhanceRecord(record);
          
          // 检查重复
          if (!this._recordExists(enhancedRecord)) {
            this.normalRecords.push(enhancedRecord);
            this.stats.totalRecords++;
            addedCount++;
          }
        }
      }
      
      // 批量淘汰检查
      this._evictIfNeeded();
      this._updateMemoryUsage();
      
      console.log(`批量添加完成: ${addedCount}/${records.length} 条记录`);
      return true;
    } catch (error) {
      console.error('批量添加记录失败:', error);
      return false;
    }
  }

  /**
   * 切换记录的收藏状态
   * @param {number} recordId - 记录ID
   */
  toggleFavorite(recordId) {
    try {
      // 在各层中查找记录
      let record = this._findRecordById(recordId);
      
      if (!record) {
        console.warn('未找到记录:', recordId);
        return false;
      }

      if (record.is_favorite) {
        // 取消收藏：从收藏层移到热点层或普通层
        this.favoriteRecords.delete(recordId);
        record.is_favorite = false;
        record.cache_tier = 'normal';
        
        // 根据访问频率决定放入热点层还是普通层
        if (record.access_count > 3) {
          record.cache_tier = 'hot';
          this.hotRecords.set(recordId, record);
          this._updateLRUOrder(recordId);
        } else {
          this.normalRecords.unshift(record);
        }
        
        // 触发取消收藏事件
        this._emitEvent(CacheEvents.RECORD_UNFAVORITED, {
          recordId,
          newTier: record.cache_tier
        });
        
        console.log('取消收藏:', recordId);
      } else {
        // 添加收藏：移到收藏层
        if (this.favoriteRecords.size >= this.favoriteLimit) {
          console.warn('收藏数量已达上限:', this.favoriteLimit);
          return false;
        }

        // 从原层级移除
        this._removeFromCurrentTier(recordId);
        
        // 添加到收藏层
        record.is_favorite = true;
        record.cache_tier = CacheConstants.TIER_NAMES.FAVORITE;
        this.favoriteRecords.set(recordId, record);
        
        // 触发收藏事件
        this._emitEvent(CacheEvents.RECORD_FAVORITED, {
          recordId,
          record
        });
        
        console.log('添加收藏:', recordId);
      }
      
      return true;
    } catch (error) {
      console.error('切换收藏状态失败:', error);
      return false;
    }
  }

  /**
   * 清空缓存
   */
  clearCache() {
    try {
      this.favoriteRecords.clear();
      this.hotRecords.clear();
      this.normalRecords = [];
      this.lruOrder = [];
      this.fifoCounter = 0;
      
      // 重置统计信息
      this.stats = {
        totalRecords: 0,
        memoryUsage: 0,
        hitCount: 0,
        missCount: 0,
        lastSync: Date.now(),
        pendingSyncs: 0
      };
      
      // 触发清空事件
      this._emitEvent(CacheEvents.CACHE_CLEARED, {
        timestamp: Date.now()
      });
      
      console.log('缓存已清空');
      return true;
    } catch (error) {
      console.error('清空缓存失败:', error);
      return false;
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats() {
    return {
      ...this.stats,
      hitRate: CacheStatsCalculator.calculateHitRate(this.stats.hitCount, this.stats.missCount),
      tierStats: this.getTierStats()
    };
  }

  /**
   * 获取各层级统计信息
   */
  getTierStats() {
    return {
      favorite: this.favoriteRecords.size,
      hot: this.hotRecords.size,
      normal: this.normalRecords.length,
      total: this.stats.totalRecords
    };
  }

  /**
   * 检查缓存是否需要刷新
   */
  needsRefresh() {
    const now = Date.now();
    const timeSinceLastSync = now - this.stats.lastSync;
    
    // 如果超过5分钟没有同步，或者有待同步操作，则需要刷新
    return timeSinceLastSync > 5 * 60 * 1000 || this.stats.pendingSyncs > 0;
  }

  /**
   * 按混合策略淘汰记录
   * @param {number} targetReduction - 目标减少的记录数量
   */
  evictByStrategy(targetReduction = null) {
    try {
      const initialCount = this.stats.totalRecords;
      
      if (targetReduction === null) {
        // 自动计算需要淘汰的数量
        targetReduction = Math.max(0, this.stats.totalRecords - this.maxSize);
      }
      
      if (targetReduction <= 0) {
        return 0;
      }

      let evictedCount = 0;
      
      // 第一阶段：清理普通层中的过期记录
      evictedCount += this._evictExpiredNormalRecords();
      
      // 第二阶段：FIFO淘汰普通层最旧记录
      if (evictedCount < targetReduction) {
        evictedCount += this._evictNormalRecordsByFIFO(targetReduction - evictedCount);
      }
      
      // 第三阶段：LRU淘汰热点层最少使用记录（降级到普通层）
      if (evictedCount < targetReduction) {
        evictedCount += this._evictHotRecordsByLRU(targetReduction - evictedCount);
      }
      
      // 更新统计信息
      this._updateMemoryUsage();
      
      console.log(`混合策略淘汰完成: ${evictedCount}条记录, 剩余: ${this.stats.totalRecords}条`);
      
      return evictedCount;
    } catch (error) {
      console.error('混合策略淘汰失败:', error);
      return 0;
    }
  }

  /**
   * 智能内存管理
   * @param {number} memoryThreshold - 内存阈值（字节）
   */
  manageMemory(memoryThreshold = 50 * 1024 * 1024) { // 默认50MB
    try {
      const currentUsage = this.stats.memoryUsage;
      
      if (currentUsage <= memoryThreshold) {
        return { cleaned: false, freedMemory: 0 };
      }

      const targetReduction = Math.ceil((currentUsage - memoryThreshold * 0.8) / (currentUsage / this.stats.totalRecords));
      
      console.log(`内存使用超限 (${(currentUsage / 1024 / 1024).toFixed(2)}MB), 开始清理 ${targetReduction} 条记录`);
      
      const evictedCount = this.evictByStrategy(targetReduction);
      const freedMemory = currentUsage - this.stats.memoryUsage;
      
      return {
        cleaned: evictedCount > 0,
        evictedCount,
        freedMemory,
        newUsage: this.stats.memoryUsage
      };
    } catch (error) {
      console.error('内存管理失败:', error);
      return { cleaned: false, error: error.message };
    }
  }

  /**
   * 应用进入后台时的内存优化
   */
  optimizeForBackground() {
    try {
      console.log('应用进入后台，开始内存优化');
      
      // 保留收藏记录和最近的热点记录
      const keepHotCount = Math.min(10, this.hotRecords.size);
      const keepNormalCount = Math.min(20, this.normalRecords.length);
      
      // 清理多余的热点记录
      if (this.hotRecords.size > keepHotCount) {
        const toRemove = Array.from(this.hotRecords.keys()).slice(keepHotCount);
        for (const id of toRemove) {
          this.hotRecords.delete(id);
          this._removeFromLRUOrder(id);
          this.stats.totalRecords--;
        }
      }
      
      // 清理多余的普通记录
      if (this.normalRecords.length > keepNormalCount) {
        const removed = this.normalRecords.splice(keepNormalCount);
        this.stats.totalRecords -= removed.length;
      }
      
      this._updateMemoryUsage();
      
      console.log('后台优化完成:', this.getTierStats());
      
      return true;
    } catch (error) {
      console.error('后台优化失败:', error);
      return false;
    }
  }

  /**
   * 应用重新激活时恢复缓存
   */
  async restoreFromBackground() {
    try {
      console.log('应用重新激活，恢复缓存');
      
      // 这里可以触发预加载服务重新加载数据
      // 实际实现会在 PreloadService 中处理
      
      return true;
    } catch (error) {
      console.error('缓存恢复失败:', error);
      return false;
    }
  }

  /**
   * 记录访问，用于LRU和热点检测
   * @param {number} recordId - 记录ID
   */
  recordAccess(recordId) {
    try {
      let record = this._findRecordById(recordId);
      
      if (!record) {
        return false;
      }

      // 更新访问统计
      record.access_count = (record.access_count || 0) + 1;
      record.last_accessed = Date.now();
      
      // 根据访问频率决定是否提升到热点层
      if (record.cache_tier === 'normal' && record.access_count >= 3) {
        this._promoteToHot(recordId);
      } else if (record.cache_tier === 'hot') {
        this._updateLRUOrder(recordId);
      }
      
      return true;
    } catch (error) {
      console.error('记录访问失败:', error);
      return false;
    }
  }

  /**
   * 获取内存使用详情
   */
  getMemoryDetails() {
    const allRecords = this._getAllRecords();
    const sizeAnalysis = CacheStatsCalculator.analyzeRecordSizes(allRecords);
    
    // 按层级分组计算
    const byTier = {
      favorite: CacheStatsCalculator.calculateMemoryUsage(Array.from(this.favoriteRecords.values())),
      hot: CacheStatsCalculator.calculateMemoryUsage(Array.from(this.hotRecords.values())),
      normal: CacheStatsCalculator.calculateMemoryUsage(this.normalRecords)
    };

    return {
      total: this.stats.memoryUsage,
      byTier,
      ...sizeAnalysis
    };
  }

  // ========== 私有方法 ==========

  /**
   * 验证记录格式
   */
  _validateRecord(record) {
    return CacheRecordValidator.validate(record);
  }

  /**
   * 增强记录信息
   */
  _enhanceRecord(record) {
    // 使用验证器清理和增强记录
    let enhancedRecord = CacheRecordValidator.sanitize(record);
    
    if (!enhancedRecord) {
      throw new Error('记录验证失败');
    }
    
    // 添加缓存特有字段
    enhancedRecord.cached_at = Date.now();
    enhancedRecord.fifo_order = this.fifoCounter++;
    
    // 对大型内容进行压缩
    enhancedRecord = this._compressLargeContent(enhancedRecord);
    
    return enhancedRecord;
  }

  /**
   * 检查记录是否已存在
   */
  _recordExists(record) {
    const id = record.id;
    
    return this.favoriteRecords.has(id) ||
           this.hotRecords.has(id) ||
           this.normalRecords.some(r => r.id === id);
  }

  /**
   * 根据ID查找记录
   */
  _findRecordById(recordId) {
    // 先在收藏层查找
    if (this.favoriteRecords.has(recordId)) {
      return this.favoriteRecords.get(recordId);
    }
    
    // 再在热点层查找
    if (this.hotRecords.has(recordId)) {
      return this.hotRecords.get(recordId);
    }
    
    // 最后在普通层查找
    return this.normalRecords.find(r => r.id === recordId);
  }

  /**
   * 从当前层级移除记录
   */
  _removeFromCurrentTier(recordId) {
    // 从收藏层移除
    if (this.favoriteRecords.has(recordId)) {
      this.favoriteRecords.delete(recordId);
      return;
    }
    
    // 从热点层移除
    if (this.hotRecords.has(recordId)) {
      this.hotRecords.delete(recordId);
      this._removeFromLRUOrder(recordId);
      return;
    }
    
    // 从普通层移除
    const index = this.normalRecords.findIndex(r => r.id === recordId);
    if (index !== -1) {
      this.normalRecords.splice(index, 1);
    }
  }

  /**
   * 获取所有记录并按时间排序
   */
  _getAllRecordsSorted() {
    const allRecords = [];
    
    // 收藏层记录
    for (const record of this.favoriteRecords.values()) {
      allRecords.push(record);
    }
    
    // 热点层记录
    for (const record of this.hotRecords.values()) {
      allRecords.push(record);
    }
    
    // 普通层记录
    allRecords.push(...this.normalRecords);
    
    // 按时间戳降序排序（最新的在前）
    return allRecords.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });
  }

  /**
   * 更新LRU顺序
   */
  _updateLRUOrder(recordId) {
    // 移除旧位置
    this._removeFromLRUOrder(recordId);
    
    // 添加到最前面
    this.lruOrder.unshift(recordId);
    
    // 限制LRU列表长度
    if (this.lruOrder.length > this.hotLimit) {
      this.lruOrder = this.lruOrder.slice(0, this.hotLimit);
    }
  }

  /**
   * 从LRU顺序中移除
   */
  _removeFromLRUOrder(recordId) {
    const index = this.lruOrder.indexOf(recordId);
    if (index !== -1) {
      this.lruOrder.splice(index, 1);
    }
  }

  /**
   * 检查是否需要淘汰并执行淘汰
   */
  _evictIfNeeded() {
    // 检查普通层是否超限
    const normalLimit = this.maxSize - this.favoriteRecords.size - this.hotRecords.size;
    
    while (this.normalRecords.length > normalLimit) {
      // FIFO淘汰：移除最旧的记录
      const evicted = this.normalRecords.pop();
      if (evicted) {
        this.stats.totalRecords--;
        console.log('FIFO淘汰记录:', evicted.id);
      }
    }
    
    // 检查热点层是否超限
    while (this.hotRecords.size > this.hotLimit) {
      // LRU淘汰：移除最少使用的记录
      const lruId = this.lruOrder.pop();
      if (lruId && this.hotRecords.has(lruId)) {
        const evicted = this.hotRecords.get(lruId);
        this.hotRecords.delete(lruId);
        
        // 降级到普通层
        if (evicted) {
          evicted.cache_tier = 'normal';
          this.normalRecords.push(evicted);
          console.log('LRU淘汰记录到普通层:', lruId);
        }
      }
    }
  }

  /**
   * 更新内存使用统计
   */
  _updateMemoryUsage() {
    const allRecords = this._getAllRecords();
    this.stats.memoryUsage = CacheStatsCalculator.calculateMemoryUsage(allRecords);
    
    // 检查内存警告
    if (this.stats.memoryUsage > CacheConstants.DEFAULT_MEMORY_THRESHOLD) {
      this._emitEvent(CacheEvents.MEMORY_WARNING, {
        currentUsage: this.stats.memoryUsage,
        threshold: CacheConstants.DEFAULT_MEMORY_THRESHOLD
      });
    }
  }

  /**
   * 获取所有记录（不排序）
   */
  _getAllRecords() {
    const allRecords = [];
    
    // 收藏层记录
    for (const record of this.favoriteRecords.values()) {
      allRecords.push(record);
    }
    
    // 热点层记录
    for (const record of this.hotRecords.values()) {
      allRecords.push(record);
    }
    
    // 普通层记录
    allRecords.push(...this.normalRecords);
    
    return allRecords;
  }

  /**
   * 清理普通层中的过期记录
   */
  _evictExpiredNormalRecords() {
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000; // 24小时
    let evictedCount = 0;
    
    this.normalRecords = this.normalRecords.filter(record => {
      const age = now - record.cached_at;
      if (age > expireTime && record.access_count < 2) {
        evictedCount++;
        this.stats.totalRecords--;
        return false;
      }
      return true;
    });
    
    if (evictedCount > 0) {
      console.log(`清理过期记录: ${evictedCount}条`);
    }
    
    return evictedCount;
  }

  /**
   * FIFO淘汰普通层记录
   */
  _evictNormalRecordsByFIFO(targetCount) {
    const toEvict = Math.min(targetCount, this.normalRecords.length);
    
    if (toEvict <= 0) {
      return 0;
    }

    // 按FIFO顺序淘汰（最旧的先淘汰）
    const evicted = this.normalRecords.splice(-toEvict, toEvict);
    this.stats.totalRecords -= evicted.length;
    
    console.log(`FIFO淘汰: ${evicted.length}条记录`);
    
    return evicted.length;
  }

  /**
   * LRU淘汰热点层记录（降级到普通层）
   */
  _evictHotRecordsByLRU(targetCount) {
    const toEvict = Math.min(targetCount, this.hotRecords.size);
    
    if (toEvict <= 0) {
      return 0;
    }

    let evictedCount = 0;
    
    // 从LRU列表末尾开始淘汰
    for (let i = 0; i < toEvict && this.lruOrder.length > 0; i++) {
      const lruId = this.lruOrder.pop();
      
      if (this.hotRecords.has(lruId)) {
        const record = this.hotRecords.get(lruId);
        this.hotRecords.delete(lruId);
        
        // 降级到普通层
        record.cache_tier = CacheConstants.TIER_NAMES.NORMAL;
        this.normalRecords.push(record);
        
        // 触发降级事件
        this._emitEvent(CacheEvents.TIER_DEMOTED, {
          recordId: lruId,
          fromTier: CacheConstants.TIER_NAMES.HOT,
          toTier: CacheConstants.TIER_NAMES.NORMAL
        });
        
        evictedCount++;
      }
    }
    
    if (evictedCount > 0) {
      console.log(`LRU降级: ${evictedCount}条记录从热点层降级到普通层`);
    }
    
    return evictedCount;
  }

  /**
   * 提升记录到热点层
   */
  _promoteToHot(recordId) {
    try {
      // 只能从普通层提升
      const recordIndex = this.normalRecords.findIndex(r => r.id === recordId);
      
      if (recordIndex === -1) {
        return false;
      }

      // 检查热点层是否有空间
      if (this.hotRecords.size >= this.hotLimit) {
        // 淘汰一个最少使用的热点记录
        this._evictHotRecordsByLRU(1);
      }

      // 移动记录
      const record = this.normalRecords.splice(recordIndex, 1)[0];
      record.cache_tier = CacheConstants.TIER_NAMES.HOT;
      
      this.hotRecords.set(recordId, record);
      this._updateLRUOrder(recordId);
      
      // 触发提升事件
      this._emitEvent(CacheEvents.TIER_PROMOTED, {
        recordId,
        fromTier: CacheConstants.TIER_NAMES.NORMAL,
        toTier: CacheConstants.TIER_NAMES.HOT
      });
      
      console.log(`记录提升到热点层: ${recordId}`);
      
      return true;
    } catch (error) {
      console.error('提升到热点层失败:', error);
      return false;
    }
  }

  /**
   * 压缩大型内容以节省内存
   */
  _compressLargeContent(record) {
    try {
      const threshold = CacheConstants.DEFAULT_COMPRESSION_THRESHOLD;
      
      // 对于大型内容进行压缩
      if (record.content.length > threshold) {
        if (record.content_type === CacheConstants.CONTENT_TYPES.HTML) {
          // HTML内容压缩：移除多余的空白字符
          record.content = record.content
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
        } else if (record.content_type === CacheConstants.CONTENT_TYPES.TEXT) {
          // 文本内容压缩：移除多余的换行和空格
          record.content = record.content
            .replace(/\n\s*\n/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .trim();
        }
        
        // 标记为已压缩
        record._compressed = true;
      }
      
      return record;
    } catch (error) {
      console.error('内容压缩失败:', error);
      return record;
    }
  }

  /**
   * 解压缩内容
   */
  _decompressContent(record) {
    // 当前实现中压缩是不可逆的简化版本
    // 在实际应用中可以使用专门的压缩库
    return record;
  }
}

export default ClipboardCacheManager;