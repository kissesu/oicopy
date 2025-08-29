import React, { useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/zh-cn';
import AppIcon from './AppIcon';
import ZoomableHTML from './ZoomableHTML';
import FileIcon from '../assets/file_icon.svg';

// Initialize dayjs plugins
dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

/**
 * VirtualClipboardCard - Optimized clipboard card component for virtual scrolling
 * 
 * This component is specifically designed for use with @tanstack/react-virtual
 * and includes optimizations for:
 * - Memoization to prevent unnecessary re-renders
 * - Efficient prop comparison
 * - Optimized content rendering
 * - Virtual-specific styling and layout
 * 
 * @param {Object} props - Component props
 * @param {Object} props.card - Clipboard card data
 * @param {boolean} props.isSelected - Whether the card is currently selected
 * @param {Object} props.cardType - Card type configuration object
 * @param {Function} props.onCardClick - Callback for card click events
 * @param {Function} props.onCardSelect - Callback for card selection events
 * @param {number} props.virtualIndex - Virtual index for this card (optional)
 * @param {Object} props.style - Additional styles for virtual positioning
 */
const VirtualClipboardCard = React.memo(({
  card,
  isSelected = false,
  cardType,
  onCardClick,
  onCardSelect,
  virtualIndex,
  style = {},
  ...props
}) => {
  // Handle card click with proper event handling
  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Card clicked:', card.id);
    
    // 确保点击事件被正确处理
    if (onCardClick) {
      onCardClick(card);
    }
  }, [card, onCardClick]);

  // Handle mouse down for immediate selection feedback
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Card mouse down:', card.id);
    
    // Immediately select card on mouse down for better UX
    if (onCardSelect) {
      onCardSelect(card.id);
    }
  }, [card.id, onCardSelect]);

  // Memoized card className for performance
  const cardClassName = useMemo(() => {
    const baseClasses = 'overflow-hidden w-[240px] flex-shrink-0 bg-white rounded-xl shadow-lg cursor-pointer border-4';
    const selectionClasses = isSelected 
      ? 'border-blue-500 shadow-blue-500/30' 
      : 'border-gray-200';
    
    return `${baseClasses} ${selectionClasses}`;
  }, [isSelected]);

  // Memoized time display to avoid recalculating on every render
  const timeDisplay = useMemo(() => {
    return dayjs(card.timestamp).fromNow();
  }, [card.timestamp]);

  // Memoized card type info
  const cardTypeInfo = useMemo(() => {
    return cardType[card.content_type] || { name: '未知类型', icon: null };
  }, [card.content_type, cardType]);

  // Memoized content renderer for better performance
  const renderedContent = useMemo(() => {
    return renderCardContent(card);
  }, [card]);

  // Combine virtual positioning styles with custom styles
  const combinedStyle = useMemo(() => ({
    ...style,
    // Ensure proper virtual positioning
    position: style.position || 'relative',
  }), [style]);

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={cardClassName}
      style={{
        ...combinedStyle,
        pointerEvents: 'auto', // 确保鼠标事件可用
        zIndex: 1, // 确保在其他元素之上
      }}
      data-virtual-index={virtualIndex}
      {...props}
    >
      <div className="flex flex-col overflow-hide">
        {/* Card Header */}
        <div className="flex justify-between bg-gray-500 h-[60px] rounded-t-xl">
          <div className="flex flex-col p-2 text-left text-white text-sm drop-shadow-sm">
            <span className="font-bold !text-lg">
              {cardTypeInfo.name}
            </span>
            <span className="text-[10px]">
              {timeDisplay}
            </span>
          </div>
          <div className="rounded-t-xl rounded-bl-xl w-[60px] h-[60px]">
            {card.app_icon_base64 ? (
              <img
                src={`data:image/png;base64,${card.app_icon_base64}`}
                alt={card.source_app || 'App Icon'}
                className="inline-block flex-shrink-0"
                style={{ width: 60, height: 60 }}
                loading="lazy"
                onError={(e) => {
                  console.log('App icon failed to load, falling back to emoji');
                  // Could implement fallback logic here
                }}
              />
            ) : (
              <AppIcon
                bundleId={card.source_bundle_id}
                appName={card.source_app}
                size={60}
                className="flex-shrink-0"
              />
            )}
          </div>
        </div>
        
        {/* Card Content */}
        <div className="h-[164px] m-1 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0">
            {renderedContent}
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Renders card content based on content type
 * This function is extracted for better performance and reusability
 * 
 * @param {Object} card - Clipboard card data
 * @returns {JSX.Element} Rendered content
 */
function renderCardContent(card) {
  const { content, content_type } = card;

  switch (content_type) {
    case "text":
      return (
        <pre className="whitespace-pre-wrap break-words text-xs text-left font-mono p-1 rounded-md shadow-inner overflow-x-auto">
          {content}
        </pre>
      );

    case "html":
      return <ZoomableHTML html={content} />;

    case "image":
      return (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <img
            src={`data:image/png;base64,${content}`}
            alt="clipboard"
            className="max-w-full max-h-full object-contain rounded"
            loading="lazy"
          />
        </div>
      );

    case "rtf":
      return (
        <div className="italic text-gray-500">
          RTF 格式暂不支持直接预览
        </div>
      );

    case "files":
      try {
        let files;
        if (typeof content === 'string') {
          try {
            files = JSON.parse(content);
          } catch (jsonError) {
            console.warn('JSON解析失败，将字符串作为单个文件路径处理:', jsonError);
            files = [content];
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

// Set display name for debugging
VirtualClipboardCard.displayName = 'VirtualClipboardCard';

export default VirtualClipboardCard;