import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from "@tauri-apps/api/event";
// 或者导入所有函数
import * as Clipboard from 'tauri-plugin-clipboard-api';
// import parse from 'html-react-parser';
import ZoomableHTML from "./ZoomableHTML";
import dayjs from "dayjs";
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import TextIcon from "../assets/text_icon.svg";
import HtmlIcon from "../assets/html_icon.svg";
import ImageIcon from "../assets/image_icon.svg";
import RtfIcon from "../assets/rtf_icon.svg";
import FilesIcon from "../assets/files_icon.svg";
import FileIcon from "../assets/file_icon.svg";

import AppIcon from "./AppIcon";
import VirtualScrollContainer from "./VirtualScrollContainer";
import VirtualClipboardCard from "./VirtualClipboardCard";

// 导入新的缓存系统
import ClipboardCacheManager from "../utils/ClipboardCacheManager.js";
import PreloadService from "../utils/PreloadService.js";
import SyncQueue from "../utils/SyncQueue.js";
import { CacheEvents } from "../utils/CacheTypes.js";
import PerformanceMonitor, { QuickPerformanceTest } from "../utils/PerformanceMonitor.js";

dayjs.extend(relativeTime)
dayjs.locale('zh-cn'); // 设置全局语言为中文

export default function PanelPage() {

  const [selectedId, setSelectedId] = useState(null);
  const [cards, setCards] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [offset, setOffset] = useState(0);
  const ITEMS_PER_PAGE = 20; // 减少初始加载数量以提高性能

  // 缓存系统实例
  const [cacheManager] = useState(() => new ClipboardCacheManager(100, 50, 30));
  const [preloadService] = useState(() => new PreloadService(cacheManager));
  const [syncQueue] = useState(() => new SyncQueue(cacheManager));

  const cardType = {
    "text": {
      "icon": TextIcon,
      "name": "文本"
    },
    "image": {
      "icon": ImageIcon,
      "name": "图像"
    },
    "html": {
      "icon": HtmlIcon,
      "name": "HTML"
    },
    "files": {
      "icon": FilesIcon,
      "name": "文件"
    },
    "rtf": {
      "icon": RtfIcon,
      "name": "RTF"
    }
  }

  // 虚拟滚动容器引用
  const virtualScrollRef = useRef(null);

  // 用于跟踪是否应该忽略下一次剪切板更新
  const ignoreNextClipboardUpdate = useRef(false);

  // 初始化缓存系统
  useEffect(() => {
    async function initializeCacheSystem() {
      try {
        console.log('初始化剪贴板缓存系统');
        
        // 设置缓存事件监听器
        setupCacheEventListeners();
        
        // 设置预加载事件监听器
        setupPreloadEventListeners();
        
        // 设置同步队列事件监听器
        setupSyncEventListeners();
        
        // 开始预加载
        const preloadSuccess = await preloadService.startAdaptivePreload();
        
        if (preloadSuccess) {
          // 从缓存获取初始数据
          await initializeFromCache();
        } else {
          console.warn('预加载失败，尝试从数据库直接加载');
          await fallbackToDirectLoad();
        }
        
      } catch (error) {
        console.error('缓存系统初始化失败:', error);
        await fallbackToDirectLoad();
      }
    }

    initializeCacheSystem();

    // 清理函数
    return () => {
      cleanupCacheSystem();
    };
  }, []);

  // 监听系统事件
  useEffect(() => {
    async function listenSystemEvents() {
      await listen("global_shortcut_copy_panel", async (evn) => {
        console.log("全局快捷键触发:", evn);
        await invoke('open_panel_window', { panelName: "copy-panel" })
      });

      // 监听剪切板更新事件 - 使用缓存系统
      await listen("clipboard-updated", async (event) => {
        // 如果是我们自己触发的复制操作，忽略这次更新
        if (ignoreNextClipboardUpdate.current) {
          console.log("忽略自己触发的剪切板更新");
          ignoreNextClipboardUpdate.current = false;
          return;
        }
        
        console.log("剪切板已更新，实时更新缓存");
        await handleClipboardUpdate(event);
      });

      // 监听数据清理事件
      await listen("data-cleared", async () => {
        console.log("数据已清理，清空缓存并重新加载");
        await handleDataCleared();
      });
    }

    listenSystemEvents();
  }, [])

  // 确保面板获得焦点
  useEffect(() => {
    const ensureFocus = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const windowLabel = currentWindow.label;

        if (windowLabel === 'copy-panel') {
          console.log('PanelPage mounted, ensuring window and DOM focus');

          // 1. 设置窗口焦点
          await currentWindow.setFocus();

          // 2. 强制设置DOM焦点
          const container = document.querySelector('.panel-container');
          if (container) {
            container.focus();
            console.log('DOM container focused');
          }

          // 3. 延迟再次尝试，确保焦点设置成功
          setTimeout(() => {
            if (container) {
              container.focus();
              console.log('DOM container focused again after delay');
            }
          }, 100);

          // 检查焦点状态
          const isFocused = await currentWindow.isFocused();
          console.log('Window focus status:', isFocused);
        }
      } catch (error) {
        console.error('Failed to ensure window focus:', error);
      }
    };

    // 延迟执行，确保DOM已经渲染
    setTimeout(ensureFocus, 50);
  }, []);

  // 监听窗口焦点变化
  useEffect(() => {
    const handleFocus = () => {
      console.log('PanelPage gained focus');
      // 当窗口获得焦点时，确保容器也获得焦点
      const container = document.querySelector('.panel-container');
      if (container) {
        container.focus();
        console.log('Container focused on window focus');
      }
    };

    const handleBlur = () => {
      console.log('PanelPage lost focus');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // 监听卡片数据变化，确保有数据时设置焦点
  useEffect(() => {
    if (cards.length > 0) {
      console.log('Cards loaded, ensuring container focus');
      setTimeout(() => {
        const container = document.querySelector('.panel-container');
        if (container) {
          container.focus();
          console.log('Container focused after cards loaded');
        }
      }, 100);
    }
  }, [cards]);

  // 虚拟滚动的加载更多处理
  const handleLoadMore = useCallback(() => {
    if (hasMore && !loading && cacheReady) {
      console.log('虚拟滚动触发加载更多');
      loadMoreHistory();
    }
  }, [hasMore, loading, cacheReady]);

  // 从缓存初始化数据
  async function initializeFromCache() {
    try {
      console.log('从缓存初始化数据');
      
      const cachedData = cacheManager.getCachedHistory(ITEMS_PER_PAGE, 0);
      
      if (cachedData.length > 0) {
        setCards(cachedData);
        setSelectedId(cachedData[0].id);
        setHasMore(cachedData.length === ITEMS_PER_PAGE);
        setOffset(ITEMS_PER_PAGE);
        
        console.log(`从缓存加载了 ${cachedData.length} 条记录`);
      } else {
        console.log('缓存为空，等待预加载完成');
        setCards([]);
        setSelectedId(null);
        setHasMore(false);
      }
      
      setCacheReady(true);
    } catch (error) {
      console.error('从缓存初始化失败:', error);
      setCacheReady(false);
    }
  }

  // 降级到直接数据库加载
  async function fallbackToDirectLoad() {
    console.log('降级到直接数据库加载');
    setLoading(true);
    
    try {
      const result = await invoke("get_clipboard_history", {
        limit: ITEMS_PER_PAGE,
        offset: 0
      });
      
      const unique = Array.isArray(result)
        ? result.filter((item, index, self) =>
          index === self.findIndex(t => t.id === item.id)
        )
        : [];
      
      console.log("直接加载历史记录", unique.length, "条");

      setCards(unique);
      setOffset(ITEMS_PER_PAGE);
      setHasMore(unique.length === ITEMS_PER_PAGE);
      
      if (unique.length > 0) {
        setSelectedId(unique[0].id);
      } else {
        setSelectedId(null);
      }
      
      // 将数据添加到缓存
      if (unique.length > 0) {
        cacheManager.appendRecords(unique);
      }
      
      setCacheReady(true);
    } catch (error) {
      console.error("直接加载失败:", error);
      setCards([]);
      setSelectedId(null);
      setCacheReady(false);
    } finally {
      setLoading(false);
    }
  }

  // 从缓存加载更多历史记录
  async function loadMoreHistory() {
    if (loading || !hasMore || !cacheReady) {
      console.log('跳过加载更多:', { loading, hasMore, cacheReady });
      return;
    }

    console.log('从缓存加载更多历史记录，当前偏移量:', offset);
    setLoading(true);
    
    try {
      // 首先尝试从缓存获取
      const cachedData = cacheManager.getCachedHistory(30, offset);
      
      if (cachedData.length > 0) {
        // 过滤重复项
        const newCards = cachedData.filter((newItem) => 
          !cards.some(existingCard => existingCard.id === newItem.id)
        );

        if (newCards.length > 0) {
          setCards(prevCards => [...prevCards, ...newCards]);
          setOffset(prevOffset => prevOffset + newCards.length);
          setHasMore(cachedData.length === 30);
          
          console.log(`从缓存加载了 ${newCards.length} 条新记录`);
        } else {
          setHasMore(false);
        }
      } else {
        // 缓存中没有更多数据，尝试从数据库加载
        console.log('缓存中没有更多数据，从数据库加载');
        await loadMoreFromDatabase();
      }
    } catch (error) {
      console.error("从缓存加载更多失败:", error);
      await loadMoreFromDatabase();
    } finally {
      setLoading(false);
    }
  }

  // 从数据库加载更多数据
  async function loadMoreFromDatabase() {
    try {
      const result = await invoke("get_clipboard_history", {
        limit: 30,
        offset: offset
      });

      if (Array.isArray(result) && result.length > 0) {
        // 添加到缓存
        cacheManager.appendRecords(result);
        
        // 过滤重复项并更新界面
        const newCards = result.filter((newItem) => 
          !cards.some(existingCard => existingCard.id === newItem.id)
        );

        if (newCards.length > 0) {
          setCards(prevCards => [...prevCards, ...newCards]);
          setOffset(prevOffset => prevOffset + newCards.length);
          setHasMore(result.length === 30);
          
          console.log(`从数据库加载了 ${newCards.length} 条新记录并添加到缓存`);
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("从数据库加载更多失败:", error);
      setHasMore(false);
    }
  }

  // 点击剪切板 - 使用useCallback优化性能
  const clickCard = useCallback(async (card) => {
    const { id, content_type, content } = card;
    setSelectedId(card ? id : null);

    try {
      console.log('Copying card content and hiding panel');

      // 记录访问，用于LRU和热点检测
      if (cacheReady) {
        cacheManager.recordAccess(id);
      }

      // 设置标志，忽略下一次剪切板更新事件
      ignoreNextClipboardUpdate.current = true;
      
      switch (content_type) {
        case "text":
          await Clipboard.writeText(content);
          break;

        case "html":
          // HTML内容需要同时写入HTML格式和纯文本格式
          const htmlText = content.replace(/<[^>]+>/g, ''); // 简单去除HTML标签作为纯文本
          await Clipboard.writeHtmlAndText(content, htmlText);
          break;

        case "image":
          const base64 = card.content.trim();
          await Clipboard.writeImageBase64(base64);
          break;

        case "files":
          try {
            let fileList;
            if (typeof content === 'string') {
              try {
                fileList = JSON.parse(content);
              } catch {
                fileList = [content];
              }
            } else {
              fileList = Array.isArray(content) ? content : [String(content)];
            }
            await Clipboard.writeFiles(fileList);
          } catch (fileError) {
            console.error('处理文件列表失败:', fileError);
          }
          break;

        default:
          console.warn("未知的剪切板类型:", content_type);
      }

      // 添加同步任务（如果需要）
      if (cacheReady) {
        syncQueue.enqueueSync('update', {
          recordId: id,
          action: 'access',
          timestamp: Date.now()
        }, 3); // 低优先级
      }

      // 复制成功后立即隐藏面板
      console.log('Content copied successfully, hiding panel');
      await invoke('hide_panel_window', { panelName: "copy-panel" });

    } catch (error) {
      console.error("复制到剪切板失败:", error);
      // 重置标志
      ignoreNextClipboardUpdate.current = false;
      // 即使复制失败也隐藏面板
      await invoke('hide_panel_window', { panelName: "copy-panel" });
    }
  }, [cacheReady, cacheManager, syncQueue]); // 添加依赖项

  // 简化的键盘导航 - 移除复杂的防抖逻辑
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (cards.length === 0) return;

      const currentIndex = cards.findIndex(card => card.id === selectedId);
      if (currentIndex === -1) return;

      console.log('Key pressed:', event.key, 'Current index:', currentIndex);

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          if (currentIndex > 0) {
            const newIndex = currentIndex - 1;
            const newId = cards[newIndex].id;
            console.log('Moving left to index:', newIndex);
            setSelectedId(newId);
          }
          break;

        case 'ArrowRight':
          event.preventDefault();
          if (currentIndex < cards.length - 1) {
            const newIndex = currentIndex + 1;
            const newId = cards[newIndex].id;
            console.log('Moving right to index:', newIndex);
            setSelectedId(newId);
            
            // 预加载：当接近末尾时触发加载更多
            const remainingItems = cards.length - newIndex;
            if (remainingItems <= 5 && hasMore && !loading && cacheReady) {
              console.log('接近末尾，预加载更多项目...');
              loadMoreHistory();
            }
          } else if (hasMore && !loading && cacheReady) {
            console.log('已到达末尾，加载更多项目...');
            loadMoreHistory();
          }
          break;

        case 'Home':
          event.preventDefault();
          if (currentIndex > 0) {
            const newId = cards[0].id;
            console.log('Moving to home');
            setSelectedId(newId);
          }
          break;

        case 'End':
          event.preventDefault();
          if (currentIndex < cards.length - 1) {
            const newId = cards[cards.length - 1].id;
            console.log('Moving to end');
            setSelectedId(newId);
          }
          break;

        case 'Enter':
          event.preventDefault();
          const selectedCard = cards.find(card => card.id === selectedId);
          if (selectedCard) {
            console.log('Enter pressed, clicking card:', selectedCard.id);
            clickCard(selectedCard);
          }
          break;

        case 'Escape':
          event.preventDefault();
          console.log('Escape pressed, hiding panel');
          invoke('hide_panel_window', { panelName: "copy-panel" });
          break;
      }
    };

    // 添加到 window 确保事件能被捕获
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cards, selectedId, hasMore, loading, cacheReady, clickCard]);

  // 获取当前选中项的索引，用于虚拟滚动
  const selectedIndex = useMemo(() => {
    return cards.findIndex(card => card.id === selectedId);
  }, [cards, selectedId]);

  // 虚拟滚动的项目渲染函数
  const renderVirtualItem = useCallback((card, index) => {
    const isSelected = card.id === selectedId;

    return (
      <VirtualClipboardCard
        key={card.id}
        card={card}
        isSelected={isSelected}
        cardType={cardType}
        onCardClick={(clickedCard) => {
          console.log('Card clicked:', clickedCard.id);
          clickCard(clickedCard);
        }}
        onCardSelect={(cardId) => {
          console.log('Card selected:', cardId);
          setSelectedId(cardId);
        }}
        virtualIndex={index}
      />
    );
  }, [selectedId, cardType, clickCard]);

  // 设置缓存事件监听器
  function setupCacheEventListeners() {
    // 监听缓存记录添加事件
    cacheManager.addEventListener(CacheEvents.RECORD_ADDED, (data) => {
      console.log('缓存记录已添加:', data.record.id);
      
      // 实时更新界面
      const newRecord = data.record;
      setCards(prevCards => {
        // 检查是否已存在
        if (prevCards.some(card => card.id === newRecord.id)) {
          return prevCards;
        }
        // 添加到顶部
        return [newRecord, ...prevCards];
      });
      
      // 如果没有选中项，选中新添加的记录
      if (!selectedId) {
        setSelectedId(newRecord.id);
      }
    });

    // 监听缓存清空事件
    cacheManager.addEventListener(CacheEvents.CACHE_CLEARED, () => {
      console.log('缓存已清空');
      setCards([]);
      setSelectedId(null);
      setHasMore(false);
      setOffset(0);
    });

    // 监听内存警告事件
    cacheManager.addEventListener(CacheEvents.MEMORY_WARNING, (data) => {
      console.warn('内存使用警告:', data);
      // 可以在这里显示用户提示或自动清理
    });
  }

  // 设置预加载事件监听器
  function setupPreloadEventListeners() {
    // 监听预加载完成事件
    preloadService.addEventListener('preload_completed', (data) => {
      console.log('预加载完成:', data);
      
      // 刷新界面数据
      if (data.loadedRecords > 0) {
        initializeFromCache();
      }
    });

    // 监听预加载错误事件
    preloadService.addEventListener('preload_error', (data) => {
      console.error('预加载失败:', data);
      
      // 显示错误提示或降级处理
      if (!cacheReady) {
        fallbackToDirectLoad();
      }
    });

    // 监听阶段完成事件
    preloadService.addEventListener('phase_completed', (data) => {
      console.log(`预加载阶段 ${data.phase} 完成:`, data);
      
      // 如果是第一阶段完成，立即更新界面
      if (data.phaseIndex === 0 && cards.length === 0) {
        initializeFromCache();
      }
    });
  }

  // 设置同步队列事件监听器
  function setupSyncEventListeners() {
    // 监听同步完成事件
    syncQueue.addEventListener('batch_processing_completed', (data) => {
      console.log('同步批次处理完成:', data);
    });

    // 监听同步错误事件
    syncQueue.addEventListener('task_failed', (data) => {
      console.error('同步任务失败:', data);
    });

    // 监听熔断器事件
    syncQueue.addEventListener('circuit_breaker_opened', (data) => {
      console.warn('同步熔断器开启:', data);
    });
  }

  // 处理剪贴板更新事件
  async function handleClipboardUpdate(event) {
    try {
      // 这里应该从事件中获取新的剪贴板数据
      // 由于当前的事件结构，我们需要从数据库获取最新记录
      const result = await invoke("get_clipboard_history", {
        limit: 1,
        offset: 0
      });

      if (Array.isArray(result) && result.length > 0) {
        const newRecord = result[0];
        
        // 添加到缓存
        const added = cacheManager.prependRecord(newRecord);
        
        if (added) {
          console.log('新剪贴板记录已添加到缓存:', newRecord.id);
          
          // 缓存事件监听器会自动更新界面
        }
      }
    } catch (error) {
      console.error('处理剪贴板更新失败:', error);
    }
  }

  // 处理数据清理事件
  async function handleDataCleared() {
    try {
      // 清空缓存
      cacheManager.clearCache();
      
      // 重新预加载
      const preloadSuccess = await preloadService.startAdaptivePreload();
      
      if (!preloadSuccess) {
        // 预加载失败，直接清空界面
        setCards([]);
        setSelectedId(null);
        setHasMore(false);
        setOffset(0);
      }
    } catch (error) {
      console.error('处理数据清理事件失败:', error);
    }
  }

  // 清理缓存系统
  function cleanupCacheSystem() {
    console.log('清理缓存系统资源');
    
    try {
      // 停止预加载
      preloadService.stopPreload();
      
      // 销毁同步队列
      syncQueue.destroy();
      
      // 清理缓存管理器的事件监听器
      cacheManager.eventListeners.clear();
    } catch (error) {
      console.error('清理缓存系统失败:', error);
    }
  }

  // 组件清理 - 确保在卸载时清理资源
  useEffect(() => {
    return () => {
      cleanupCacheSystem();
      console.log('PanelPage 组件卸载，清理资源完成');
    };
  }, []);

  return (
    <div
      className="panel-container w-full h-full overflow-hidden glass-strong focus:outline-none"
      tabIndex={0}
      autoFocus
      onFocus={() => console.log('Container focused')}
      onBlur={() => console.log('Container blurred')}
      onClick={(e) => {
        // 只有当点击的是容器本身（不是子元素）时才处理焦点
        if (e.target === e.currentTarget) {
          e.currentTarget.focus();
          console.log('Container clicked and focused');
        }
      }}
      style={{ height: '100vh' }} // 确保容器有明确的高度
    >
      {/* 缓存未就绪时显示加载状态 */}
      {!cacheReady && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">正在初始化缓存系统...</p>
          </div>
        </div>
      )}
      
      {/* 缓存就绪后显示内容 */}
      {cacheReady && (
        <VirtualScrollContainer
          ref={virtualScrollRef}
          items={cards}
          renderItem={renderVirtualItem}
          selectedIndex={selectedIndex}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          loading={loading}
          maintainScrollPosition={true}
          className="w-full h-full p-4"
        />
      )}
    </div>
  );
}