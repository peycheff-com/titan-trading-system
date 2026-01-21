import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/types";
import { cn } from "@/lib/utils";

export interface Position {
  symbol: string;
  side: "Buy" | "Sell";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  liquidationPrice: number;
  leverage: number;
}

interface PositionsTableProps {
  positions: Position[];
  onClosePosition: (symbol: string) => void;
}

export function PositionsTable({ positions, onClosePosition }: PositionsTableProps) {
  if (!positions || positions.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No open positions
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Mark</TableHead>
            <TableHead className="text-right">Liq. Price</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => {
             const pnlPercent = ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'Buy' ? 1 : -1);
             return (
              <TableRow key={pos.symbol}>
                <TableCell className="font-medium">
                  {pos.symbol}
                  <Badge variant="secondary" className="ml-2 text-[10px] h-4">
                    {pos.leverage}x
                  </Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "font-medium",
                      pos.side === "Buy" ? "text-emerald-500" : "text-red-500"
                    )}
                  >
                    {pos.side}
                  </span>
                </TableCell>
                <TableCell className="text-right">{pos.size}</TableCell>
                <TableCell className="text-right">{formatCurrency(pos.entryPrice)}</TableCell>
                <TableCell className="text-right">{formatCurrency(pos.markPrice)}</TableCell>
                <TableCell className="text-right text-orange-500">{formatCurrency(pos.liquidationPrice)}</TableCell>
                <TableCell className="text-right">
                  <div className={cn("text-sm font-medium", pos.unrealizedPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {formatCurrency(pos.unrealizedPnl)}
                  </div>
                  <div className={cn("text-xs", pnlPercent >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {formatPercent(pnlPercent)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-7 text-xs"
                    onClick={() => onClosePosition(pos.symbol)}
                  >
                    Close
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
