import React, { useState, useEffect, useRef, useCallback } from 'react';

export const usePerformanceMonitor = () => {
  const [performanceMetrics, setPerformanceMetrics] = useState({
    renderTime: 0,
    memoryUsage: 0,
    apiResponseTimes: [],
    componentUpdates: 0,
    lastUpdate: null
  });

  const renderStartTime = useRef(null);
  const updateCount = useRef(0);
  const apiTimings = useRef([]);

  // 开始渲染计时
  const startRenderTiming = useCallback(() => {
    renderStartTime.current = performance.now();
  }, []);

  // 结束渲染计时
  const endRenderTiming = useCallback(() => {
    if (renderStartTime.current) {
      const renderTime = performance.now() - renderStartTime.current;
      updateCount.current += 1;
      
      setPerformanceMetrics(prev => ({
        ...prev,
        renderTime,
        componentUpdates: updateCount.current,
        lastUpdate: new Date().toISOString()
      }));
      
      renderStartTime.current = null;
    }
  }, []);

  // 记录API响应时间
  const recordApiTiming = useCallback((operationType, duration) => {
    const timing = {
      operation: operationType,
      duration,
      timestamp: Date.now()
    };
    
    apiTimings.current.push(timing);
    
    // 只保留最近50次API调用的记录
    if (apiTimings.current.length > 50) {
      apiTimings.current = apiTimings.current.slice(-50);
    }
    
    setPerformanceMetrics(prev => ({
      ...prev,
      apiResponseTimes: [...apiTimings.current]
    }));
  }, []);

  // 监控内存使用情况
  useEffect(() => {
    const monitorMemory = () => {
      if (performance.memory) {
        const memoryUsage = {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
        };
        
        setPerformanceMetrics(prev => ({
          ...prev,
          memoryUsage
        }));
      }
    };

    // 每5秒监控一次内存使用
    const interval = setInterval(monitorMemory, 5000);
    monitorMemory(); // 立即执行一次

    return () => clearInterval(interval);
  }, []);

  // 获取性能统计
  const getPerformanceStats = useCallback(() => {
    const recentApiCalls = apiTimings.current.slice(-10);
    const avgApiResponseTime = recentApiCalls.length > 0
      ? recentApiCalls.reduce((sum, timing) => sum + timing.duration, 0) / recentApiCalls.length
      : 0;

    return {
      ...performanceMetrics,
      avgApiResponseTime: Math.round(avgApiResponseTime),
      slowApiCalls: apiTimings.current.filter(timing => timing.duration > 3000).length,
      totalApiCalls: apiTimings.current.length
    };
  }, [performanceMetrics]);

  // 检查性能警告
  const getPerformanceWarnings = useCallback(() => {
    const warnings = [];
    const stats = getPerformanceStats();

    if (stats.renderTime > 100) {
      warnings.push({
        type: 'render',
        message: `组件渲染时间过长: ${stats.renderTime.toFixed(1)}ms`,
        severity: stats.renderTime > 200 ? 'high' : 'medium'
      });
    }

    if (stats.avgApiResponseTime > 2000) {
      warnings.push({
        type: 'api',
        message: `API响应时间过长: ${stats.avgApiResponseTime}ms`,
        severity: stats.avgApiResponseTime > 5000 ? 'high' : 'medium'
      });
    }

    if (stats.memoryUsage && stats.memoryUsage.used > 100) {
      warnings.push({
        type: 'memory',
        message: `内存使用较高: ${stats.memoryUsage.used}MB`,
        severity: stats.memoryUsage.used > 200 ? 'high' : 'medium'
      });
    }

    if (stats.slowApiCalls > 5) {
      warnings.push({
        type: 'api',
        message: `检测到${stats.slowApiCalls}次慢API调用`,
        severity: 'medium'
      });
    }

    return warnings;
  }, [getPerformanceStats]);

  // 重置性能指标
  const resetMetrics = useCallback(() => {
    updateCount.current = 0;
    apiTimings.current = [];
    setPerformanceMetrics({
      renderTime: 0,
      memoryUsage: 0,
      apiResponseTimes: [],
      componentUpdates: 0,
      lastUpdate: null
    });
  }, []);

  return {
    performanceMetrics,
    startRenderTiming,
    endRenderTiming,
    recordApiTiming,
    getPerformanceStats,
    getPerformanceWarnings,
    resetMetrics
  };
};

// 高阶组件：为组件添加性能监控
export const withPerformanceMonitoring = (WrappedComponent) => {
  return function PerformanceMonitoredComponent(props) {
    const { startRenderTiming, endRenderTiming } = usePerformanceMonitor();

    useEffect(() => {
      startRenderTiming();
      return () => {
        endRenderTiming();
      };
    });

    return React.createElement(WrappedComponent, props);
  };
};

// 性能优化的hooks
export const useOptimizedCallback = (callback, deps, delay = 0) => {
  const timeoutRef = useRef(null);
  
  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, deps);
};

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// 内存优化：大数据处理
export const useVirtualizedData = (data, itemsPerPage = 50) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleData, setVisibleData] = useState([]);

  useEffect(() => {
    if (!data || !Array.isArray(data)) {
      setVisibleData([]);
      return;
    }

    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setVisibleData(data.slice(startIndex, endIndex));
  }, [data, currentPage, itemsPerPage]);

  const totalPages = Math.ceil((data?.length || 0) / itemsPerPage);

  const goToPage = useCallback((page) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  return {
    visibleData,
    currentPage,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    hasNextPage: currentPage < totalPages - 1,
    hasPrevPage: currentPage > 0
  };
};