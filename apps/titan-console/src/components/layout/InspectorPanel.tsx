/**
 * Inspector Panel
 *
 * Entity-agnostic right-side panel that shows details for the
 * currently selected entity. Resizable via drag handle.
 */

import { useInspector } from '@/context/InspectorContext';
import { cn } from '@/lib/utils';
import { X, GripVertical, Minus, FileText, AlertTriangle, Package } from 'lucide-react';
import { useRef, useCallback, useEffect } from 'react';

const entityIcons = {
  position: Package,
  order: FileText,
  intent: FileText,
  incident: AlertTriangle,
  config: FileText,
  phase: Package,
  none: Minus,
} as const;

export function InspectorPanel() {
  const { entity, isOpen, width, setWidth, setOpen } = useInspector();
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      e.preventDefault();
    },
    [width],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setWidth(startWidth.current + delta);
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [setWidth]);

  if (!isOpen) return null;

  const Icon = entity ? entityIcons[entity.type] || FileText : Minus;

  return (
    <div
      ref={panelRef}
      className="relative flex h-full flex-col border-l border-border bg-card"
      style={{ width: `${width}px`, minWidth: '280px', maxWidth: '480px' }}
    >
      {/* Drag handle */}
      <div
        className="absolute inset-y-0 left-0 z-10 flex w-1.5 cursor-col-resize items-center justify-center hover:bg-primary/20 transition-colors"
        onMouseDown={onMouseDown}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100 transition-opacity" />
      </div>

      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-medium text-foreground">
            {entity ? entity.title : 'Inspector'}
          </h3>
          {entity && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-medium text-muted-foreground uppercase">
              {entity.type}
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-titan">
        {entity && entity.type !== 'none' ? (
          <div className="space-y-4">
            {/* Properties */}
            {entity.data && Object.keys(entity.data).length > 0 && (
              <section>
                <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                  Properties
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(entity.data).map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-mono text-foreground truncate max-w-[60%] text-right">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Receipt timeline placeholder */}
            <section>
              <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                Receipt Timeline
              </h4>
              <div className="rounded-md border border-border bg-muted/50 p-3 text-center text-xs text-muted-foreground">
                No receipts for this entity
              </div>
            </section>

            {/* Actions placeholder */}
            <section>
              <h4 className="mb-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </h4>
              <div className="flex gap-2">
                <button className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  View Evidence
                </button>
                <button className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  Drill Down
                </button>
              </div>
            </section>
          </div>
        ) : (
          /* Empty state */
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Minus className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-sm text-muted-foreground">Select an entity to inspect</p>
              <p className="mt-1 text-xxs text-muted-foreground/60">
                Click a row in any table, or select an intent from chat
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
