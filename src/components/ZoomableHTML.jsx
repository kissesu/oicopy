import { useEffect, useRef, useState } from "react";

export default function ZoomableHTML({ html }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [isLongContent, setIsLongContent] = useState(false);

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current || !contentRef.current) return;

      try {
        const container = containerRef.current;
        const content = contentRef.current;

        // 重置所有样式以获取真实尺寸
        content.style.transform = 'scale(1)';
        content.style.width = 'auto';
        content.style.height = 'auto';
        content.style.maxWidth = 'none';
        content.style.maxHeight = 'none';

        // 强制重新计算布局
        content.offsetHeight;

        // 获取容器和内容的真实尺寸
        const containerRect = container.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        const containerWidth = containerRect.width;
        const containerHeight = containerRect.height;
        let contentWidth = contentRect.width;
        let contentHeight = contentRect.height;

        console.log('Container size:', containerWidth, 'x', containerHeight);
        console.log('Content size:', contentWidth, 'x', contentHeight);

        // 如果内容尺寸为0或异常，使用默认值
        if (contentWidth <= 0 || contentHeight <= 0) {
          contentWidth = 1200; // 假设网页宽度
          contentHeight = 800; // 假设网页高度
          console.log('Using default content size:', contentWidth, 'x', contentHeight);
        }

        // 只按宽度缩放，让高度自然溢出
        const widthScale = containerWidth / contentWidth;

        // 只使用宽度缩放比例
        let newScale = widthScale;

        // 确保缩放比例在合理范围内
        newScale = Math.max(0.05, Math.min(1, newScale));

        console.log('Calculated scale (width-based):', newScale);
        console.log('Width scale:', widthScale);

        // 计算缩放后的高度，判断是否需要滚动
        const scaledHeight = contentHeight * newScale;
        const isLong = scaledHeight > containerHeight;
        setIsLongContent(isLong);

        console.log('Scaled height:', scaledHeight, 'Container height:', containerHeight, 'Is long:', isLong);

        setScale(newScale);

        // 应用缩放和尺寸
        content.style.transform = `scale(${newScale})`;
        content.style.transformOrigin = 'top left';
        content.style.width = `${contentWidth}px`;
        content.style.height = `${contentHeight}px`;

        console.log('Applied scale:', newScale, 'Is long content:', isLong);
      } catch (error) {
        console.error('Error calculating scale:', error);
      }
    };

    // 延迟执行以确保DOM完全渲染
    const timer = setTimeout(calculateScale, 50);

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(calculateScale, 50);
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [html]);

  // 使用原生DOM方法安全地渲染HTML
  const renderContent = () => {
    try {
      // 检查html是否为有效字符串
      if (!html || typeof html !== 'string') {
        return (
          <div className="text-gray-500 text-xs p-2">
            无HTML内容
          </div>
        );
      }

      // 创建一个临时的DOM元素来清理HTML
      const tempDiv = document.createElement('div');
      
      // 先进行基本的文本清理
      let cleanHtml = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除脚本
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除样式
        .replace(/<link[^>]*>/gi, '') // 移除链接
        .replace(/<meta[^>]*>/gi, '') // 移除meta标签
        .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '') // 移除title标签
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // 移除事件处理器
        .replace(/javascript:/gi, '') // 移除javascript协议
        .replace(/data:/gi, '') // 移除data协议（可选）
        .trim();

      // 如果包含完整的HTML文档结构，提取body内容
      const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        cleanHtml = bodyMatch[1];
      } else {
        // 移除文档结构标签
        cleanHtml = cleanHtml
          .replace(/<\/?html[^>]*>/gi, '')
          .replace(/<\/?head[^>]*>/gi, '')
          .replace(/<\/?body[^>]*>/gi, '');
      }

      // 使用DOMPurify的简化版本 - 手动清理
      tempDiv.innerHTML = cleanHtml;
      
      // 移除所有危险的属性和交互元素
      const allElements = tempDiv.querySelectorAll('*');
      allElements.forEach(element => {
        // 保留的安全属性列表（移除href以禁用链接）
        const safeAttributes = ['class', 'id', 'src', 'alt', 'title', 'width', 'height', 'style'];
        const attributesToRemove = [];
        
        // 收集需要移除的属性
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          if (!safeAttributes.includes(attr.name.toLowerCase())) {
            attributesToRemove.push(attr.name);
          }
        }
        
        // 移除不安全的属性
        attributesToRemove.forEach(attrName => {
          element.removeAttribute(attrName);
        });

        // 特别处理链接元素 - 移除href属性并添加视觉样式
        if (element.tagName.toLowerCase() === 'a') {
          element.removeAttribute('href');
          element.removeAttribute('target');
          element.style.cursor = 'default';
          element.style.textDecoration = 'underline';
          element.style.color = '#3b82f6'; // 保持链接样式但不可点击
        }

        // 特别处理按钮和表单元素
        if (['button', 'input', 'select', 'textarea', 'form'].includes(element.tagName.toLowerCase())) {
          element.setAttribute('disabled', 'true');
          element.style.pointerEvents = 'none';
        }
        
        // 清理style属性
        if (element.hasAttribute('style')) {
          const style = element.getAttribute('style');
          if (style) {
            // 简化样式，移除可能有问题的部分
            const cleanStyle = style
              .replace(/expression\s*\([^)]*\)/gi, '') // 移除CSS表达式
              .replace(/javascript:/gi, '') // 移除javascript
              .replace(/behavior\s*:/gi, '') // 移除behavior
              .replace(/binding\s*:/gi, '') // 移除binding
              .replace(/font-family\s*:\s*[^;]*/gi, 'font-family: Arial, sans-serif'); // 简化字体
            element.setAttribute('style', cleanStyle);
          }
        }
      });

      // 获取清理后的HTML，并添加CSS样式确保不可交互
      let finalHtml = tempDiv.innerHTML;
      
      if (!finalHtml || finalHtml.trim().length === 0) {
        return (
          <div className="text-gray-500 text-xs p-2">
            HTML内容为空
          </div>
        );
      }

      // 添加CSS样式确保所有元素都不可交互
      const disableInteractionCSS = `
        <style>
          * {
            pointer-events: none !important;
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
          }
          a, button, input, select, textarea {
            cursor: default !important;
            text-decoration: none !important;
          }
          a:hover, button:hover {
            text-decoration: none !important;
          }
        </style>
      `;
      
      finalHtml = disableInteractionCSS + finalHtml;

      // 使用dangerouslySetInnerHTML安全地渲染清理后的HTML
      return (
        <div 
          dangerouslySetInnerHTML={{ __html: finalHtml }}
          className="w-full h-full pointer-events-none select-none"
          style={{
            pointerEvents: 'none', // 禁用所有鼠标事件
            userSelect: 'none',    // 禁用文本选择
          }}
        />
      );

    } catch (error) {
      console.error('HTML rendering error:', error);
      return (
        <div className="text-red-500 text-xs p-2">
          HTML 内容渲染失败: {error.message}
        </div>
      );
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-white rounded"
      style={{
        pointerEvents: 'none', // 确保整个容器不可交互
        userSelect: 'none',
      }}
    >
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          backgroundColor: 'transparent',
          color: '#333333',
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none', // 双重保险
          userSelect: 'none',
        }}
        className="html-content text-xs text-left"
      >
        {renderContent()}
      </div>

      {/* 内容类型指示器 */}
      {isLongContent && (
        <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 py-0.5 rounded">
          长内容
        </div>
      )}
    </div>
  );
}