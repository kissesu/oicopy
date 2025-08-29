import { invoke } from "@tauri-apps/api/core";
import { CacheEvents } from './CacheTypes.js';

/**
 * 同步队列管理器
 * 负责管理缓存与数据库之间的同步操作
 */
class SyncQueue {
  constructor(cacheManager) {
    this.cacheManager = cacheManager;
    
    // 同步队列
    this.queue = [];
    this.processing = false;
    this.paused = false;
    
    // 同步配置
    this.config = {
      batchSize: 10,           // 批处理大小
      maxRetries: 3,           // 最大重试次数
      retryDelay: 1000,        // 重试延迟（毫秒）
      processingInterval: 500, // 处理间隔（毫秒）
      maxQueueSize: 100,       // 最大队列长度
      timeout: 10000,          // 操作超时时间
      
      // 批量优化配置
      adaptiveBatching: true,  // 自适应批次大小
      minBatchSize: 3,         // 最小批次大小
      maxBatchSize: 20,        // 最大批次大小
      batchTimeout: 2000,      // 批次超时时间
      
      // 延迟同步配置
      delayedSync: true,       // 启用延迟同步
      idleThreshold: 1000,     // 空闲阈值（毫秒）
      maxDelayTime: 5000,      // 最大延迟时间
      
      // 智能调度配置
      priorityWeights: {       // 优先级权重
        high: 10,
        medium: 5,
        low: 1,
        idle: 0.5
      },
      
      // 性能优化配置
      performanceMode: 'balanced', // 性能模式: 'fast', 'balanced', 'memory'
      coalescingEnabled: true,     // 启用任务合并
      deduplicationEnabled: true   // 启用去重
    };
    
    // 统计信息
    this.stats = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageProcessTime: 0,
      lastSyncTime: null,
      queueLength: 0
    };
    
    // 事件监听器
    this.eventListeners = new Map();
    
    // 处理定时器
    this.processingTimer = null;
    
    // 任务ID计数器
    this.taskIdCounter = 0;
    
    // 批量优化状态
    this.batchState = {
      pendingBatch: [],
      batchTimer: null,
      lastActivity: Date.now(),
      isIdle: false,
      performanceMetrics: {
        avgBatchSize: 0,
        avgProcessTime: 0,
        throughput: 0,
        lastMeasurement: Date.now()
      }
    };
    
    // 任务合并映射
    this.coalescingMap = new Map();
    
    // 错误处理和重试状态
    this.errorState = {
      consecutiveFailures: 0,
      errorHistory: [],
      circuitBreakerOpen: false,
      circuitBreakerTimeout: null,
      retryStrategies: new Map(),
      deadLetterQueue: [],
      maxDeadLetterSize: 50
    };
    
    // 重试策略配置
    this.retryConfig = {
      strategies: {
        exponential: {
          baseDelay: 1000,
          maxDelay: 30000,
          multiplier: 2,
          jitter: true
        },
        linear: {
          baseDelay: 1000,
          increment: 1000,
          maxDelay: 10000
        },
        fixed: {
          delay: 2000
        }
      },
      defaultStrategy: 'exponential',
      maxRetries: 3,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    };
    
    console.log('SyncQueue 初始化完成');
    
    // 开始处理队列
    this._startProcessing();
    
