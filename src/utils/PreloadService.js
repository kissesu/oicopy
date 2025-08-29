import { invoke } from "@tauri-apps/api/core";
import { CacheConstants } from './CacheTypes.js';

/**
 * 预加载服务
 * 负责应用启动时预加载剪贴板历史数据到缓存
 */
class PreloadService {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    
    // 预加载状态
    this.status = {
      status: 'idle',
      progress: 0,
      loadedRecords: 0,
      totalRecords: null,
      errorMessage: null,
      startTime: null,
      endTime: null
    };
    
    // 预加载配置
    this.config = {
      initialBatchSize: 10,    // 首批加载数量（最重要的记录）
      secondBatchSize: 20,     // 第二批加载数量
      batchSize: 30,           // 后续批次大小
      maxRecords: 200,         // 最大预加载记录数
      timeout: 10000,          // 超时时间（毫秒）
      retryAttempts: 3,        // 重试次数
      retryDelay: 1000,        // 重试延迟（毫秒）
      
      // 渐进式加载配置
      phases: [
        { name: 'critical', size: 10, priority: 'high' },    // 关键数据
        { name: 'important', size: 20, priority: 'medium' }, // 重要数据
        { name: 'normal', size: 50, priority: 'low' },      // 普通数据
        { name: 'background', size: 120, priority: 'idle' }  // 后台数据
      ],
      
      // 智能加载配置
      idleThreshold: 100,      // 空闲检测阈值（毫秒）
      adaptiveBatching: true,  // 自适应批次大小
      performanceMode: 'balanced' // 性能模式: 'fast', 'balanced', 'memory'
    };
    
    // 事件监听器
    this.eventListeners = new Map();
    
    // 渐进式加载状态
    this.progressiveState = {
      currentPhase: 0,
      phaseProgress: 0,
      isIdle: false,
      lastActivity: Date.now(),
      performanceMetrics: {
        avgLoadTime: 0,
        totalBatches: 0,
        failedBatches: 0
      }
    };
    
    // 空闲检测定时器
    this.idleTimer = null;
    
    // 错误处理和恢复状态
    this.errorState = {
      consecutiveFailures: 0,
      lastError: null,
      errorHistory: [],
      recoveryAttempts: 0,
      maxRecoveryAttempts: 3,
      backoffMultiplier: 2,
      circuitBreakerOpen: false,
      circuitBreakerTimeout: null
    };
    
    // 降级策略配置
    this.fallbackConfig = {
      minimalMode: {
        phases: [
          { name: 'essential', size: 5, priority: 'high' }
        ],
        timeout: 5000,
        maxRetries: 1
      },
      offlineMode: {
        useCache: true,
        showOfflineMessage: true
      }
    };
    
