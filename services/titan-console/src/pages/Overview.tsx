import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, TrendingUp, Bug, Target, Shield, Brain, Zap } from 'lucide-react';

import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { ServiceHealthCard } from '@/components/titan/ServiceHealthCard';
import { EventTimeline } from '@/components/titan/EventTimeline';
import { formatCurrency, formatPercent } from '@/types';
import { RiskDashboard } from '@/components/titan/RiskDashboard';
import { PowerLawMetrics } from '@/components/titan/PowerLawMetrics';
import { SystemStatusBanner } from '@/components/titan/SystemStatusBanner';
import { cn } from '@/lib/utils';
import { useTitanWebSocket } from '@/context/WebSocketContext';

export default function Overview() {
  const [data, setData] = useState<any>(null);
  const { lastMessage, status } = useTitanWebSocket();

  const handleWebSocketMessage = useCallback((msg: any) => {
    if (msg?.type === 'STATE_UPDATE' || msg?.type === 'CONNECTED') {
      const stateData = msg.state || msg;
      setData((prev: any) => ({ ...prev, ...stateData }));
    }
  }, []);

  useEffect(() => {
    if (lastMessage) {
      handleWebSocketMessage(lastMessage);
    }
  }, [lastMessage, handleWebSocketMessage]);

  // Mock data derived from "lastMessage" or static for now
  const portfolioKPIs = {
    equity: 124500.50,
    daily_pnl: 1250.00,
    daily_pnl_pct: 1.05,
    drawdown: -1.2,
    active_positions: 3,
    phase: 'Hunter',
    // ...
  };

  const criticalAlerts: any[] = [];
  const warningAlerts: any[] = [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <SystemStatusBanner />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">System Overview</h1>
          <p className="text-sm text-muted-foreground">
            Real-time health and performance monitoring
          </p>
        </div>
        <StatusPill status={status === 'CONNECTED' ? 'healthy' : 'critical'} />
      </div>
      
      {/* PowerLaw Metrics & KPI Grid */}
      <div className="grid gap-4 md:grid-cols-12">
         {/* PowerLaw Widget - Prominent */}
         <div className="md:col-span-4 lg:col-span-3">
            <PowerLawMetrics />
         </div>

         {/* KPIs */}
         <div className="md:col-span-8 lg:col-span-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            value={formatPercent(portfolioKPIs.drawdown || 0)} 
            subValue="Max: 5.0%"
            variant={portfolioKPIs.drawdown < -3 ? 'warning' : 'default'}
            />
            <KpiTile
            label="Phase"
            value={`Phase ${portfolioKPIs.phase || 1}`}
            />
         </div>
      </div>
      
      {/* Risk & Other Widgets */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiTile
          label="Positions"
          value={portfolioKPIs.active_positions || 0}
        />
        <div className="col-span-full xl:col-span-2">
            <RiskDashboard metrics={{
                marginUtilization: 45, // Mock initial state
                liquidationDistance: 12.5,
                dailyLoss: portfolioKPIs.daily_pnl || 0,
                maxDailyLoss: 1000,
                exposureRaw: { btc: 65, eth: 25, others: 10 },
            }} />
        </div>
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
