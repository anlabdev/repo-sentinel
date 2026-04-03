import { useEffect, useRef, useState } from "react";

export function OverlayScrollArea({ className, viewportClassName, children }: { className?: string; viewportClassName?: string; children: React.ReactNode }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ size: number; offset: number; visible: boolean }>({ size: 0, offset: 0, visible: false });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      const canScroll = scrollHeight > clientHeight + 1;
      if (!canScroll) {
        setThumb({ size: 0, offset: 0, visible: false });
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const size = Math.max(18, clientHeight * ratio);
      const maxOffset = Math.max(0, clientHeight - size);
      const offset = (scrollTop / Math.max(1, scrollHeight - clientHeight)) * maxOffset;
      setThumb({ size, offset, visible: true });
    };

    update();
    element.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className={`rs-scroll-area ${className ?? ""}`.trim()}>
      <div ref={viewportRef} className={`rs-scroll-viewport ${viewportClassName ?? ""}`.trim()}>{children}</div>
      {thumb.visible ? (
        <div className="rs-scrollbar">
          <div className="rs-scroll-thumb" style={{ height: `${thumb.size}px`, transform: `translateY(${thumb.offset}px)` }} />
        </div>
      ) : null}
    </div>
  );
}
