import { useState } from 'react';
import { History, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TradeHistoryTable, Trade } from '@/components/titan/TradeHistoryTable';

const MOCK_TRADES: Trade[] = [
  {
    id: 'tr_1',
    timestamp: Date.now() - 1000 * 60 * 5,
    symbol: 'BTCUSDT',
    side: 'BUY',
    size: 0.1,
    price: 64150,
    pnl: 150,
    pnlPercent: 0.0023,
    status: 'FILLED',
    latency: 124,
    strategy: 'Phase 1 (Scavenger)',
    forensics: {
        signalScore: 0.89,
        marketImpact: 0.001,
        aiReasoning: 'Detected localized volatility burst with CVD divergence + 2-sigma volume spike. Anticipating mean reversion.',
    }
  },
  {
    id: 'tr_2',
    timestamp: Date.now() - 1000 * 60 * 120,
    symbol: 'ETHUSDT',
    side: 'SELL',
    size: 5.0,
    price: 3450,
    pnl: -45,
    pnlPercent: -0.0015,
    status: 'FILLED',
    latency: 98,
    strategy: 'Phase 2 (Hunter)',
    forensics: {
        signalScore: 0.72,
        marketImpact: 0.02,
        aiReasoning: 'Fractal structure breakdown on M15. FVG target at 3420.',
    }
  },
  {
    id: 'tr_3',
    timestamp: Date.now() - 1000 * 60 * 15,
    symbol: 'SOLUSDT',
    side: 'BUY',
    size: 100,
    price: 145,
    status: 'REJECTED',
    reason: 'Risk Gated',
    latency: 4,
    forensics: {
        rejectionReason: 'Max Daily Loss Limit Approaching (95%)',
        aiReasoning: 'Strong momentum signal but rejected by RiskGuardian hard gate.',
    }
  }
];

export default function TradeHistory() {
  const [trades] = useState<Trade[]>(MOCK_TRADES);

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Trade History
          </h1>
          <p className="text-sm text-muted-foreground">
            Audit trail of all system execution and order forensics.
          </p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
            <Button variant="ghost" size="sm">
                <Download className="mr-2 h-4 w-4" /> Export
            </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border p-4 shadow-sm">
         <TradeHistoryTable trades={trades} />
      </div>
    </div>
  );
}
