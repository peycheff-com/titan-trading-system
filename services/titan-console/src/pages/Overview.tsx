import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, TrendingUp, Bug, Target, Shield, Brain, Zap } from 'lucide-react';

import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { ServiceHealthCard } from '@/components/titan/ServiceHealthCard';
import { EventTimeline } from '@/components/titan/EventTimeline';
import { formatCurrency, formatPercent } from '@/types';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';

export default function Overview() {
  const [data, setData] = useState<any>(null);
  const { status } = useWebSocket({
    onMessage: (msg: any) => {
      if (msg.type === 'STATE_UPDATE' || msg.type === 'CONNECTED') {
        const stateData = msg.state || msg;
        setData((prev: any) => ({ ...prev, ...stateData }));
      }
    }
  });

  const portfolioKPIs = data || {
    equity: 0,
    daily_pnl: 0,
    daily_pnl_pct: 0,
    active_positions: 0,
    phase: 1,
    drawdown: 0
  };

  const criticalAlerts: any[] = [];
  const warningAlerts: any[] = [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">System Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real-time health and performance monitoring
          </p>
        </div>
        <StatusPill status={status === 'CONNECTED' ? 'healthy' : 'critical'} />
      </div>

      {/* KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiTile
          label="Equity"
          value={formatCurrency(portfolioKPIs.equity || 0)}
          size="md"
        />
        <KpiTile
          label="Daily PnL"
          value={formatCurrency(portfolioKPIs.daily_pnl || 0)}
          trend={portfolioKPIs.daily_pnl >= 0 ? 'up' : 'down'}
          trendValue={formatPercent(portfolioKPIs.daily_pnl_pct || 0)}
          variant={portfolioKPIs.daily_pnl >= 0 ? 'positive' : 'negative'}
        />
        <KpiTile
          label="Drawdown"
          value={formatPercent(portfolioKPIs.drawdown || 0)} // Real data needed
          subValue="Max: 5.0%"
          variant={portfolioKPIs.drawdown < -3 ? 'warning' : 'default'}
        />
        <KpiTile
          label="Phase"
          value={`Phase ${portfolioKPIs.phase || 1}`}
        />
        <KpiTile
          label="Positions"
          value={portfolioKPIs.active_positions || 0}
        />
      </div>

      {/* ... Rest of the UI structure (simplified for brevity, keeping existing layout where possible) ... */}
      
      <div className="grid gap-6 lg:grid-cols-3">
         {/* Organism Map */}
         <div className="lg:col-span-2 space-y-4">
           {/* Service Health Cards - Placeholder until fully mapped */}
           <div className="grid gap-2 sm:grid-cols-3">
            <ServiceHealthCard
               name="Brain"
               status="healthy" 
               lastHeartbeat={Date.now()}
               eventRate={0}
               compact
             />
             <ServiceHealthCard
               name="Execution"
               status={status === 'CONNECTED' ? 'healthy' : 'critical'}
               lastHeartbeat={Date.now()}
               eventRate={0}
               compact
             />
           </div>
         </div>
      </div>
    </div>
  );
}
