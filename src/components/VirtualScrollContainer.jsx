import React, { useRef, useCallback, useMemo, useEffect, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { VIRTUAL_SCROLL_CONFIG, createVirtualizerConfig, SCROLL_CONFIG } from '../utils/virtualScrollConfig';

/**
 * VirtualScrollContainer - A high-performance virtual scrolling container
 * for clipboard cards using @tanstack/react-virtual
 * 
 * Features:
 * - Horizontal virtual scrolling
 * - Dynamic content size support
 * - Keyboard navigation integration
 * - Memory efficient rendering
 * - Smooth scrolling animations
 */
const VirtualScrollContainer = React.forwardRef(({
  items = [],
  renderItem,
  selectedIndex = -1,
  onScroll,
  onLoadMore,
  hasMore = false,
  loading = false,
  className = '',
  estimateSize,
  onKeyboardNavigation,
  maintainScrollPosition = true, // 新增：是否维护滚动位置
  ...props
}, ref) => {
  const parentRef = useRef(null);
  const previousItemsLength = useRef(items.length);
  const scrollPositionRef = useRef(0);
  const isLoadingMore = useRef(false);

  // Create virtualizer configuration
  const virtualizerConfig = useMemo(() => {
    return createVirtualizerConfig(
      items,
      parentRef,
      estimateSize || ((index) => {
        // Use custom estimateSize if provided, otherwise use default
        return VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH;
      })
    );
  }, [items, estimateSize]);

  // Initialize virtualizer
  const virtualizer = useVirtualizer(virtualizerConfig);

  // Get virtual items for rendering
  const virtualItems = virtualizer.getVirtualItems();

  // Scroll to specific index (used for keyboard navigation)
  const scrollToIndex = useCallback((index, config = SCROLL_CONFIG) => {
    if (index >= 0 && index < items.length) {
      // 使用 requestAnimationFrame 确保平滑滚动
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(index, config);
      });
    }
  }, [virtualizer, items.length]);

  // 高性能键盘导航处理
  const handleKeyboardNavigation = useCallback((direction, currentIndex) => {
    let newIndex = currentIndex;
    
    if (direction === 'left' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'right' && currentIndex < items.length - 1) {
      newIndex = currentIndex + 1;
    } else if (direction === 'home') {
      newIndex = 0;
    } else if (direction === 'end') {
      newIndex = items.length - 1;
    }
    
    // 边界情况处理
    if (newIndex !== currentIndex) {
      // 立即滚动到新位置，提供即时反馈
      scrollToIndex(newIndex, {
        align: 'center',
        behavior: 'smooth'
      });
      return newIndex;
    }
    
    return currentIndex;
  }, [items.length, scrollToIndex]);

  // Enhanced infinite scroll handling with better threshold detection
  const handleScroll = useCallback((event) => {
    const { scrollLeft, scrollWidth, clientWidth } = event.currentTarget;
    const scrollPercentage = (scrollLeft + clientWidth) / scrollWidth;
    
    // 更新滚动位置引用
    scrollPositionRef.current = scrollLeft;
    
    // 更精确的滚动位置检测
    const remainingDistance = scrollWidth - (scrollLeft + clientWidth);
    const shouldLoadMore = scrollPercentage > VIRTUAL_SCROLL_CONFIG.SCROLL_THRESHOLD || 
                          remainingDistance < VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH * 2;

    // Trigger load more when reaching threshold or near end
    if (shouldLoadMore && hasMore && !loading && !isLoadingMore.current) {
      console.log('虚拟滚动触发无限加载:', { 
        scrollPercentage, 
        remainingDistance,
        scrollLeft,
        scrollWidth,
        clientWidth
      });
      isLoadingMore.current = true;
      onLoadMore?.();
    }

    // Call external scroll handler
    onScroll?.(event);
  }, [hasMore, loading, onLoadMore, onScroll]);

  // 维护滚动位置，处理新项目插入
  useEffect(() => {
    const currentItemsLength = items.length;
    const previousLength = previousItemsLength.current;
    
    // 检测是否有新项目添加到开头（剪贴板更新）
    if (currentItemsLength > previousLength && maintainScrollPosition) {
      const newItemsCount = currentItemsLength - previousLength;
      const scrollElement = parentRef.current;
      
      if (scrollElement && !isLoadingMore.current) {
        // 新项目添加到开头时，调整滚动位置以维护视觉连续性
        const additionalWidth = newItemsCount * VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH;
        const newScrollLeft = scrollPositionRef.current + additionalWidth;
        
        console.log('检测到新项目插入，调整滚动位置:', {
          newItemsCount,
          additionalWidth,
          oldScrollLeft: scrollPositionRef.current,
          newScrollLeft
        });
        
        // 使用 requestAnimationFrame 确保 DOM 更新后再调整滚动
        requestAnimationFrame(() => {
          if (scrollElement) {
            scrollElement.scrollLeft = newScrollLeft;
            scrollPositionRef.current = newScrollLeft;
          }
        });
      }
    }
    
    // 重置加载更多标志
    if (currentItemsLength > previousLength && isLoadingMore.current) {
      isLoadingMore.current = false;
    }
    
    previousItemsLength.current = currentItemsLength;
  }, [items.length, maintainScrollPosition]);

  // Auto-scroll to selected item when selectedIndex changes
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      scrollToIndex(selectedIndex);
    }
  }, [selectedIndex, scrollToIndex, items.length]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    scrollToIndex: (index, config) => scrollToIndex(index, config),
    handleKeyboardNavigation: (direction, currentIndex) => 
      handleKeyboardNavigation(direction, currentIndex),
    getVirtualizer: () => virtualizer,
    getTotalSize: () => virtualizer.getTotalSize(),
    getVirtualItems: () => virtualizer.getVirtualItems(),
  }), [scrollToIndex, handleKeyboardNavigation, virtualizer]);

  // Memoized container styles for performance
  const containerStyle = useMemo(() => ({
    height: '100%', // 使用 100% 高度而不是固定高度
    width: '100%',
    overflow: 'auto',
    scrollBehavior: VIRTUAL_SCROLL_CONFIG.SCROLL_BEHAVIOR,
    willChange: 'scroll-position',
  }), []);

  // Memoized virtual container styles
  const virtualContainerStyle = useMemo(() => ({
    height: `${VIRTUAL_SCROLL_CONFIG.CARD_HEIGHT}px`, // 使用固定高度确保卡片正确显示
    width: `${virtualizer.getTotalSize()}px`,
    position: 'relative',
  }), [virtualizer]);

  // Render loading indicator for infinite scroll
  const renderLoadingIndicator = useCallback(() => {
    if (!loading || !hasMore) return null;

    return (
      <div 
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: `${VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH * 2}px`, // 更宽的加载区域
          height: `${VIRTUAL_SCROLL_CONFIG.CARD_HEIGHT}px`,
          position: 'absolute',
          left: `${virtualizer.getTotalSize()}px`,
          top: 0,
        }}
      >
        <div className="flex flex-col items-center space-y-2 bg-white/80 backdrop-blur-sm rounded-lg p-4 shadow-lg">
          <div className="w-6 h-6 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
          <span className="text-xs text-gray-600 font-medium">加载更多...</span>
        </div>
      </div>
    );
  }, [loading, hasMore, virtualizer]);

  // Handle empty state
  if (items.length === 0 && !loading) {
    return (
      <div className={`h-full flex items-center justify-center ${className}`} {...props}>
        <div className="text-center p-8">
          <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-200 to-gray-300 rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-600 mb-3">暂无剪贴板历史</h3>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto">
            复制一些内容到剪贴板，
            <br />这里就会显示历史记录了
          </p>
          <div className="mt-6 flex items-center justify-center space-x-2 text-xs text-gray-400">
            <kbd className="px-2 py-1 bg-gray-100 rounded border text-gray-600">⌘</kbd>
            <span>+</span>
            <kbd className="px-2 py-1 bg-gray-100 rounded border text-gray-600">⇧</kbd>
            <span>+</span>
            <kbd className="px-2 py-1 bg-gray-100 rounded border text-gray-600">V</kbd>
            <span className="ml-2">打开面板</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={parentRef}
      className={`no-scrollbar ${className}`}
      style={containerStyle}
      onScroll={handleScroll}
      {...props}
    >
      <div style={virtualContainerStyle}>
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${virtualItem.size}px`,
                height: `${VIRTUAL_SCROLL_CONFIG.CARD_HEIGHT}px`, // 确保高度正确
                transform: `translateX(${virtualItem.start}px)`,
                display: 'flex',
                alignItems: 'center', // 垂直居中对齐
                pointerEvents: 'auto', // 确保鼠标事件可以传递
                zIndex: 0, // 确保不会覆盖子元素
              }}
              onClick={(e) => {
                console.log('Virtual item container clicked for item:', item.id);
                // 不阻止事件传播，让子组件处理
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
        
        {/* Loading indicator */}
        {renderLoadingIndicator()}
      </div>
    </div>
  );
});

// Export additional utilities for external use
VirtualScrollContainer.scrollToIndex = (virtualizer, index, config = SCROLL_CONFIG) => {
  if (virtualizer && index >= 0) {
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, config);
    });
  }
};

// 导出键盘导航辅助函数
VirtualScrollContainer.handleKeyboardNavigation = (direction, currentIndex, itemsLength) => {
  let newIndex = currentIndex;
  
  switch (direction) {
    case 'left':
      newIndex = Math.max(0, currentIndex - 1);
      break;
    case 'right':
      newIndex = Math.min(itemsLength - 1, currentIndex + 1);
      break;
    case 'home':
      newIndex = 0;
      break;
    case 'end':
      newIndex = itemsLength - 1;
      break;
    default:
      return currentIndex;
  }
  
  return newIndex;
};

VirtualScrollContainer.displayName = 'VirtualScrollContainer';

export default VirtualScrollContainer;