import { cn } from '@/lib/utils';

interface DiffViewerProps {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  className?: string;
}

export function DiffViewer({ before, after, className }: DiffViewerProps) {
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return (
    <div className={cn('rounded-md border border-border bg-muted/20 font-mono text-xs', className)}>
      <div className="grid grid-cols-2 border-b border-border">
        <div className="border-r border-border bg-pnl-negative/10 px-3 py-1.5 text-xxs font-medium uppercase tracking-wider text-pnl-negative">
          Before
        </div>
        <div className="bg-pnl-positive/10 px-3 py-1.5 text-xxs font-medium uppercase tracking-wider text-pnl-positive">
          After
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {allKeys.map((key) => {
          const beforeValue = before[key];
          const afterValue = after[key];
          const hasChanged = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);

          return (
            <div key={key} className="grid grid-cols-2">
              <div
                className={cn(
                  'border-r border-border px-3 py-1.5',
                  hasChanged && 'bg-pnl-negative/5',
                )}
              >
                <span className="text-muted-foreground">{key}: </span>
                <span className={cn(hasChanged ? 'text-pnl-negative' : 'text-foreground')}>
                  {beforeValue !== undefined ? JSON.stringify(beforeValue) : '—'}
                </span>
              </div>
              <div className={cn('px-3 py-1.5', hasChanged && 'bg-pnl-positive/5')}>
                <span className="text-muted-foreground">{key}: </span>
                <span className={cn(hasChanged ? 'text-pnl-positive' : 'text-foreground')}>
                  {afterValue !== undefined ? JSON.stringify(afterValue) : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
