import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T) => ReactNode;
}

interface DenseTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  selectedKey?: string;
  emptyMessage?: string;
  className?: string;
  stickyHeader?: boolean;
  maxHeight?: string;
}

export function DenseTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectedKey,
  emptyMessage = 'No data available',
  className,
  stickyHeader = true,
  maxHeight,
}: DenseTableProps<T>) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-8 text-sm text-muted-foreground',
          className,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn('scrollbar-titan overflow-auto rounded-md border border-border', className)}
      style={{ maxHeight }}
    >
      <table className="table-dense w-full min-w-full">
        <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="border-b border-border bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'whitespace-nowrap text-xxs font-semibold uppercase tracking-wider text-muted-foreground',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right',
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const key = keyExtractor(item);
            const isSelected = selectedKey === key;

            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b border-border/50 bg-card transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-accent/50',
                  isSelected && 'bg-primary/10',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'whitespace-nowrap font-mono text-xs text-foreground',
                      col.align === 'center' && 'text-center',
                      col.align === 'right' && 'text-right',
                    )}
                  >
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
