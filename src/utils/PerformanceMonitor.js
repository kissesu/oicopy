/**
 * 性能监控工具
 * 用于监控和优化面板显示性能
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      panelOpenTime: [],
      cacheAccessTime: [],
      renderTime: [],
      totalResponseTime: []
    };
    
    this.thresholds = {
      panelOpen: 50,      // 面板打开目标时间 50ms
      cacheAccess: 10,    // 缓存访问目标时间 10ms
      render: 30,         // 渲染目标时间 30ms
      totalResponse: 50   // 总响应时间目标 50ms
    };
    
    this.isMonitoring = false;
    this.currentSession = null;
  }

  /**
   * 开始监控会话
   * @param {string} sessionId - 会话ID
   */
  startSession(sessionId = null) {
    this.currentSession = {
      id: sessionId || `session_${Date.now()}`,
      startTime: performance.now(),
      phases: {},
      warnings: []
    };
    
    this.isMonitoring = true;
    console.log(`性能监控会话开始: ${this.currentSession.id}`);
  }

  /**
   * 记录阶段开始
   * @param {string} phase - 阶段名称
   */
  startPhase(phase) {
    if (!this.isMonitoring || !this.currentSession) {
      return;
    }
    
    this.currentSession.phases[phase] = {
      startTime: performance.now(),
      endTime: null,
      duration: null
    };
  }

  /**
   * 记录阶段结束
   * @param {string} phase - 阶段名称
   */
  endPhase(phase) {
    if (!this.isMonitoring || !this.currentSession || !this.currentSession.phases[phase]) {
      return;
    }
    
    const phaseData = this.currentSession.phases[phase];
    phaseData.endTime = performance.now();
    phaseData.duration = phaseData.endTime - phaseData.startTime;
    
    // 检查是否超过阈值
    const threshold = this.thresholds[phase];
    if (threshold && phaseData.duration > threshold) {
      const warning = `阶段 ${phase} 耗时 ${phaseData.duration.toFixed(2)}ms，超过阈值 ${threshold}ms`;
      this.currentSession.warnings.push(warning);
      console.warn(warning);
    }
    
    console.log(`阶段 ${phase} 完成: ${phaseData.duration.toFixed(2)}ms`);
  }

  /**
   * 结束监控会话
   * @returns {Object} 会话结果
   */
  endSession() {
    if (!this.isMonitoring || !this.currentSession) {
      return null;
    }
    
    const session = this.currentSession;
    session.endTime = performance.now();
    session.totalDuration = session.endTime - session.startTime;
    
    // 记录到历史指标
    this._recordMetrics(session);
    
    // 生成性能报告
    const report = this._generateReport(session);
    
    console.log(`性能监控会话结束: ${session.id}`, report);
    
    this.isMonitoring = false;
    this.currentSession = null;
    
    return report;
  }

  /**
   * 获取性能统计
   * @returns {Object} 性能统计信息
   */
  getStats() {
    const stats = {};
    
    for (const [metric, values] of Object.entries(this.metrics)) {
      if (values.length > 0) {
        stats[metric] = {
          count: values.length,
          average: values.reduce((sum, val) => sum + val, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          recent: values.slice(-10) // 最近10次
        };
      } else {
        stats[metric] = {
          count: 0,
          average: 0,
          min: 0,
          max: 0,
          recent: []
        };
      }
    }
    
    return stats;
  }

  /**
   * 获取性能建议
   * @returns {Array} 建议列表
   */
  getRecommendations() {
    const stats = this.getStats();
    const recommendations = [];
    
    // 检查面板打开时间
    if (stats.panelOpenTime.average > this.thresholds.panelOpen) {
      recommendations.push({
        type: 'performance',
        severity: 'high',
        message: `面板打开平均耗时 ${stats.panelOpenTime.average.toFixed(2)}ms，建议优化缓存预加载`,
        suggestion: '启用更积极的预加载策略或增加缓存大小'
      });
    }
    
    // 检查缓存访问时间
    if (stats.cacheAccessTime.average > this.thresholds.cacheAccess) {
      recommendations.push({
        type: 'cache',
        severity: 'medium',
        message: `缓存访问平均耗时 ${stats.cacheAccessTime.average.toFixed(2)}ms，可能需要优化数据结构`,
        suggestion: '考虑使用更高效的数据结构或减少缓存大小'
      });
    }
    
    // 检查渲染时间
    if (stats.renderTime.average > this.thresholds.render) {
      recommendations.push({
        type: 'render',
        severity: 'medium',
        message: `渲染平均耗时 ${stats.renderTime.average.toFixed(2)}ms，建议优化虚拟滚动`,
        suggestion: '减少初始渲染项目数量或优化组件渲染逻辑'
      });
    }
    
    return recommendations;
  }

  /**
   * 清除历史数据
   */
  clearHistory() {
    for (const metric in this.metrics) {
      this.metrics[metric] = [];
    }
    console.log('性能监控历史数据已清除');
  }

  // ========== 私有方法 ==========

  /**
   * 记录指标到历史
   * @param {Object} session - 会话数据
   */
  _recordMetrics(session) {
    // 记录总响应时间
    this.metrics.totalResponseTime.push(session.totalDuration);
    
    // 记录各阶段时间
    for (const [phase, data] of Object.entries(session.phases)) {
      if (data.duration !== null && this.metrics[phase]) {
        this.metrics[phase].push(data.duration);
      }
    }
    
    // 限制历史数据长度
    for (const metric in this.metrics) {
      if (this.metrics[metric].length > 100) {
        this.metrics[metric] = this.metrics[metric].slice(-50);
      }
    }
  }

  /**
   * 生成性能报告
   * @param {Object} session - 会话数据
   * @returns {Object} 性能报告
   */
  _generateReport(session) {
    const report = {
      sessionId: session.id,
      totalDuration: session.totalDuration,
      phases: session.phases,
      warnings: session.warnings,
      performance: {
        excellent: session.totalDuration <= this.thresholds.totalResponse,
        good: session.totalDuration <= this.thresholds.totalResponse * 1.5,
        acceptable: session.totalDuration <= this.thresholds.totalResponse * 2,
        poor: session.totalDuration > this.thresholds.totalResponse * 2
      }
    };
    
    // 计算性能等级
    if (report.performance.excellent) {
      report.grade = 'A';
    } else if (report.performance.good) {
      report.grade = 'B';
    } else if (report.performance.acceptable) {
      report.grade = 'C';
    } else {
      report.grade = 'D';
    }
    
    return report;
  }
}