    console.log('PreloadService 初始化完成');
  }

  /**
   * 开始预加载
   * @param {Object} options - 预加载选项
   * @returns {Promise<boolean>} 预加载是否成功
   */
  async startPreload(options = {}) {
    try {
      // 合并配置
      const config = { ...this.config, ...options };
      
      // 检查是否已在预加载中
      if (this.status.status === 'loading') {
        console.warn('预加载已在进行中');
        return false;
      }

      // 重置状态
      this._resetStatus();
      this._resetProgressiveState();
      this.status.status = 'loading';
      this.status.startTime = Date.now();
      
      console.log('开始渐进式预加载剪贴板历史数据');
      this._emitEvent('preload_started', { config, mode: 'progressive' });

      // 启动空闲检测
      this._startIdleDetection();

      // 开始渐进式加载
      const success = await this._startProgressiveLoading(config);

      return success;
    } catch (error) {
      console.error('预加载启动失败:', error);
      this._handlePreloadError(error);
      return false;
    }
  }

  /**
   * 开始渐进式加载
   * @param {Object} config - 配置选项
   * @returns {Promise<boolean>} 是否成功
   */
  async _startProgressiveLoading(config) {
    try {
      // 第一阶段：关键数据快速加载
      const criticalSuccess = await this._loadPhase(0, config);
      
      if (!criticalSuccess) {
        console.error('关键数据加载失败');
        return false;
      }

      // 后续阶段：根据系统状态智能加载
      this._scheduleNextPhases(config);
      
      return true;
    } catch (error) {
      console.error('渐进式加载失败:', error);
      return false;
    }
  }

  /**
   * 加载指定阶段的数据
   * @param {number} phaseIndex - 阶段索引
   * @param {Object} config - 配置选项
   * @returns {Promise<boolean>} 是否成功
   */
  async _loadPhase(phaseIndex, config) {
    if (phaseIndex >= config.phases.length) {
      // 所有阶段完成
      this._completePreload();
      return true;
    }

    const phase = config.phases[phaseIndex];
    this.progressiveState.currentPhase = phaseIndex;
    
    console.log(`开始加载阶段 ${phaseIndex + 1}/${config.phases.length}: ${phase.name}`);
    
    try {
      const startTime = Date.now();
      
      // 计算当前阶段的偏移量
      const offset = this._calculatePhaseOffset(phaseIndex, config);
      
      // 根据性能模式调整批次大小
      const adjustedSize = this._adjustBatchSize(phase.size, config.performanceMode);
      
      const records = await this._fetchRecordsFromDatabase(
        adjustedSize, 
        offset, 
        config.timeout
      );

      if (records && records.length > 0) {
        const addedCount = this._addRecordsToCache(records);
        
        this.status.loadedRecords += addedCount;
        this.progressiveState.phaseProgress = 100;
        
        // 更新性能指标
        const loadTime = Date.now() - startTime;
        this._updatePerformanceMetrics(loadTime, true);
        
        // 更新总进度
        this._updateOverallProgress(phaseIndex + 1, config.phases.length);
        
        this._emitEvent('phase_completed', {
          phase: phase.name,
          phaseIndex,
          loadedRecords: addedCount,
          totalLoaded: this.status.loadedRecords,
          loadTime
        });
        
        console.log(`阶段 ${phase.name} 完成: ${addedCount} 条记录, 耗时: ${loadTime}ms`);
        
        return true;
      } else {
        console.log(`阶段 ${phase.name} 没有更多数据`);
        this._completePreload();
        return true;
      }
    } catch (error) {
      console.error(`阶段 ${phase.name} 加载失败:`, error);
      this._updatePerformanceMetrics(0, false);
      
      // 根据阶段优先级决定是否继续
      if (phase.priority === 'high') {
        throw error; // 高优先级阶段失败则整体失败
      } else {
        console.warn(`跳过失败的阶段: ${phase.name}`);
        return true; // 低优先级阶段失败可以跳过
      }
    }
  }

  /**
   * 调度后续阶段的加载
   * @param {Object} config - 配置选项
   */
  _scheduleNextPhases(config) {
    // 使用 requestIdleCallback 或 setTimeout 来调度后续加载
    const scheduleNext = (phaseIndex) => {
      if (phaseIndex >= config.phases.length || this.status.status !== 'loading') {
        return;
      }

      const phase = config.phases[phaseIndex];
      
      if (phase.priority === 'idle') {
        // 空闲时加载
        this._scheduleIdleLoad(phaseIndex, config);
      } else {
        // 延迟加载
        const delay = this._calculateLoadDelay(phase.priority);
        setTimeout(async () => {
          await this._loadPhase(phaseIndex, config);
          scheduleNext(phaseIndex + 1);
        }, delay);
      }
    };

    // 从第二阶段开始调度
    scheduleNext(1);
  }

  /**
   * 调度空闲时加载
   * @param {number} phaseIndex - 阶段索引
   * @param {Object} config - 配置选项
   */
  _scheduleIdleLoad(phaseIndex, config) {
    const loadWhenIdle = async () => {
      if (this.progressiveState.isIdle && this.status.status === 'loading') {
        await this._loadPhase(phaseIndex, config);
        
        // 继续下一个空闲阶段
        if (phaseIndex + 1 < config.phases.length) {
          setTimeout(() => this._scheduleIdleLoad(phaseIndex + 1, config), 1000);
        }
      } else {
        // 如果不空闲，稍后再检查
        setTimeout(loadWhenIdle, 2000);
      }
    };

    setTimeout(loadWhenIdle, 500);
  }

  /**
   * 启动空闲检测
   */
  _startIdleDetection() {
    this._stopIdleDetection(); // 清除之前的定时器
    
    const checkIdle = () => {
      const now = Date.now();
      const timeSinceActivity = now - this.progressiveState.lastActivity;
      
      this.progressiveState.isIdle = timeSinceActivity > this.config.idleThreshold;
      
      this.idleTimer = setTimeout(checkIdle, this.config.idleThreshold);
    };
    
    checkIdle();
  }

  /**
   * 停止空闲检测
   */
  _stopIdleDetection() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * 记录用户活动
   */
  recordUserActivity() {
    this.progressiveState.lastActivity = Date.now();
    this.progressiveState.isIdle = false;
  }

  /**
   * 获取预加载状态
   * @returns {Object} 当前预加载状态
   */
  getPreloadStatus() {
    return { ...this.status };
  }

  /**
   * 获取预加载进度
   * @returns {number} 进度百分比 (0-100)
   */
  getPreloadProgress() {
    return this.status.progress;
  }

  /**
   * 停止预加载
   */
  stopPreload() {
    if (this.status.status === 'loading') {
      this.status.status = 'idle';
      this.status.endTime = Date.now();
      
      this._stopIdleDetection();
      this._clearCircuitBreaker();
      
      console.log('预加载已停止');
      this._emitEvent('preload_stopped', { 
        loadedRecords: this.status.loadedRecords 
      });
    }
  }

  /**
   * 恢复预加载
   * 在错误后尝试恢复预加载过程
   */
  async recoverPreload() {
    try {
      if (this.errorState.recoveryAttempts >= this.errorState.maxRecoveryAttempts) {
        console.warn('已达到最大恢复尝试次数，启用降级模式');
        return await this._startFallbackMode();
      }

      this.errorState.recoveryAttempts++;
      
      console.log(`尝试恢复预加载 (第 ${this.errorState.recoveryAttempts} 次)`);
      
      // 重置错误状态
      this._resetErrorState();
      
      // 使用更保守的配置重新开始
      const recoveryConfig = this._createRecoveryConfig();
      
      this._emitEvent('recovery_started', {
        attempt: this.errorState.recoveryAttempts,
        config: recoveryConfig
      });
      
      return await this.startPreload(recoveryConfig);
    } catch (error) {
      console.error('预加载恢复失败:', error);
      this._handleRecoveryFailure(error);
      return false;
    }
  }

  /**
   * 启用降级模式
   * 当正常预加载失败时，使用最小化配置
   */
  async _startFallbackMode() {
    try {
      console.log('启动降级模式预加载');
      
      this._emitEvent('fallback_mode_started', {
        reason: 'recovery_failed',
        config: this.fallbackConfig.minimalMode
      });
      
      // 使用最小化配置
      const success = await this.startPreload(this.fallbackConfig.minimalMode);
      
      if (success) {
        this._emitEvent('fallback_mode_completed', {
          loadedRecords: this.status.loadedRecords
        });
      }
      
      return success;
    } catch (error) {
      console.error('降级模式也失败了:', error);
      return await this._startOfflineMode();
    }
  }

  /**
   * 启用离线模式
   * 当所有预加载尝试都失败时的最后手段
   */
  async _startOfflineMode() {
    console.log('启动离线模式');
    
    this.status.status = 'completed';
    this.status.progress = 100;
    this.status.endTime = Date.now();
    
    // 检查是否有缓存数据可用
    const cacheStats = this.cacheManager.getCacheStats();
    
    this._emitEvent('offline_mode_started', {
      reason: 'all_preload_failed',
      availableCache: cacheStats.tierStats.total > 0,
      cacheRecords: cacheStats.tierStats.total
    });
    
    if (cacheStats.tierStats.total > 0) {
      console.log(`离线模式：使用现有缓存 ${cacheStats.tierStats.total} 条记录`);
      return true;
    } else {
      console.log('离线模式：无可用缓存数据');
      return false;
    }
  }

  /**
   * 重新预加载
   * @param {Object} options - 预加载选项
   */
  async reloadCache(options = {}) {
    try {
      // 清空现有缓存
      this.cacheManager.clearCache();
      
      // 重新开始预加载
      return await this.startPreload(options);
    } catch (error) {
      console.error('重新预加载失败:', error);
      return false;
    }
  }

  /**
   * 检查是否需要预加载
   * @returns {boolean} 是否需要预加载
   */
  needsPreload() {
    const cacheStats = this.cacheManager.getCacheStats();
    
    // 如果缓存为空或记录数量很少，需要预加载
    return cacheStats.tierStats.total < 10;
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

  // ========== 私有方法 ==========

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
          console.error(`预加载事件监听器执行失败 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 重置预加载状态
   */
  _resetStatus() {
    this.status = {
      status: 'idle',
      progress: 0,
      loadedRecords: 0,
      totalRecords: null,
      errorMessage: null,
      startTime: null,
      endTime: null
    };
  }

  /**
   * 加载初始批次数据
   * @param {Object} config - 配置选项
   * @returns {Promise<boolean>} 是否成功
   */
  async _loadInitialBatch(config) {
    try {
      console.log(`加载初始批次: ${config.initialBatchSize} 条记录`);
      
      // 从数据库获取最近的记录
      const records = await this._fetchRecordsFromDatabase(
        config.initialBatchSize, 
        0, 
        config.timeout
      );

      if (records && records.length > 0) {
        // 添加到缓存
        const addedCount = this._addRecordsToCache(records);
        
        this.status.loadedRecords = addedCount;
        this.status.progress = Math.min(50, (addedCount / config.initialBatchSize) * 50);
        
        console.log(`初始批次加载完成: ${addedCount} 条记录`);
        
        this._emitEvent('initial_batch_loaded', {
          loadedRecords: addedCount,
          totalRequested: config.initialBatchSize
        });
        
        return true;
      } else {
        console.log('没有找到历史记录');
        this.status.status = 'completed';
        this.status.progress = 100;
        this.status.endTime = Date.now();
        
        this._emitEvent('preload_completed', {
          loadedRecords: 0,
          duration: this.status.endTime - this.status.startTime
        });
        
        return true;
      }
    } catch (error) {
      console.error('初始批次加载失败:', error);
      return false;
    }
  }

  /**
   * 后台加载额外批次数据
   * @param {Object} config - 配置选项
   */
  async _loadAdditionalBatches(config) {
    try {
      let offset = config.initialBatchSize;
      let hasMore = true;
      
      while (hasMore && 
             this.status.status === 'loading' && 
             this.status.loadedRecords < config.maxRecords) {
        
        // 延迟一下，避免阻塞主线程
        await this._delay(100);
        
        const remainingSlots = config.maxRecords - this.status.loadedRecords;
        const batchSize = Math.min(config.batchSize, remainingSlots);
        
        console.log(`加载额外批次: offset=${offset}, size=${batchSize}`);
        
        const records = await this._fetchRecordsFromDatabase(
          batchSize, 
          offset, 
          config.timeout
        );

        if (records && records.length > 0) {
          const addedCount = this._addRecordsToCache(records);
          
          this.status.loadedRecords += addedCount;
          offset += records.length;
          
          // 更新进度 (50-100%)
          const progressRatio = this.status.loadedRecords / config.maxRecords;
          this.status.progress = 50 + (progressRatio * 50);
          
          this._emitEvent('batch_loaded', {
            batchSize: addedCount,
            totalLoaded: this.status.loadedRecords,
            progress: this.status.progress
          });
          
          // 如果返回的记录数少于请求数，说明没有更多数据
          if (records.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      // 预加载完成
      this.status.status = 'completed';
      this.status.progress = 100;
      this.status.endTime = Date.now();
      
      const duration = this.status.endTime - this.status.startTime;
      
      console.log(`预加载完成: ${this.status.loadedRecords} 条记录, 耗时: ${duration}ms`);
      
      this._emitEvent('preload_completed', {
        loadedRecords: this.status.loadedRecords,
        duration
      });
      
    } catch (error) {
      console.error('额外批次加载失败:', error);
      this._handlePreloadError(error);
    }
  }

  /**
   * 从数据库获取记录
   * @param {number} limit - 限制数量
   * @param {number} offset - 偏移量
   * @param {number} timeout - 超时时间
   * @returns {Promise<Array>} 记录数组
   */
  async _fetchRecordsFromDatabase(limit, offset, timeout) {
    try {
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('数据库查询超时')), timeout);
      });
      
      // 创建查询Promise
      const queryPromise = invoke("get_clipboard_history", {
        limit,
        offset
      });
      
      // 竞争执行，哪个先完成就用哪个结果
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('数据库查询失败:', error);
      throw error;
    }
  }

  /**
   * 将记录添加到缓存
   * @param {Array} records - 记录数组
   * @returns {number} 实际添加的记录数
   */
  _addRecordsToCache(records) {
    let addedCount = 0;
    
    for (const record of records) {
      try {
        // 使用 appendRecords 方法批量添加
        if (this.cacheManager.appendRecords([record])) {
          addedCount++;
        }
      } catch (error) {
        console.error('添加记录到缓存失败:', error);
      }
    }
    
    return addedCount;
  }

  /**
   * 处理预加载错误
   * @param {Error} error - 错误对象
   */
  _handlePreloadError(error) {
    this.status.status = 'error';
    this.status.errorMessage = error.message;
    this.status.endTime = Date.now();
    
    // 记录错误历史
    this._recordError(error);
    
    // 检查是否需要开启熔断器
    this._checkCircuitBreaker();
    
    console.error('预加载失败:', error);
    
    this._emitEvent('preload_error', {
      error: error.message,
      loadedRecords: this.status.loadedRecords,
      errorType: this._classifyError(error),
      canRecover: this._canRecover(error)
    });
    
    // 自动尝试恢复（如果可能）
    if (this._shouldAutoRecover(error)) {
      setTimeout(() => {
        this.recoverPreload();
      }, this._calculateRecoveryDelay());
    }
  }

  /**
   * 记录错误信息
   * @param {Error} error - 错误对象
   */
  _recordError(error) {
    const errorRecord = {
      timestamp: Date.now(),
      message: error.message,
      type: this._classifyError(error),
      stack: error.stack,
      phase: this.progressiveState.currentPhase,
      loadedRecords: this.status.loadedRecords
    };
    
    this.errorState.errorHistory.push(errorRecord);
    this.errorState.lastError = errorRecord;
    this.errorState.consecutiveFailures++;
    
    // 限制错误历史长度
    if (this.errorState.errorHistory.length > 10) {
      this.errorState.errorHistory.shift();
    }
  }

  /**
   * 分类错误类型
   * @param {Error} error - 错误对象
   * @returns {string} 错误类型
   */
  _classifyError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('超时')) {
      return 'timeout';
    } else if (message.includes('network') || message.includes('连接')) {
      return 'network';
    } else if (message.includes('database') || message.includes('数据库')) {
      return 'database';
    } else if (message.includes('permission') || message.includes('权限')) {
      return 'permission';
    } else if (message.includes('memory') || message.includes('内存')) {
      return 'memory';
    } else {
      return 'unknown';
    }
  }

  /**
   * 检查是否可以恢复
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否可以恢复
   */
  _canRecover(error) {
    const errorType = this._classifyError(error);
    
    // 某些错误类型不适合自动恢复
    const nonRecoverableTypes = ['permission', 'memory'];
    
    return !nonRecoverableTypes.includes(errorType) && 
           this.errorState.consecutiveFailures < 5;
  }

  /**
   * 检查是否应该自动恢复
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该自动恢复
   */
  _shouldAutoRecover(error) {
    return this._canRecover(error) && 
           this.errorState.recoveryAttempts < this.errorState.maxRecoveryAttempts &&
           !this.errorState.circuitBreakerOpen;
  }

  /**
   * 计算恢复延迟时间
   * @returns {number} 延迟时间（毫秒）
   */
  _calculateRecoveryDelay() {
    const baseDelay = 1000;
    const backoffDelay = baseDelay * Math.pow(this.errorState.backoffMultiplier, this.errorState.recoveryAttempts);
    
    // 添加随机抖动以避免雷群效应
    const jitter = Math.random() * 1000;
    
    return Math.min(backoffDelay + jitter, 30000); // 最大30秒
  }

  /**
   * 检查熔断器状态
   */
  _checkCircuitBreaker() {
    const failureThreshold = 3;
    const timeWindow = 60000; // 1分钟
    
    if (this.errorState.consecutiveFailures >= failureThreshold) {
      this._openCircuitBreaker(timeWindow);
    }
  }

  /**
   * 开启熔断器
   * @param {number} timeout - 熔断时间（毫秒）
   */
  _openCircuitBreaker(timeout) {
    this.errorState.circuitBreakerOpen = true;
    
    console.warn(`熔断器开启，${timeout}ms 后自动恢复`);
    
    this._emitEvent('circuit_breaker_opened', {
      consecutiveFailures: this.errorState.consecutiveFailures,
      timeout
    });
    
    this.errorState.circuitBreakerTimeout = setTimeout(() => {
      this._closeCircuitBreaker();
    }, timeout);
  }

  /**
   * 关闭熔断器
   */
  _closeCircuitBreaker() {
    this.errorState.circuitBreakerOpen = false;
    this.errorState.consecutiveFailures = 0;
    
    if (this.errorState.circuitBreakerTimeout) {
      clearTimeout(this.errorState.circuitBreakerTimeout);
      this.errorState.circuitBreakerTimeout = null;
    }
    
    console.log('熔断器已关闭，可以重新尝试预加载');
    
    this._emitEvent('circuit_breaker_closed', {
      timestamp: Date.now()
    });
  }

  /**
   * 清除熔断器
   */
  _clearCircuitBreaker() {
    if (this.errorState.circuitBreakerTimeout) {
      clearTimeout(this.errorState.circuitBreakerTimeout);
      this.errorState.circuitBreakerTimeout = null;
    }
    this.errorState.circuitBreakerOpen = false;
  }

  /**
   * 重置错误状态
   */
  _resetErrorState() {
    this.errorState.consecutiveFailures = 0;
    this.errorState.lastError = null;
    this.errorState.circuitBreakerOpen = false;
    this._clearCircuitBreaker();
  }

  /**
   * 创建恢复配置
   * @returns {Object} 恢复配置
   */
  _createRecoveryConfig() {
    const baseConfig = { ...this.config };
    
    // 根据错误历史调整配置
    const recentErrors = this.errorState.errorHistory.slice(-3);
    const hasTimeoutErrors = recentErrors.some(e => e.type === 'timeout');
    const hasNetworkErrors = recentErrors.some(e => e.type === 'network');
    
    if (hasTimeoutErrors) {
      // 增加超时时间，减少批次大小
      baseConfig.timeout *= 2;
      baseConfig.phases = baseConfig.phases.map(phase => ({
        ...phase,
        size: Math.max(5, Math.floor(phase.size * 0.5))
      }));
    }
    
    if (hasNetworkErrors) {
      // 增加重试次数和延迟
      baseConfig.retryAttempts = Math.min(5, baseConfig.retryAttempts + 1);
      baseConfig.retryDelay *= 1.5;
    }
    
    return baseConfig;
  }

  /**
   * 处理恢复失败
   * @param {Error} error - 错误对象
   */
  _handleRecoveryFailure(error) {
    console.error(`恢复尝试 ${this.errorState.recoveryAttempts} 失败:`, error);
    
    this._emitEvent('recovery_failed', {
      attempt: this.errorState.recoveryAttempts,
      error: error.message,
      willRetry: this.errorState.recoveryAttempts < this.errorState.maxRecoveryAttempts
    });
    
    if (this.errorState.recoveryAttempts >= this.errorState.maxRecoveryAttempts) {
      console.warn('所有恢复尝试都失败了，将启用降级模式');
    }
  }

  /**
   * 获取错误统计信息
   * @returns {Object} 错误统计
   */
  getErrorStats() {
    const errorTypes = {};
    
    for (const error of this.errorState.errorHistory) {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
    }
    
    return {
      totalErrors: this.errorState.errorHistory.length,
      consecutiveFailures: this.errorState.consecutiveFailures,
      recoveryAttempts: this.errorState.recoveryAttempts,
      circuitBreakerOpen: this.errorState.circuitBreakerOpen,
      errorTypes,
      lastError: this.errorState.lastError,
      errorRate: this.errorState.errorHistory.length / Math.max(1, this.progressiveState.performanceMetrics.totalBatches)
    };
  }

  /**
   * 健康检查
   * @returns {Object} 健康状态
   */
  healthCheck() {
    const errorStats = this.getErrorStats();
    const cacheStats = this.cacheManager.getCacheStats();
    
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };
    
    // 检查错误率
    if (errorStats.errorRate > 0.3) {
      health.status = 'unhealthy';
      health.issues.push('错误率过高');
      health.recommendations.push('检查网络连接和数据库状态');
    }
    
    // 检查熔断器状态
    if (errorStats.circuitBreakerOpen) {
      health.status = 'degraded';
      health.issues.push('熔断器开启');
      health.recommendations.push('等待熔断器自动恢复或手动重置');
    }
    
    // 检查缓存状态
    if (cacheStats.tierStats.total === 0) {
      health.status = 'warning';
      health.issues.push('缓存为空');
      health.recommendations.push('尝试重新预加载数据');
    }
    
    return health;
  }

  /**
   * 延迟执行
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} Promise对象
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带重试的预加载
   * @param {Function} operation - 操作函数
   * @param {number} maxRetries - 最大重试次数
   * @param {number} delay - 重试延迟
   * @returns {Promise} 操作结果
   */
  async _withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        console.warn(`预加载操作失败 (尝试 ${attempt}/${maxRetries}):`, error.message);
        
        if (attempt < maxRetries) {
          await this._delay(delay * attempt); // 指数退避
        }
      }
    }
    
    throw lastError;
  }

  /**
   * 重置渐进式状态
   */
  _resetProgressiveState() {
    this.progressiveState = {
      currentPhase: 0,
      phaseProgress: 0,
      isIdle: false,
      lastActivity: Date.now(),
      performanceMetrics: {
        avgLoadTime: 0,
        totalBatches: 0,
        failedBatches: 0
      }
    };
  }

  /**
   * 计算阶段偏移量
   * @param {number} phaseIndex - 阶段索引
   * @param {Object} config - 配置选项
   * @returns {number} 偏移量
   */
  _calculatePhaseOffset(phaseIndex, config) {
    let offset = 0;
    
    for (let i = 0; i < phaseIndex; i++) {
      offset += config.phases[i].size;
    }
    
    return offset;
  }

  /**
   * 根据性能模式调整批次大小
   * @param {number} originalSize - 原始大小
   * @param {string} performanceMode - 性能模式
   * @returns {number} 调整后的大小
   */
  _adjustBatchSize(originalSize, performanceMode) {
    switch (performanceMode) {
      case 'fast':
        return Math.min(originalSize * 1.5, 50); // 增加批次大小以提高速度
      case 'memory':
        return Math.max(originalSize * 0.5, 5);  // 减少批次大小以节省内存
      case 'balanced':
      default:
        return originalSize;
    }
  }

  /**
   * 计算加载延迟
   * @param {string} priority - 优先级
   * @returns {number} 延迟时间（毫秒）
   */
  _calculateLoadDelay(priority) {
    switch (priority) {
      case 'high':
        return 0;      // 立即加载
      case 'medium':
        return 100;    // 短延迟
      case 'low':
        return 500;    // 中等延迟
      case 'idle':
        return 2000;   // 长延迟，等待空闲
      default:
        return 1000;
    }
  }

  /**
   * 更新性能指标
   * @param {number} loadTime - 加载时间
   * @param {boolean} success - 是否成功
   */
  _updatePerformanceMetrics(loadTime, success) {
    const metrics = this.progressiveState.performanceMetrics;
    
    metrics.totalBatches++;
    
    if (success) {
      // 更新平均加载时间
      metrics.avgLoadTime = (metrics.avgLoadTime * (metrics.totalBatches - 1) + loadTime) / metrics.totalBatches;
    } else {
      metrics.failedBatches++;
    }
  }

  /**
   * 更新总体进度
   * @param {number} completedPhases - 已完成阶段数
   * @param {number} totalPhases - 总阶段数
   */
  _updateOverallProgress(completedPhases, totalPhases) {
    this.status.progress = (completedPhases / totalPhases) * 100;
    
    this._emitEvent('progress_updated', {
      progress: this.status.progress,
      completedPhases,
      totalPhases,
      currentPhase: this.progressiveState.currentPhase
    });
  }

  /**
   * 完成预加载
   */
  _completePreload() {
    this.status.status = 'completed';
    this.status.progress = 100;
    this.status.endTime = Date.now();
    
    this._stopIdleDetection();
    
    const duration = this.status.endTime - this.status.startTime;
    const metrics = this.progressiveState.performanceMetrics;
    
    console.log(`渐进式预加载完成: ${this.status.loadedRecords} 条记录, 耗时: ${duration}ms`);
    console.log(`性能指标: 平均加载时间 ${metrics.avgLoadTime.toFixed(2)}ms, 失败率 ${(metrics.failedBatches / metrics.totalBatches * 100).toFixed(1)}%`);
    
    this._emitEvent('preload_completed', {
      loadedRecords: this.status.loadedRecords,
      duration,
      performanceMetrics: metrics
    });
  }

  /**
   * 获取智能预加载建议
   * @returns {Object} 预加载建议
   */
  getPreloadRecommendations() {
    const cacheStats = this.cacheManager.getCacheStats();
    const metrics = this.progressiveState.performanceMetrics;
    
    const recommendations = {
      suggestedMode: 'balanced',
      suggestedBatchSize: 30,
      estimatedTime: 5000,
      memoryImpact: 'medium',
      reasons: []
    };

    // 基于缓存状态的建议
    if (cacheStats.tierStats.total < 10) {
      recommendations.suggestedMode = 'fast';
      recommendations.reasons.push('缓存为空，建议快速模式');
    } else if (cacheStats.memoryUsage > CacheConstants.DEFAULT_MEMORY_THRESHOLD * 0.8) {
      recommendations.suggestedMode = 'memory';
      recommendations.reasons.push('内存使用较高，建议内存优化模式');
    }

    // 基于历史性能的建议
    if (metrics.avgLoadTime > 1000) {
      recommendations.suggestedBatchSize = Math.max(15, recommendations.suggestedBatchSize * 0.7);
      recommendations.reasons.push('历史加载较慢，建议减少批次大小');
    } else if (metrics.avgLoadTime < 200) {
      recommendations.suggestedBatchSize = Math.min(50, recommendations.suggestedBatchSize * 1.3);
      recommendations.reasons.push('历史加载较快，可以增加批次大小');
    }

    return recommendations;
  }

  /**
   * 自适应预加载
   * 根据系统状态和历史性能自动调整预加载策略
   */
  async startAdaptivePreload() {
    const recommendations = this.getPreloadRecommendations();
    
    console.log('开始自适应预加载:', recommendations);
    
    const adaptiveConfig = {
      ...this.config,
      performanceMode: recommendations.suggestedMode,
      phases: this.config.phases.map(phase => ({
        ...phase,
        size: Math.round(phase.size * (recommendations.suggestedBatchSize / 30))
      }))
    };

    return await this.startPreload(adaptiveConfig);
  }
}

export default PreloadService;