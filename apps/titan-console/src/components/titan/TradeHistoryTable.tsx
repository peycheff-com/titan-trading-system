import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Clock,
  Database,
  AlertTriangle,
  Brain,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/types';

export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  size: number;
  price: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'FILLED' | 'CANCELLED' | 'REJECTED';
  reason?: string;
  latency?: number;
  strategy?: string;
  forensics?: {
    signalScore?: number;
    marketImpact?: number;
    rejectionReason?: string;
    aiReasoning?: string;
  };
}

interface TradeHistoryTableProps {
  trades: Trade[];
}

export const TradeHistoryTable = ({ trades }: TradeHistoryTableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (trades.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No trades found.</div>;
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b border-border">
          <tr>
            <th className="w-8 p-3"></th>
            <th className="p-3 text-left font-semibold text-muted-foreground">Time</th>
            <th className="p-3 text-left font-semibold text-muted-foreground">Symbol</th>
            <th className="p-3 text-left font-semibold text-muted-foreground">Side</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Size</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Price</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">PnL</th>
            <th className="p-3 text-right font-semibold text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <>
              <tr
                key={trade.id}
                onClick={() => toggleExpand(trade.id)}
                className={cn(
                  'cursor-pointer hover:bg-accent/50 border-b border-border/50 transition-colors',
                  expandedId === trade.id && 'bg-accent/20',
                )}
              >
                <td className="p-3 text-center">
                  {expandedId === trade.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="p-3 font-mono text-xs">
                  {new Date(trade.timestamp).toLocaleTimeString()}
                </td>
                <td className="p-3 font-medium">{trade.symbol}</td>
                <td
                  className={cn(
                    'p-3 font-medium',
                    trade.side === 'BUY' ? 'text-green-500' : 'text-red-500',
                  )}
                >
                  {trade.side}
                </td>
                <td className="p-3 text-right font-mono">{trade.size}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(trade.price)}</td>
                <td
                  className={cn(
                    'p-3 text-right font-mono',
                    (trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500',
                  )}
                >
                  {trade.pnl ? formatCurrency(trade.pnl) : '-'}
                </td>
                <td className="p-3 text-right">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded text-xxs font-medium uppercase',
                      trade.status === 'FILLED'
                        ? 'bg-green-500/10 text-green-500'
                        : trade.status === 'REJECTED'
                          ? 'bg-red-500/10 text-red-500'
                          : 'bg-yellow-500/10 text-yellow-500',
                    )}
                  >
                    {trade.status}
                  </span>
                </td>
              </tr>
              {expandedId === trade.id && (
                <tr className="bg-muted/30">
                  <td colSpan={8} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Activity size={12} /> Execution Forensics
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                          <span>Latency:</span>{' '}
                          <span className="text-foreground font-mono">{trade.latency || 0}ms</span>
                          <span>Strategy:</span>{' '}
                          <span className="text-foreground">{trade.strategy || 'N/A'}</span>
                          <span>Market Impact:</span>{' '}
                          <span className="text-foreground">
                            {trade.forensics?.marketImpact
                              ? formatPercent(trade.forensics.marketImpact)
                              : 'N/A'}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-semibold flex items-center gap-2">
                          <Brain size={12} /> Decision Reasoning
                        </h4>
                        <p className="text-muted-foreground p-2 bg-background rounded border border-border">
                          {trade.forensics?.aiReasoning ||
                            trade.reason ||
                            'No reasoning available.'}
                        </p>
                        {trade.status === 'REJECTED' && (
                          <div className="flex items-center gap-2 text-red-400 mt-2">
                            <AlertTriangle size={12} />
                            <span>Rejection: {trade.forensics?.rejectionReason}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
};
