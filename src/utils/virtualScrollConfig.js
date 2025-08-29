// Virtual scrolling configuration for clipboard panel
// This file contains the basic configuration settings for @tanstack/react-virtual

/**
 * Default configuration for virtual scrolling in the clipboard panel
 */
export const VIRTUAL_SCROLL_CONFIG = {
  // Card dimensions (matching current PanelPage layout)
  CARD_WIDTH: 240,
  CARD_GAP: 16,
  TOTAL_ITEM_WIDTH: 256, // CARD_WIDTH + CARD_GAP
  CARD_HEIGHT: 240, // 更新为正方形卡片
  
  // Virtual scrolling settings
  OVERSCAN: 3, // 减少 overscan 以提高性能
  SCROLL_BEHAVIOR: 'smooth', // 改为 smooth 以提供更好的用户体验
  
  // Performance settings
  ITEMS_PER_PAGE: 20, // 减少初始加载数量以提高性能
  LOAD_MORE_ITEMS: 30, // 减少后续加载数量
  SCROLL_THRESHOLD: 0.8, // Load more when 80% scrolled
};

/**
 * Creates virtualizer configuration object for @tanstack/react-virtual
 * @param {Array} items - Array of items to virtualize
 * @param {React.RefObject} parentRef - Reference to scroll container
 * @param {Function} estimateSize - Function to estimate item size (optional)
 * @returns {Object} Virtualizer configuration
 */
export function createVirtualizerConfig(items, parentRef, estimateSize = null) {
  return {
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize || (() => VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH),
    horizontal: true,
    overscan: VIRTUAL_SCROLL_CONFIG.OVERSCAN,
    scrollMargin: parentRef.current?.offsetLeft ?? 0,
  };
}

/**
 * Calculates the estimated size for a clipboard card based on content type
 * @param {Object} card - Clipboard card object
 * @returns {number} Estimated width in pixels
 */
export function estimateCardSize(card) {
  // For now, all cards have the same width
  // This can be enhanced later for dynamic sizing based on content
  return VIRTUAL_SCROLL_CONFIG.TOTAL_ITEM_WIDTH;
}

/**
 * Scroll configuration for smooth navigation
 */
export const SCROLL_CONFIG = {
  align: 'center',
  behavior: 'smooth',
};

/**
 * 键盘导航专用的滚动配置
 */
export const KEYBOARD_SCROLL_CONFIG = {
  center: {
    align: 'center',
    behavior: 'smooth',
  },
  start: {
    align: 'start',
    behavior: 'smooth',
  },
  end: {
    align: 'end',
    behavior: 'smooth',
  },
  auto: {
    align: 'auto',
    behavior: 'smooth',
  },
};

/**
 * 性能优化的导航配置
 */
export const NAVIGATION_CONFIG = {
  // 导航防抖延迟（毫秒）
  DEBOUNCE_DELAY: 50,
  // 快速导航延迟（毫秒）
  FAST_NAVIGATION_DELAY: 16,
  // 边界导航延迟（毫秒）
  BOUNDARY_NAVIGATION_DELAY: 100,
};