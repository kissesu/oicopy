import { useState, useEffect } from "react";
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

dayjs.extend(relativeTime)
dayjs.locale('zh-cn'); // 设置全局语言为中文

// content: "warning: value assigned to `saved` is never read↵   --> src/clipboard_management.rs:157:29↵    |↵157 | ...                   saved = true;…"
// content_type: "text"
// id: 4
// preview: "warning: value assigned to `saved` is never read↵   --> src/clipboard_management.rs:157:29↵    |↵157..."
// timestamp: "2025-07-28 19:35:53"

export default function PanelPage() {

  const [selectedId, setSelectedId] = useState(null);
  const [cards, setCards] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const ITEMS_PER_PAGE = 30;

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
  useEffect(() => {
    async function listenShortCut() {
      await listen("global_shortcut_copy_panel", async (evn) => {
        alert("evn: ",evn);
        console.log("evn: ",evn);
        await invoke('open_panel_window', {panelName: "copy-panel"})
        // 确认 getCurrentWindow() 返回的是 Promise
        // await getCurrentWindow().setDecorations(false);
      })
      
      // 监听剪切板更新事件
      await listen("clipboard-updated", async () => {
        console.log("剪切板已更新，重新获取历史记录");
        await getClipboardHistory();
      });
      
      getClipboardHistory();
    }
    
    listenShortCut();
    
  }, [])

  // 滚动监听器
  const handleScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.target;
    const scrollPercentage = (scrollLeft + clientWidth) / scrollWidth;
    
    // 当滚动到超过 80% 时，加载更多数据
    if (scrollPercentage > 0.8 && hasMore && !loading) {
      console.log('达到加载更多的阈值，开始加载...');
      loadMoreHistory();
    }
  };


  // 获取剪切板历史（初始加载）
  async function getClipboardHistory() {
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
      console.log("历史记录", unique);

      setCards(unique);
      setOffset(ITEMS_PER_PAGE);
      setHasMore(unique.length === ITEMS_PER_PAGE);
      if (unique.length > 0) setSelectedId(unique[0].id);
    } catch (error) {
      console.error("获取剪切板历史失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 加载更多历史记录
  async function loadMoreHistory() {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const result = await invoke("get_clipboard_history", {
        limit: 50, // 后续加载时一次加载50条
        offset: offset
      });
      
      if (Array.isArray(result) && result.length > 0) {
        const newCards = result.filter((item, index, self) =>
          index === self.findIndex(t => t.id === item.id)
        );
        
        // 去重合并
        const allCards = [...cards, ...newCards];
        const uniqueCards = allCards.filter((item, index, self) =>
          index === self.findIndex(t => t.id === item.id)
        );
        
        setCards(uniqueCards);
        setOffset(prevOffset => prevOffset + 50);
        setHasMore(result.length === 50);
        
        console.log(`加载了 ${newCards.length} 条新记录，共 ${uniqueCards.length} 条`);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("加载更多历史记录失败:", error);
    } finally {
      setLoading(false);
    }
  }

  // 点击剪切板
  async function clickCard(card) {
    const { id, content_type, content } = card;
    setSelectedId(card ? id : null);
    
    try {
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
    } catch (error) {
      console.error("复制到剪切板失败:", error);
    }
  }

  function renderCardContent(card) {
    const { content, content_type } = card;

    switch (content_type) {
      case "text":
        return <pre className="whitespace-pre-wrap break-words text-xs text-left font-mono p-1 rounded-md shadow-inner overflow-x-auto">
          {content}
        </pre>;
      // return <pre className="whitespace-pre-wrap text-sm text-left">{content}</pre>;

      case "html":
        return (
          <ZoomableHTML html={content} />
        );

      case "image":
        return (
          <div className="w-full h-full  flex flex-col">
            <img
              src={`data:image/png;base64,${content}`}
              alt="clipboard"
              className="max-w-full max-h-48 object-contain rounded"
            />
          </div>
        );

      case "rtf":
        return <div className="italic text-gray-500">RTF 格式暂不支持直接预览</div>;

      case "files":
        try {
          let files;
          if (typeof content === 'string') {
            // 先检查是否已经是有效的JSON字符串
            try {
              files = JSON.parse(content);
            } catch (jsonError) {
              console.warn('JSON解析失败，将字符串作为单个文件路径处理:', jsonError);
              files = [content]; // 将字符串作为单个文件路径
            }
          } else if (Array.isArray(content)) {
            files = content;
          } else {
            console.warn('未知的文件内容格式:', typeof content, content);
            files = [String(content)];
          }
          
          if (!Array.isArray(files)) {
            return <div className="text-red-500">文件数据格式错误</div>;
          }
          
          console.log("files: ", files);

          return (
            <div className="w-full flex flex-col">
              <div className="flex justify-center w-full">
                <img src={FileIcon} alt="fileIcon" width={140} height={140} />
              </div>
              <div className="text-xs text-left break-all overflow-hidden line-clamp-3">
                {files.length > 0 ? files[0] : '无文件'}
              </div>
              {files.length > 1 && (
                <div className="text-xs text-gray-500 text-center mt-1">
                  +{files.length - 1} 个文件
                </div>
              )}
            </div>
          );
        } catch (error) {
          console.error('解析文件列表失败:', error);
          return <div className="text-red-500">无法解析文件列表</div>;
        }

      default:
        return <div className="text-gray-400">未知类型</div>;
    }
  }

  return (
    <div className="w-full h-full overflow-x-auto glass-strong">
      {/* 检查是否有数据 */}
      {cards.length === 0 && !loading ? (
        <div className="h-full flex items-center justify-center">
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
      ) : (
        /* 使用 flex 布局让卡片横向排列，space-x-4 添加卡片间间距 */
        <div className="no-scrollbar h-full flex flex-nowrap space-x-4 p-4" onScroll={handleScroll}>
          {cards.map(card => {
            const isSelected = card.id === selectedId;
            console.log(cards.length);

            return (
              <div
                key={card.id}
                onClick={() => clickCard(card)}
                className={`overflow-hidden w-[240px] flex-shrink-0 w-64 bg-white rounded-xl shadow-lg cursor-pointer transition-all duration-200
                  border-4 ${isSelected ? 'border-blue-500 shadow-lg shadow-blue-500/30' : 'border-gray-200'}`}
              >
                <div className="flex flex-col overflow-hide">
                  <div className="flex justify-between bg-gray-500 h-[60px] rounded-t-xl">
                    <div className="flex flex-col p-2 text-left text-white text-sm drop-shadow-sm">
                      <span className="font-bold !text-lg">
                        {cardType[card.content_type].name}
                      </span>
                      <span className="text-[10px]">
                        {dayjs(card.timestamp).fromNow()}
                        {card.timestamp}
                      </span>
                    </div>
                    <div className="rounded-t-xl rounded-bl-xl w-[60px] h-[60px]">
                      <img src={cardType[card.content_type].icon} alt="" width={60} height={60} style={{ position: "relative", left: "4px" }} />
                    </div>
                  </div>
                  <div className="h-full m-1">
                    {renderCardContent(card)}
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* 加载更多指示器 */}
          {loading && (
            <div className="flex-shrink-0 w-64 h-40 flex items-center justify-center">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-8 h-8 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="text-sm text-gray-500">加载中...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

