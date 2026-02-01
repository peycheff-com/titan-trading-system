import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/types';

export interface DecisionLogEntry {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  score: number;
  status: 'ACCEPTED' | 'REJECTED';
  reason: string;
  engine: 'Hunter' | 'Scavenger';
}

interface DecisionLogTableProps {
  logs: DecisionLogEntry[];
}

export function DecisionLogTable({ logs }: DecisionLogTableProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No decision logs available
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Engine</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(log.timestamp).toLocaleTimeString()}
              </TableCell>
              <TableCell className="font-medium text-xs">{log.engine}</TableCell>
              <TableCell className="font-mono text-xs">{log.symbol}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'text-xs font-bold',
                    log.side === 'LONG' ? 'text-emerald-500' : 'text-red-500',
                  )}
                >
                  {log.side}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatNumber(log.score, 2)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={log.status === 'ACCEPTED' ? 'default' : 'secondary'}
                  className={cn(
                    'text-[10px]',
                    log.status === 'REJECTED' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {log.status}
                </Badge>
              </TableCell>
              <TableCell
                className="text-xs text-muted-foreground max-w-[200px] truncate"
                title={log.reason}
              >
                {log.reason}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