/**
 * 快速性能测试工具
 */
export class QuickPerformanceTest {
  /**
   * 测试缓存访问性能
   * @param {Object} cacheManager - 缓存管理器
   * @param {number} iterations - 测试次数
   * @returns {Object} 测试结果
   */
  static async testCacheAccess(cacheManager, iterations = 100) {
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      cacheManager.getCachedHistory(20, 0);
      const end = performance.now();
      times.push(end - start);
    }
    
    return {
      iterations,
      average: times.reduce((sum, time) => sum + time, 0) / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
    };
  }

  /**
   * 测试组件渲染性能
   * @param {Function} renderFunction - 渲染函数
   * @param {Array} testData - 测试数据
   * @returns {Object} 测试结果
   */
  static async testRenderPerformance(renderFunction, testData) {
    const start = performance.now();
    
    try {
      await renderFunction(testData);
      const end = performance.now();
      
      return {
        success: true,
        duration: end - start,
        itemCount: testData.length,
        avgPerItem: (end - start) / testData.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: performance.now() - start
      };
    }
  }

  /**
   * 内存使用测试
   * @returns {Object} 内存使用信息
   */
  static getMemoryUsage() {
    if (performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit,
        usage: (performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize) * 100
      };
    }
    
    return {
      supported: false,
      message: 'Memory API not supported in this browser'
    };
  }
}

export default PerformanceMonitor;