    // 启动空闲检测
    this._startIdleDetection();
  }

  /**
   * 添加同步任务到队列
   * @param {string} type - 操作类型 ('add', 'update', 'delete', 'favorite', 'batch')
   * @param {Object} data - 操作数据
   * @param {number} priority - 优先级 (1-10, 数字越大优先级越高)
   * @param {Object} options - 额外选项
   * @returns {string} 任务ID
   */
  enqueueSync(type, data, priority = 5, options = {}) {
    try {
      // 记录用户活动
      this._recordActivity();
      
      // 检查队列是否已满
      if (this.queue.length >= this.config.maxQueueSize) {
        console.warn('同步队列已满，执行清理策略');
        this._cleanupQueue();
      }

      // 创建同步任务
      const task = {
        id: this._generateTaskId(),
        type,
        data,
        priority,
        createdAt: Date.now(),
        retryCount: 0,
        maxRetries: this.config.maxRetries,
        status: 'pending',
        error: null,
        coalescingKey: options.coalescingKey || null,
        canCoalesce: options.canCoalesce !== false,
        delayable: options.delayable !== false
      };

      // 尝试任务合并
      if (this.config.coalescingEnabled && task.canCoalesce) {
        const coalescedTask = this._tryCoalesceTask(task);
        if (coalescedTask) {
          console.log(`任务已合并: ${task.id} -> ${coalescedTask.id}`);
          return coalescedTask.id;
        }
      }

      // 去重检查
      if (this.config.deduplicationEnabled) {
        const duplicateTask = this._findDuplicateTask(task);
        if (duplicateTask) {
          console.log(`发现重复任务，跳过: ${task.id}`);
          return duplicateTask.id;
        }
      }

      // 根据优先级和延迟策略决定处理方式
      if (this._shouldDelayTask(task)) {
        this._addToPendingBatch(task);
      } else {
        this._insertTaskByPriority(task);
      }
      
      this.stats.totalTasks++;
      this.stats.queueLength = this.queue.length + this.batchState.pendingBatch.length;
      
      console.log(`同步任务已入队: ${task.id} (${type}), 优先级: ${priority}`);
      
      this._emitEvent('task_enqueued', {
        taskId: task.id,
        type,
        priority,
        queueLength: this.stats.queueLength,
        delayed: task.delayable && this._shouldDelayTask(task)
      });
      
      return task.id;
    } catch (error) {
      console.error('添加同步任务失败:', error);
      return null;
    }
  }

  /**
   * 批量添加同步任务
   * @param {Array} tasks - 任务数组
   * @returns {Array} 任务ID数组
   */
  enqueueBatchSync(tasks) {
    const taskIds = [];
    
    try {
      console.log(`批量添加 ${tasks.length} 个同步任务`);
      
      // 暂时禁用单个任务的处理，避免频繁触发
      const originalInterval = this.config.processingInterval;
      this.config.processingInterval = originalInterval * 2;
      
      for (const taskData of tasks) {
        const taskId = this.enqueueSync(
          taskData.type,
          taskData.data,
          taskData.priority || 5,
          { ...taskData.options, canCoalesce: true }
        );
        
        if (taskId) {
          taskIds.push(taskId);
        }
      }
      
      // 恢复原始处理间隔
      this.config.processingInterval = originalInterval;
      
      // 立即处理高优先级任务
      this._processHighPriorityTasks();
      
      this._emitEvent('batch_enqueued', {
        taskCount: tasks.length,
        successCount: taskIds.length,
        queueLength: this.stats.queueLength
      });
      
      return taskIds;
    } catch (error) {
      console.error('批量添加同步任务失败:', error);
      return taskIds;
    }
  }

  /**
   * 处理同步队列
   * @returns {Promise<void>}
   */
  async processSyncQueue() {
    if (this.processing || this.paused || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    
    try {
      console.log(`开始处理同步队列: ${this.queue.length} 个任务`);
      
      // 批量处理任务
      const batch = this._getBatch();
      
      if (batch.length > 0) {
        await this._processBatch(batch);
      }
      
    } catch (error) {
      console.error('处理同步队列失败:', error);
    } finally {
      this.processing = false;
      this.stats.queueLength = this.queue.length;
    }
  }

  /**
   * 强制同步
   * 立即处理所有待同步任务
   * @returns {Promise<boolean>} 是否成功
   */
  async forceSync() {
    try {
      console.log('开始强制同步');
      
      this._emitEvent('force_sync_started', {
        queueLength: this.queue.length
      });
      
      // 暂停正常处理
      const wasProcessing = this.processing;
      this.processing = true;
      
      let processedCount = 0;
      
      while (this.queue.length > 0) {
        const batch = this._getBatch();
        
        if (batch.length === 0) {
          break;
        }
        
        await this._processBatch(batch);
        processedCount += batch.length;
        
        // 避免阻塞太久
        if (processedCount % 20 === 0) {
          await this._delay(10);
        }
      }
      
      this.processing = wasProcessing;
      
      console.log(`强制同步完成: 处理了 ${processedCount} 个任务`);
      
      this._emitEvent('force_sync_completed', {
        processedTasks: processedCount
      });
      
      return true;
    } catch (error) {
      console.error('强制同步失败:', error);
      this.processing = false;
      
      this._emitEvent('force_sync_failed', {
        error: error.message
      });
      
      return false;
    }
  }

  /**
   * 暂停同步处理
   */
  pauseSync() {
    this.paused = true;
    console.log('同步处理已暂停');
    
    this._emitEvent('sync_paused', {
      queueLength: this.queue.length
    });
  }

  /**
   * 恢复同步处理
   */
  resumeSync() {
    this.paused = false;
    console.log('同步处理已恢复');
    
    this._emitEvent('sync_resumed', {
      queueLength: this.queue.length
    });
  }

  /**
   * 清空同步队列
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    this.stats.queueLength = 0;
    
    console.log(`同步队列已清空: ${clearedCount} 个任务`);
    
    this._emitEvent('queue_cleared', {
      clearedTasks: clearedCount
    });
  }

  /**
   * 获取同步统计信息
   * @returns {Object} 统计信息
   */
  getSyncStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalTasks > 0 ? 
        (this.stats.completedTasks / this.stats.totalTasks) : 0,
      failureRate: this.stats.totalTasks > 0 ? 
        (this.stats.failedTasks / this.stats.totalTasks) : 0,
      pendingTasks: this.queue.length,
      isProcessing: this.processing,
      isPaused: this.paused
    };
  }

  /**
   * 获取队列状态
   * @returns {Object} 队列状态
   */
  getQueueStatus() {
    const tasksByType = {};
    const tasksByPriority = {};
    
    for (const task of this.queue) {
      tasksByType[task.type] = (tasksByType[task.type] || 0) + 1;
      tasksByPriority[task.priority] = (tasksByPriority[task.priority] || 0) + 1;
    }
    
    return {
      length: this.queue.length,
      processing: this.processing,
      paused: this.paused,
      tasksByType,
      tasksByPriority,
      oldestTask: this.queue.length > 0 ? this.queue[0].createdAt : null,
      newestTask: this.queue.length > 0 ? this.queue[this.queue.length - 1].createdAt : null
    };
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
   * 设置性能模式
   * @param {string} mode - 性能模式 ('fast', 'balanced', 'memory')
   */
  setPerformanceMode(mode) {
    this.config.performanceMode = mode;
    
    // 根据模式调整配置
    switch (mode) {
      case 'fast':
        this.config.batchSize = Math.min(this.config.maxBatchSize, this.config.batchSize * 1.5);
        this.config.processingInterval = Math.max(100, this.config.processingInterval * 0.5);
        this.config.delayedSync = false;
        break;
        
      case 'memory':
        this.config.batchSize = Math.max(this.config.minBatchSize, this.config.batchSize * 0.7);
        this.config.processingInterval = this.config.processingInterval * 1.5;
        this.config.maxQueueSize = Math.max(50, this.config.maxQueueSize * 0.8);
        break;
        
      case 'balanced':
      default:
        // 使用默认配置
        break;
    }
    
    console.log(`性能模式已设置为: ${mode}`);
    
    this._emitEvent('performance_mode_changed', {
      mode,
      config: { ...this.config }
    });
  }

  /**
   * 获取性能建议
   * @returns {Object} 性能建议
   */
  getPerformanceRecommendations() {
    const stats = this.getSyncStats();
    const metrics = this.batchState.performanceMetrics;
    
    const recommendations = {
      suggestedMode: this.config.performanceMode,
      suggestedBatchSize: this.config.batchSize,
      issues: [],
      optimizations: []
    };

    // 分析成功率
    if (stats.successRate < 0.9) {
      recommendations.issues.push('同步成功率较低');
      recommendations.optimizations.push('减少批次大小，增加重试次数');
      recommendations.suggestedBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.config.batchSize * 0.7)
      );
    }

    // 分析处理时间
    if (metrics.avgProcessTime > 2000) {
      recommendations.issues.push('平均处理时间过长');
      recommendations.optimizations.push('启用更积极的批量合并');
    }

    // 分析队列长度
    if (stats.pendingTasks > this.config.maxQueueSize * 0.8) {
      recommendations.issues.push('队列积压严重');
      recommendations.suggestedMode = 'fast';
      recommendations.optimizations.push('切换到快速模式');
    }

    // 分析吞吐量
    if (metrics.throughput < 10) {
      recommendations.issues.push('吞吐量较低');
      recommendations.optimizations.push('增加批次大小或减少处理间隔');
    }

    return recommendations;
  }

  /**
   * 自动优化性能
   */
  autoOptimize() {
    const recommendations = this.getPerformanceRecommendations();
    
    console.log('开始自动性能优化:', recommendations);
    
    // 应用建议的性能模式
    if (recommendations.suggestedMode !== this.config.performanceMode) {
      this.setPerformanceMode(recommendations.suggestedMode);
    }
    
    // 应用建议的批次大小
    if (recommendations.suggestedBatchSize !== this.config.batchSize) {
      this.config.batchSize = recommendations.suggestedBatchSize;
    }
    
    this._emitEvent('auto_optimization_applied', {
      recommendations,
      newConfig: { ...this.config }
    });
  }

  /**
   * 重试失败的任务
   * @param {string} taskId - 任务ID
   * @param {string} strategy - 重试策略
   * @returns {boolean} 是否成功重新入队
   */
  retryTask(taskId, strategy = null) {
    try {
      // 在死信队列中查找任务
      const taskIndex = this.errorState.deadLetterQueue.findIndex(t => t.id === taskId);
      
      if (taskIndex === -1) {
        console.warn(`未找到要重试的任务: ${taskId}`);
        return false;
      }

      const task = this.errorState.deadLetterQueue[taskIndex];
      
      // 检查熔断器状态
      if (this.errorState.circuitBreakerOpen) {
        console.warn('熔断器开启，无法重试任务');
        return false;
      }

      // 重置任务状态
      task.retryCount = 0;
      task.status = 'pending';
      task.error = null;
      task.retryStrategy = strategy || this.retryConfig.defaultStrategy;
      
      // 从死信队列移除
      this.errorState.deadLetterQueue.splice(taskIndex, 1);
      
      // 重新入队
      this._insertTaskByPriority(task);
      
      console.log(`任务 ${taskId} 已重新入队，使用策略: ${task.retryStrategy}`);
      
      this._emitEvent('task_retried', {
        taskId,
        strategy: task.retryStrategy
      });
      
      return true;
    } catch (error) {
      console.error('重试任务失败:', error);
      return false;
    }
  }

  /**
   * 批量重试死信队列中的任务
   * @param {number} maxTasks - 最大重试任务数
   * @returns {number} 实际重试的任务数
   */
  retryDeadLetterTasks(maxTasks = 10) {
    const tasksToRetry = this.errorState.deadLetterQueue
      .slice(0, maxTasks)
      .filter(task => {
        // 只重试不是永久失败的任务
        return !this._isPermanentFailure(task.error);
      });

    let retriedCount = 0;
    
    for (const task of tasksToRetry) {
      if (this.retryTask(task.id)) {
        retriedCount++;
      }
    }
    
    console.log(`批量重试完成: ${retriedCount}/${tasksToRetry.length} 个任务`);
    
    this._emitEvent('batch_retry_completed', {
      requestedTasks: maxTasks,
      eligibleTasks: tasksToRetry.length,
      retriedTasks: retriedCount
    });
    
    return retriedCount;
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
      consecutiveFailures: this.errorState.consecutiveFailures,
      totalErrors: this.errorState.errorHistory.length,
      errorTypes,
      circuitBreakerOpen: this.errorState.circuitBreakerOpen,
      deadLetterQueueSize: this.errorState.deadLetterQueue.length,
      errorRate: this.stats.totalTasks > 0 ? 
        (this.stats.failedTasks / this.stats.totalTasks) : 0,
      recentErrors: this.errorState.errorHistory.slice(-5)
    };
  }

  /**
   * 清理死信队列
   * @param {number} maxAge - 最大年龄（毫秒）
   */
  cleanupDeadLetterQueue(maxAge = 24 * 60 * 60 * 1000) { // 默认24小时
    const now = Date.now();
    const originalSize = this.errorState.deadLetterQueue.length;
    
    this.errorState.deadLetterQueue = this.errorState.deadLetterQueue.filter(task => {
      const age = now - task.createdAt;
      return age < maxAge;
    });
    
    const cleanedCount = originalSize - this.errorState.deadLetterQueue.length;
    
    if (cleanedCount > 0) {
      console.log(`死信队列清理完成: 移除了 ${cleanedCount} 个过期任务`);
      
      this._emitEvent('dead_letter_queue_cleaned', {
        cleanedTasks: cleanedCount,
        remainingTasks: this.errorState.deadLetterQueue.length
      });
    }
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker() {
    this._closeCircuitBreaker();
    this.errorState.consecutiveFailures = 0;
    
    console.log('熔断器已手动重置');
    
    this._emitEvent('circuit_breaker_reset', {
      timestamp: Date.now()
    });
  }

  /**
   * 销毁同步队列
   */
  destroy() {
    this._stopProcessing();
    this._stopIdleDetection();
    this._clearBatchTimer();
    this._closeCircuitBreaker();
    this.clearQueue();
    this.coalescingMap.clear();
    this.errorState.deadLetterQueue = [];
    this.errorState.errorHistory = [];
    this.eventListeners.clear();
    
    console.log('SyncQueue 已销毁');
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
          console.error(`同步队列事件监听器执行失败 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 生成任务ID
   * @returns {string} 任务ID
   */
  _generateTaskId() {
    return `sync_${Date.now()}_${++this.taskIdCounter}`;
  }

  /**
   * 按优先级插入任务
   * @param {Object} task - 任务对象
   */
  _insertTaskByPriority(task) {
    let insertIndex = this.queue.length;
    
    // 找到合适的插入位置（优先级高的在前面）
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < task.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, task);
  }

  /**
   * 开始处理队列
   */
  _startProcessing() {
    if (this.processingTimer) {
      return;
    }
    
    this.processingTimer = setInterval(() => {
      this.processSyncQueue();
    }, this.config.processingInterval);
    
    console.log('同步队列处理已启动');
  }

  /**
   * 停止处理队列
   */
  _stopProcessing() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
      console.log('同步队列处理已停止');
    }
  }

  /**
   * 获取下一批要处理的任务
   * @returns {Array} 任务批次
   */
  _getBatch() {
    const adaptiveBatchSize = this._getAdaptiveBatchSize();
    const batchSize = Math.min(adaptiveBatchSize, this.queue.length);
    
    // 优先处理高优先级任务
    this.queue.sort((a, b) => {
      // 首先按优先级排序
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 相同优先级按创建时间排序
      return a.createdAt - b.createdAt;
    });
    
    return this.queue.splice(0, batchSize);
  }

  /**
   * 处理任务批次
   * @param {Array} batch - 任务批次
   */
  async _processBatch(batch) {
    const startTime = Date.now();
    
    console.log(`处理批次: ${batch.length} 个任务`);
    
    this._emitEvent('batch_processing_started', {
      batchSize: batch.length,
      tasks: batch.map(t => ({ id: t.id, type: t.type }))
    });
    
    const results = await Promise.allSettled(
      batch.map(task => this._processTask(task))
    );
    
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const task = batch[i];
      
      if (result.status === 'fulfilled' && result.value) {
        successCount++;
        this.stats.completedTasks++;
        
        this._emitEvent('task_completed', {
          taskId: task.id,
          type: task.type
        });
      } else {
        failureCount++;
        this.stats.failedTasks++;
        
        // 使用新的错误处理机制
        const error = result.reason || new Error('未知错误');
        this._handleTaskFailure(task, error);
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // 更新平均处理时间
    this._updateAverageProcessTime(processingTime);
    
    // 更新性能指标
    this._updatePerformanceMetrics(batch.length, processingTime);
    
    console.log(`批次处理完成: 成功 ${successCount}, 失败 ${failureCount}, 耗时 ${processingTime}ms`);
    
    this._emitEvent('batch_processing_completed', {
      batchSize: batch.length,
      successCount,
      failureCount,
      processingTime,
      adaptiveBatchSize: this._getAdaptiveBatchSize(),
      performanceMetrics: this.batchState.performanceMetrics
    });
  }

  /**
   * 处理单个任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processTask(task) {
    try {
      console.log(`处理任务: ${task.id} (${task.type})`);
      
      task.status = 'processing';
      
      switch (task.type) {
        case 'add':
          return await this._processAddTask(task);
        case 'update':
          return await this._processUpdateTask(task);
        case 'delete':
          return await this._processDeleteTask(task);
        case 'favorite':
          return await this._processFavoriteTask(task);
        case 'batch':
          return await this._processBatchTask(task);
        default:
          throw new Error(`未知的任务类型: ${task.type}`);
      }
    } catch (error) {
      console.error(`任务 ${task.id} 处理失败:`, error);
      task.status = 'failed';
      task.error = error.message;
      throw error;
    }
  }

  /**
   * 处理添加任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processAddTask(task) {
    // 这里应该调用 Rust 后端的 API 来保存数据
    // 由于这是缓存同步，通常数据已经在数据库中了
    // 这个任务主要是确保缓存和数据库的一致性
    
    console.log('处理添加任务:', task.data);
    
    // 模拟 API 调用
    await this._delay(50);
    
    task.status = 'completed';
    return true;
  }

  /**
   * 处理更新任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processUpdateTask(task) {
    console.log('处理更新任务:', task.data);
    
    // 模拟 API 调用
    await this._delay(30);
    
    task.status = 'completed';
    return true;
  }

  /**
   * 处理删除任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processDeleteTask(task) {
    console.log('处理删除任务:', task.data);
    
    // 模拟 API 调用
    await this._delay(20);
    
    task.status = 'completed';
    return true;
  }

  /**
   * 处理收藏任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processFavoriteTask(task) {
    console.log('处理收藏任务:', task.data);
    
    // 模拟 API 调用
    await this._delay(25);
    
    task.status = 'completed';
    return true;
  }

  /**
   * 处理批量任务
   * @param {Object} task - 任务对象
   * @returns {Promise<boolean>} 是否成功
   */
  async _processBatchTask(task) {
    console.log('处理批量任务:', task.data);
    
    // 模拟 API 调用
    await this._delay(100);
    
    task.status = 'completed';
    return true;
  }

  /**
   * 更新平均处理时间
   * @param {number} processingTime - 处理时间
   */
  _updateAverageProcessTime(processingTime) {
    const totalProcessed = this.stats.completedTasks + this.stats.failedTasks;
    
    if (totalProcessed === 1) {
      this.stats.averageProcessTime = processingTime;
    } else {
      this.stats.averageProcessTime = 
        (this.stats.averageProcessTime * (totalProcessed - 1) + processingTime) / totalProcessed;
    }
    
    this.stats.lastSyncTime = Date.now();
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
   * 记录用户活动
   */
  _recordActivity() {
    this.batchState.lastActivity = Date.now();
    this.batchState.isIdle = false;
  }

  /**
   * 启动空闲检测
   */
  _startIdleDetection() {
    setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - this.batchState.lastActivity;
      
      this.batchState.isIdle = timeSinceActivity > this.config.idleThreshold;
      
      // 空闲时处理待处理批次
      if (this.batchState.isIdle && this.batchState.pendingBatch.length > 0) {
        this._flushPendingBatch();
      }
    }, this.config.idleThreshold / 2);
  }

  /**
   * 停止空闲检测
   */
  _stopIdleDetection() {
    // 空闲检测使用 setInterval，在实际应用中应该保存引用以便清理
  }

  /**
   * 判断任务是否应该延迟
   * @param {Object} task - 任务对象
   * @returns {boolean} 是否应该延迟
   */
  _shouldDelayTask(task) {
    if (!this.config.delayedSync || !task.delayable) {
      return false;
    }
    
    // 高优先级任务不延迟
    if (task.priority >= 8) {
      return false;
    }
    
    // 系统空闲时不延迟
    if (this.batchState.isIdle) {
      return false;
    }
    
    return true;
  }

  /**
   * 添加任务到待处理批次
   * @param {Object} task - 任务对象
   */
  _addToPendingBatch(task) {
    this.batchState.pendingBatch.push(task);
    
    // 设置批次超时
    if (!this.batchState.batchTimer) {
      this.batchState.batchTimer = setTimeout(() => {
        this._flushPendingBatch();
      }, this.config.batchTimeout);
    }
    
    // 如果批次已满，立即处理
    if (this.batchState.pendingBatch.length >= this.config.maxBatchSize) {
      this._flushPendingBatch();
    }
  }

  /**
   * 刷新待处理批次
   */
  _flushPendingBatch() {
    if (this.batchState.pendingBatch.length === 0) {
      return;
    }
    
    console.log(`刷新待处理批次: ${this.batchState.pendingBatch.length} 个任务`);
    
    // 将待处理任务移到主队列
    for (const task of this.batchState.pendingBatch) {
      this._insertTaskByPriority(task);
    }
    
    this.batchState.pendingBatch = [];
    this._clearBatchTimer();
    
    this._emitEvent('pending_batch_flushed', {
      taskCount: this.batchState.pendingBatch.length
    });
  }

  /**
   * 清除批次定时器
   */
  _clearBatchTimer() {
    if (this.batchState.batchTimer) {
      clearTimeout(this.batchState.batchTimer);
      this.batchState.batchTimer = null;
    }
  }

  /**
   * 尝试合并任务
   * @param {Object} task - 新任务
   * @returns {Object|null} 合并后的任务或null
   */
  _tryCoalesceTask(task) {
    const coalescingKey = task.coalescingKey || `${task.type}_${JSON.stringify(task.data)}`;
    
    // 检查是否有可合并的任务
    if (this.coalescingMap.has(coalescingKey)) {
      const existingTask = this.coalescingMap.get(coalescingKey);
      
      // 更新现有任务的数据和优先级
      existingTask.data = { ...existingTask.data, ...task.data };
      existingTask.priority = Math.max(existingTask.priority, task.priority);
      existingTask.createdAt = Math.max(existingTask.createdAt, task.createdAt);
      
      return existingTask;
    }
    
    // 添加到合并映射
    this.coalescingMap.set(coalescingKey, task);
    
    // 设置清理定时器
    setTimeout(() => {
      this.coalescingMap.delete(coalescingKey);
    }, this.config.batchTimeout);
    
    return null;
  }

  /**
   * 查找重复任务
   * @param {Object} task - 任务对象
   * @returns {Object|null} 重复的任务或null
   */
  _findDuplicateTask(task) {
    const taskSignature = `${task.type}_${JSON.stringify(task.data)}`;
    
    // 在主队列中查找
    for (const existingTask of this.queue) {
      const existingSignature = `${existingTask.type}_${JSON.stringify(existingTask.data)}`;
      if (taskSignature === existingSignature) {
        return existingTask;
      }
    }
    
    // 在待处理批次中查找
    for (const existingTask of this.batchState.pendingBatch) {
      const existingSignature = `${existingTask.type}_${JSON.stringify(existingTask.data)}`;
      if (taskSignature === existingSignature) {
        return existingTask;
      }
    }
    
    return null;
  }

  /**
   * 清理队列
   */
  _cleanupQueue() {
    const originalLength = this.queue.length;
    
    // 移除低优先级的旧任务
    this.queue = this.queue.filter(task => {
      const age = Date.now() - task.createdAt;
      return task.priority >= 5 || age < this.config.maxDelayTime;
    });
    
    const removedCount = originalLength - this.queue.length;
    
    if (removedCount > 0) {
      console.log(`队列清理完成: 移除了 ${removedCount} 个任务`);
      
      this._emitEvent('queue_cleaned', {
        removedTasks: removedCount,
        remainingTasks: this.queue.length
      });
    }
  }

  /**
   * 处理高优先级任务
   */
  _processHighPriorityTasks() {
    const highPriorityTasks = this.queue.filter(task => task.priority >= 8);
    
    if (highPriorityTasks.length > 0) {
      console.log(`立即处理 ${highPriorityTasks.length} 个高优先级任务`);
      
      // 从队列中移除这些任务
      this.queue = this.queue.filter(task => task.priority < 8);
      
      // 立即处理
      this._processBatch(highPriorityTasks);
    }
  }

  /**
   * 获取自适应批次大小
   * @returns {number} 批次大小
   */
  _getAdaptiveBatchSize() {
    if (!this.config.adaptiveBatching) {
      return this.config.batchSize;
    }
    
    const metrics = this.batchState.performanceMetrics;
    let adaptedSize = this.config.batchSize;
    
    // 基于平均处理时间调整
    if (metrics.avgProcessTime > 1000) {
      adaptedSize = Math.max(this.config.minBatchSize, adaptedSize * 0.8);
    } else if (metrics.avgProcessTime < 200) {
      adaptedSize = Math.min(this.config.maxBatchSize, adaptedSize * 1.2);
    }
    
    // 基于成功率调整
    const successRate = this.stats.totalTasks > 0 ? 
      (this.stats.completedTasks / this.stats.totalTasks) : 1;
    
    if (successRate < 0.8) {
      adaptedSize = Math.max(this.config.minBatchSize, adaptedSize * 0.7);
    }
    
    return Math.round(adaptedSize);
  }

  /**
   * 更新性能指标
   * @param {number} batchSize - 批次大小
   * @param {number} processingTime - 处理时间
   */
  _updatePerformanceMetrics(batchSize, processingTime) {
    const metrics = this.batchState.performanceMetrics;
    const now = Date.now();
    
    // 更新平均批次大小
    if (metrics.avgBatchSize === 0) {
      metrics.avgBatchSize = batchSize;
    } else {
      metrics.avgBatchSize = (metrics.avgBatchSize * 0.9) + (batchSize * 0.1);
    }
    
    // 更新平均处理时间
    if (metrics.avgProcessTime === 0) {
      metrics.avgProcessTime = processingTime;
    } else {
      metrics.avgProcessTime = (metrics.avgProcessTime * 0.9) + (processingTime * 0.1);
    }
    
    // 计算吞吐量 (任务/秒)
    const timeDiff = now - metrics.lastMeasurement;
    if (timeDiff > 0) {
      const currentThroughput = (batchSize / timeDiff) * 1000;
      metrics.throughput = (metrics.throughput * 0.8) + (currentThroughput * 0.2);
    }
    
    metrics.lastMeasurement = now;
  }

  /**
   * 处理任务失败
   * @param {Object} task - 失败的任务
   * @param {Error} error - 错误对象
   */
  _handleTaskFailure(task, error) {
    // 记录错误
    this._recordError(task, error);
    
    // 检查是否应该重试
    if (this._shouldRetryTask(task, error)) {
      this._scheduleRetry(task, error);
    } else {
      this._moveToDeadLetterQueue(task, error);
    }
    
    // 检查熔断器
    this._checkCircuitBreaker();
  }

  /**
   * 记录错误信息
   * @param {Object} task - 任务对象
   * @param {Error} error - 错误对象
   */
  _recordError(task, error) {
    const errorRecord = {
      timestamp: Date.now(),
      taskId: task.id,
      taskType: task.type,
      error: error.message,
      errorType: this._classifyError(error),
      retryCount: task.retryCount,
      stack: error.stack
    };
    
    this.errorState.errorHistory.push(errorRecord);
    this.errorState.consecutiveFailures++;
    
    // 限制错误历史长度
    if (this.errorState.errorHistory.length > 100) {
      this.errorState.errorHistory.shift();
    }
    
    this._emitEvent('error_recorded', errorRecord);
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
    } else if (message.includes('validation') || message.includes('验证')) {
      return 'validation';
    } else if (message.includes('conflict') || message.includes('冲突')) {
      return 'conflict';
    } else {
      return 'unknown';
    }
  }

  /**
   * 判断是否应该重试任务
   * @param {Object} task - 任务对象
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  _shouldRetryTask(task, error) {
    // 检查重试次数
    if (task.retryCount >= task.maxRetries) {
      return false;
    }
    
    // 检查熔断器状态
    if (this.errorState.circuitBreakerOpen) {
      return false;
    }
    
    // 检查错误类型
    const errorType = this._classifyError(error);
    const nonRetryableTypes = ['permission', 'validation'];
    
    if (nonRetryableTypes.includes(errorType)) {
      return false;
    }
    
    return true;
  }

  /**
   * 调度重试
   * @param {Object} task - 任务对象
   * @param {Error} error - 错误对象
   */
  _scheduleRetry(task, error) {
    const strategy = task.retryStrategy || this.retryConfig.defaultStrategy;
    const delay = this._calculateRetryDelay(task, strategy);
    
    task.retryCount++;
    task.status = 'retrying';
    task.error = error.message;
    
    console.log(`调度重试任务 ${task.id}: 策略=${strategy}, 延迟=${delay}ms, 尝试=${task.retryCount}/${task.maxRetries}`);
    
    setTimeout(() => {
      if (task.status === 'retrying') {
        task.status = 'pending';
        this._insertTaskByPriority(task);
        
        this._emitEvent('task_retry_scheduled', {
          taskId: task.id,
          retryCount: task.retryCount,
          delay,
          strategy
        });
      }
    }, delay);
  }

  /**
   * 计算重试延迟
   * @param {Object} task - 任务对象
   * @param {string} strategy - 重试策略
   * @returns {number} 延迟时间（毫秒）
   */
  _calculateRetryDelay(task, strategy) {
    const config = this.retryConfig.strategies[strategy];
    
    if (!config) {
      return this.retryConfig.strategies.fixed.delay;
    }
    
    let delay;
    
    switch (strategy) {
      case 'exponential':
        delay = Math.min(
          config.baseDelay * Math.pow(config.multiplier, task.retryCount),
          config.maxDelay
        );
        
        // 添加抖动
        if (config.jitter) {
          delay += Math.random() * delay * 0.1;
        }
        break;
        
      case 'linear':
        delay = Math.min(
          config.baseDelay + (config.increment * task.retryCount),
          config.maxDelay
        );
        break;
        
      case 'fixed':
      default:
        delay = config.delay;
        break;
    }
    
    return Math.round(delay);
  }

  /**
   * 移动任务到死信队列
   * @param {Object} task - 任务对象
   * @param {Error} error - 错误对象
   */
  _moveToDeadLetterQueue(task, error) {
    task.status = 'dead_letter';
    task.finalError = error.message;
    task.deadLetterTimestamp = Date.now();
    
    // 检查死信队列大小
    if (this.errorState.deadLetterQueue.length >= this.errorState.maxDeadLetterSize) {
      // 移除最旧的任务
      const removed = this.errorState.deadLetterQueue.shift();
      console.log(`死信队列已满，移除最旧任务: ${removed.id}`);
    }
    
    this.errorState.deadLetterQueue.push(task);
    
    console.log(`任务 ${task.id} 已移入死信队列: ${error.message}`);
    
    this._emitEvent('task_moved_to_dead_letter', {
      taskId: task.id,
      taskType: task.type,
      error: error.message,
      retryCount: task.retryCount,
      deadLetterQueueSize: this.errorState.deadLetterQueue.length
    });
  }

  /**
   * 检查熔断器状态
   */
  _checkCircuitBreaker() {
    if (this.errorState.consecutiveFailures >= this.retryConfig.circuitBreakerThreshold) {
      this._openCircuitBreaker();
    }
  }

  /**
   * 开启熔断器
   */
  _openCircuitBreaker() {
    if (this.errorState.circuitBreakerOpen) {
      return;
    }
    
    this.errorState.circuitBreakerOpen = true;
    
    console.warn(`熔断器开启: 连续失败 ${this.errorState.consecutiveFailures} 次`);
    
    this._emitEvent('circuit_breaker_opened', {
      consecutiveFailures: this.errorState.consecutiveFailures,
      threshold: this.retryConfig.circuitBreakerThreshold
    });
    
    // 设置自动恢复定时器
    this.errorState.circuitBreakerTimeout = setTimeout(() => {
      this._closeCircuitBreaker();
    }, this.retryConfig.circuitBreakerTimeout);
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
    
    console.log('熔断器已关闭');
    
    this._emitEvent('circuit_breaker_closed', {
      timestamp: Date.now()
    });
  }

  /**
   * 判断是否为永久失败
   * @param {string} errorMessage - 错误信息
   * @returns {boolean} 是否为永久失败
   */
  _isPermanentFailure(errorMessage) {
    const permanentErrorPatterns = [
      /permission denied/i,
      /access denied/i,
      /unauthorized/i,
      /forbidden/i,
      /invalid.*format/i,
      /malformed.*data/i
    ];
    
    return permanentErrorPatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * 健康检查
   * @returns {Object} 健康状态
   */
  healthCheck() {
    const errorStats = this.getErrorStats();
    const queueStatus = this.getQueueStatus();
    
    const health = {
      status: 'healthy',
      issues: [],
      recommendations: []
    };
    
    // 检查错误率
    if (errorStats.errorRate > 0.2) {
      health.status = 'unhealthy';
      health.issues.push(`错误率过高: ${(errorStats.errorRate * 100).toFixed(1)}%`);
      health.recommendations.push('检查网络连接和后端服务状态');
    }
    
    // 检查熔断器状态
    if (errorStats.circuitBreakerOpen) {
      health.status = 'degraded';
      health.issues.push('熔断器开启');
      health.recommendations.push('等待熔断器自动恢复或手动重置');
    }
    
    // 检查死信队列大小
    if (errorStats.deadLetterQueueSize > 20) {
      health.status = 'warning';
      health.issues.push(`死信队列积压: ${errorStats.deadLetterQueueSize} 个任务`);
      health.recommendations.push('检查并重试死信队列中的任务');
    }
    
    // 检查队列积压
    if (queueStatus.length > this.config.maxQueueSize * 0.8) {
      health.status = 'warning';
      health.issues.push(`队列积压严重: ${queueStatus.length} 个任务`);
      health.recommendations.push('考虑增加处理能力或优化批次大小');
    }
    
    return health;
  }
}

export default SyncQueue;