/**
 * ResizablePane — Vertical Split with Drag Handle
 *
 * Splits a container into a top (main) and bottom (secondary) region.
 * The drag handle between them adjusts the split ratio.
 * Height ratio is persisted to localStorage.
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResizablePaneProps {
  /** Top/main content (always visible) */
  top: ReactNode;
  /** Bottom/secondary content (hidden when bottomVisible=false) */
  bottom?: ReactNode;
  /** Whether the bottom pane is visible */
  bottomVisible?: boolean;
  /** localStorage key for persisting the ratio */
  storageKey?: string;
  /** Default bottom height as fraction (0–1), default 0.3 */
  defaultRatio?: number;
  /** Minimum bottom height in px */
  minBottom?: number;
  className?: string;
}

export function ResizablePane({
  top,
  bottom,
  bottomVisible = false,
  storageKey = 'titan-pane-ratio',
  defaultRatio = 0.3,
  minBottom = 120,
  className,
}: ResizablePaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const [ratio, setRatio] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 0.7) return parsed;
      }
    } catch { /* ignore */ }
    return defaultRatio;
  });

  // Persist ratio changes
  useEffect(() => {
    localStorage.setItem(storageKey, String(ratio));
  }, [ratio, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalHeight = rect.height;
      const mouseY = ev.clientY - rect.top;
      const topHeight = Math.max(100, Math.min(totalHeight - minBottom, mouseY));
      const newRatio = 1 - topHeight / totalHeight;
      setRatio(Math.max(0.1, Math.min(0.7, newRatio)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [minBottom]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setRatio((r) => Math.min(0.7, r + 0.05));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setRatio((r) => Math.max(0.1, r - 0.05));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setRatio(0.7);
    } else if (e.key === 'End') {
      e.preventDefault();
      setRatio(0.1);
    }
  };

  const showBottom = bottomVisible && bottom;

  return (
    <div ref={containerRef} className={cn('flex flex-col h-full', className)}>
      {/* Top region */}
      <div
        className="overflow-y-auto scrollbar-titan"
        style={{ flex: showBottom ? `0 0 ${(1 - ratio) * 100}%` : '1 1 auto' }}
      >
        {top}
      </div>

      {/* Drag handle */}
      {showBottom && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize panels"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={10}
          aria-valuemax={70}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="flex h-1.5 flex-shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-card hover:bg-muted transition-colors group focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          onMouseDown={onMouseDown}
          onKeyDown={handleKeyDown}
        >
          <div className="h-0.5 w-8 rounded-full bg-border group-hover:bg-muted-foreground transition-colors" />
        </div>
      )}

      {/* Bottom region */}
      {showBottom && (
        <div
          className="overflow-y-auto scrollbar-titan"
          style={{ flex: `0 0 ${ratio * 100}%` }}
        >
          {bottom}
        </div>
      )}
    </div>
  );
}
