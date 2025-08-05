import { useEffect, useRef, useState } from "react";
import parse from "html-react-parser";

export default function ZoomableHTML({ html }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current || !contentRef.current) return;

      const containerWidth = containerRef.current.offsetWidth;
      const contentWidth = contentRef.current.getBoundingClientRect().width / scale; // 修正 scale 影响

      const newScale = Math.min(1, containerWidth / contentWidth);
      setScale(newScale);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerRef.current);

    resize(); // 初始化缩放

    return () => resizeObserver.disconnect();
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden bg-white rounded"
    >
      <div
        ref={contentRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: `${100 / scale}%`, // 防止缩放导致折行
        }}
        className="text-xs text-left overflow-hidden no-scrollbar [&_img]:max-w-full [&_img]:h-auto [&_video]:max-w-full [&_video]:h-auto"
      >
        {parse(html)}
      </div>
    </div>
  );
}