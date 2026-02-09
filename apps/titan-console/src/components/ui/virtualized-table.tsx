import * as React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

interface VirtualizedTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: React.ReactNode;
    cell: (item: T) => React.ReactNode;
    width?: number; // percentage or fixed width style
  }[];
  height?: number | string;
  rowHeight?: number;
  className?: string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function VirtualizedTable<T>({
  data,
  columns,
  height = '100%',
  rowHeight = 40,
  className,
  onRowClick,
  emptyMessage = 'No data available',
}: VirtualizedTableProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className={cn('relative w-full overflow-auto rounded-md border', className)}
      style={{ height }}
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className="whitespace-nowrap"
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            virtualizer.getVirtualItems().map((virtualRow) => {
              const item = data[virtualRow.index];
              return (
                <TableRow
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'absolute w-full',
                    onRowClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={`${virtualRow.key}-${col.key}`}
                      style={col.width ? { width: col.width } : undefined}
                      className="whitespace-nowrap truncate"
                    >
                      {col.cell(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
