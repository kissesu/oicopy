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
      getClipboardHistory();
    }
    
    listenShortCut();
    
  }, [])


  // 获取剪切板历史
  async function getClipboardHistory() {
    const result = await invoke("get_clipboard_history");
    const unique = Array.isArray(result)
      ? result.filter((item, index, self) =>
        index === self.findIndex(t => t.id === item.id)
      )
      : [];
    console.log("历史记录", unique);

    setCards(unique);
    if (unique.length > 0) setSelectedId(unique[0].id);
  }

  // 点击剪切板
  async function clickCard(card) {
    const { id, content_type, content } = card;
    setSelectedId(card ? id : null);
    switch (content_type) {
      case "text":
        await Clipboard.writeText(content);

      case "html":
        await Clipboard.writeHtmlAndText(content);

      case "image":
        try {
          const base64 = card.content.trim(); // 确保没有前后空格或换行
          await Clipboard.writeImageBase64(base64);
        } catch (err) {
          console.error("复制图片失败：", err);
        }

      case "files":
        const files = JSON.parse(content);
        await Clipboard.writeFiles(files);
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
          const files = JSON.parse(content); // 假设 content 是 JSON 数组字符串
          console.log("files: ", files);

          return (
            <div className="w-full flex flex-col">
              <div className="flex justify-center w-full">
                <img src={FileIcon} alt="fileIcon" width={140} height={140} />
              </div>
              <div className="text-xs text-left break-all overflow-hidden line-clamp-3">
                {files[0]}
              </div>
              {/* <pre className="whitespace-pre-wrap break-all text-xs text-left">{files[0]}</pre> */}
              {/* {files.map((file, idx) => (
                <pre className="whitespace-pre-wrap break-all text-sm text-left" key={idx}>{file}</pre>
              ))} */}
            </div>
          );
        } catch {
          return <div className="text-red-500">无法解析文件列表</div>;
        }

      default:
        return <div className="text-gray-400">未知类型</div>;
    }
  }

  return (
    <div className="w-full h-full overflow-x-auto">
      {/* 使用 flex 布局让卡片横向排列，space-x-4 添加卡片间间距 */}
      <div className="no-scrollbar h-full flex flex-nowrap space-x-4 p-4">
        {cards.map(card => {
          const isSelected = card.id === selectedId;
          console.log(cards.length);

          return (
            <div
              key={card.id}
              onClick={() => clickCard(card)}
              className={`overflow-hidden w-[240px] flex-shrink-0 w-64 bg-white/80 backdrop-blur-xl rounded-xl shadow cursor-pointer
                border-4 ${isSelected ? 'border-blue-500' : 'border-indigo-100'}`}
            >
              <div className="flex flex-col overflow-hide">
                <div className="flex justify-between bg-[#7f7f7f] h-[60px] rounded-t-xl">
                  <div className="flex flex-col p-2 text-left text-white text-sm">
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
      </div>
    </div>
  );
}

