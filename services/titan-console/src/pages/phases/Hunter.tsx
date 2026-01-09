import { useState, useEffect } from 'react';
import { KpiTile } from '@/components/titan/KpiTile';
import { StatusPill } from '@/components/titan/StatusPill';
import { DenseTable } from '@/components/titan/DenseTable';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatCurrency } from '@/types';
import { cn } from '@/lib/utils';
import { Target, AlertTriangle, Edit3, TrendingUp, TrendingDown, Brain, Zap, ShieldAlert, Cpu, Settings } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"


interface ContextType {
  safetyLocked: boolean;
}

const mockDraftConfig = {
  before: { poiThreshold: 0.5, minLiquidity: 1000000, timeframes: ['1H', '4H'] },
  after: { poiThreshold: 0.45, minLiquidity: 1200000, timeframes: ['1H', '4H', '1D'] },
};

interface HunterConfig {
    oracleSentimentThreshold: number;
    globalCVDConsensus: number;
    botTrapSuspicion: number;
    maxConvictionMultiplier: number;
}

export default function HunterPhase() {
  const { safetyLocked } = useOutletContext<ContextType>();
  const [hasDraft, setHasDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('all');
  const [enhancedMode, setEnhancedMode] = useState(false);
  const [holograms, setHolograms] = useState<any[]>([]);

  // Configuration State
  const [config, setConfig] = useState<HunterConfig>({
      oracleSentimentThreshold: 0.5,
      globalCVDConsensus: 0.6,
      botTrapSuspicion: 0.7,
      maxConvictionMultiplier: 2.0
  });

  // Fetch Enhanced Holograms
  useEffect(() => {
    const fetchHolograms = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/console/hunter/holograms`);
        if (response.ok) {
          const data = await response.json();
          setHolograms(data.data.holograms || []);
        }
      } catch (error) {
        console.error('Failed to fetch holograms:', error);
      }
    };

    fetchHolograms();
    const interval = setInterval(fetchHolograms, 5000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut for Enhanced Mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setEnhancedMode(prev => {
          const newState = !prev;
          toast.info(newState ? 'Enhanced HUD Activated' : 'Enhanced HUD Deactivated');
          return newState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  const status = { status: 'offline' as const, enabled: false, allocationWeight: 0, activeStrategies: 0 };
  
  const handleCreateDraft = () => {
    if (safetyLocked) {
      toast.error('Safety lock is enabled. Unlock to make changes.');
      return;
    }
    setHasDraft(true);
    toast.success('Draft created. Changes are local only.');
  };

  const handleApplyConfig = () => {
      setHasDraft(true);
      toast.success("Configuration updated and staged for draft.");
  }

  const columns = enhancedMode ? [
    { key: 'symbol', header: 'Symbol' },
    {
        key: 'alignment',
        header: 'Align',
        render: (item: any) => (
            <span className={cn(
                'font-mono font-bold',
                item.alignment.startsWith('A') && 'text-status-healthy',
                item.alignment === 'B' && 'text-warning',
                (item.alignment === 'C' || item.alignment === 'VETO') && 'text-status-critical'
            )}>{item.alignment}</span>
        )
    },
    {
        key: 'score',
        header: 'Score',
        render: (item: any) => (
            <div className="flex flex-col">
                <span className="font-mono text-xs">{item.score.toFixed(2)}</span>
                <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                        className={cn("h-full", item.score > 0.8 ? "bg-status-healthy" : item.score > 0.5 ? "bg-warning" : "bg-muted-foreground")} 
                        style={{ width: `${item.score * 100}%` }}
                    />
                </div>
            </div>
        )
    },
    {
        key: 'oracle',
        header: 'Oracle',
        render: (item: any) => (
            <div className="flex items-center gap-2">
                <Brain className={cn("h-3 w-3", item.oracleScore.sentiment > config.oracleSentimentThreshold ? "text-status-healthy" : item.oracleScore.sentiment < -config.oracleSentimentThreshold ? "text-status-critical" : "text-muted-foreground")} />
                <span className="text-xxs font-mono">{item.oracleScore.confidence.toFixed(2)}</span>
            </div>
        )
    },
    {
        key: 'flow',
        header: 'Global CVD',
        render: (item: any) => (
            <div className="flex items-center gap-2">
                 <TrendingUp className={cn("h-3 w-3", 
                    item.globalCVD.consensus === 'BULLISH' ? "text-status-healthy" : 
                    item.globalCVD.consensus === 'BEARISH' ? "text-status-critical" : "text-muted-foreground"
                 )} />
                 {item.globalCVD.manipulation.detected && (
                     <ShieldAlert className="h-3 w-3 text-status-critical animate-pulse" />
                 )}
            </div>
        )
    },
    {
        key: 'conviction',
        header: 'Mult',
        align: 'right',
        render: (item: any) => (
            <span className={cn("font-mono text-xs", item.oracleScore.convictionMultiplier > 1.2 && "text-status-healthy font-bold")}>
                x{Math.min(item.oracleScore.convictionMultiplier, config.maxConvictionMultiplier).toFixed(1)}
            </span>
        )
    }
  ] : [
    { key: 'symbol', header: 'Symbol' },
    {
      key: 'status',
      header: 'Status',
      render: (item: any) => (
        <StatusPill status={item.status === 'A+' ? 'active' : item.status === 'B' ? 'warning' : 'offline'} size="sm" />
      ),
    },
     {
      key: 'score',
      header: 'Score',
      align: 'right',
      render: (item: any) => item.score.toFixed(2),
    },
    { key: 'timestamp', header: 'Updated', align: 'right', render: (item: any) => new Date(item.timestamp).toLocaleTimeString() },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-phase-hunter/10">
            <Target className="h-6 w-6 text-phase-hunter" />
          </div>
          <div>
            <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground">Hunter Phase</h1>
                 {enhancedMode && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xxs font-mono border border-primary/30 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> ENHANCED HUD
                    </span>
                 )}
            </div>
            <p className="text-sm text-muted-foreground">
              {enhancedMode ? "Real-time Holographic Market Structure & Flow Analysis" : "Structure-based strategies using POIs and order flow"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="outline" size="icon" disabled={safetyLocked}>
                        <Settings className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                    <DialogTitle>Enhanced HUD Configuration</DialogTitle>
                    <DialogDescription>
                        Tune the sensitivity of 2026 Enhanced Signals.
                    </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="oracle-sentiment">Oracle Sentiment Threshold ({config.oracleSentimentThreshold.toFixed(2)})</Label>
                            <Slider 
                                id="oracle-sentiment" 
                                min={0.1} max={0.9} step={0.05} 
                                value={[config.oracleSentimentThreshold]} 
                                onValueChange={(vals) => setConfig(prev => ({ ...prev, oracleSentimentThreshold: vals[0] }))}
                            />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="cvd-consensus">Global CVD Consensus ({config.globalCVDConsensus.toFixed(2)})</Label>
                            <Slider 
                                id="cvd-consensus" 
                                min={0.5} max={1.0} step={0.05} 
                                value={[config.globalCVDConsensus]} 
                                onValueChange={(vals) => setConfig(prev => ({ ...prev, globalCVDConsensus: vals[0] }))}
                            />
                        </div>
                         <div className="grid gap-2">
                            <Label htmlFor="trap-suspicion">Bot Trap Suspicion ({config.botTrapSuspicion.toFixed(2)})</Label>
                            <Slider 
                                id="trap-suspicion" 
                                min={0.3} max={0.9} step={0.05} 
                                value={[config.botTrapSuspicion]} 
                                onValueChange={(vals) => setConfig(prev => ({ ...prev, botTrapSuspicion: vals[0] }))}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="max-multiplier">Max Conviction Multiplier (x)</Label>
                            <Input
                                id="max-multiplier"
                                type="number"
                                value={config.maxConvictionMultiplier}
                                onChange={(e) => setConfig(prev => ({ ...prev, maxConvictionMultiplier: parseFloat(e.target.value) }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={handleApplyConfig}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <StatusPill status={status.status} size="md" />
        </div>
      </div>

      {/* Phase Intent Card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Phase Intent</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hunter identifies high-probability Points of Interest (POIs) using market structure analysis.
          It executes directional trades at key levels with defined risk parameters, targeting
          liquidity pools and fair value gaps.
        </p>
        <div className="mt-4 flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Press <kbd className="bg-muted px-1 rounded">F3</kbd> to toggle Enhanced HUD</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {enhancedMode ? (
             <>
                <KpiTile label="Oracle Sentiment" value="Bullish" icon={Brain} trend="up" />
                <KpiTile label="Global CVD" value="$12.5M" icon={TrendingUp} trend="up" />
                <KpiTile label="Bot Traps" value="2 Detected" icon={ShieldAlert} trend="neutral" />
                <KpiTile label="System Load" value="12%" icon={Cpu} />
             </>
        ) : (
            <>
                <KpiTile label="Active POIs" value={holograms.length} />
                <KpiTile label="Avg Distance" value="2.6%" />
                <KpiTile label="Hits Today" value={5} trend="up" />
                <KpiTile label="Win Rate" value="58.2%" trend="neutral" />
            </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Hologram List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">{enhancedMode ? "Enhanced Holograms" : "Points of Interest"}</h2>
            <div className="flex items-center gap-2">
              <span className="text-xxs text-muted-foreground">Timeframe:</span>
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
              >
                <option value="all">All</option>
                <option value="1H">1H</option>
                <option value="4H">4H</option>
                <option value="1D">1D</option>
              </select>
            </div>
          </div>

          <DenseTable
            columns={columns}
            data={holograms}
            keyExtractor={(item) => item.symbol}
            maxHeight="320px"
          />
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Controls</h2>
            {safetyLocked && (
              <span className="flex items-center gap-1 text-xxs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            {!hasDraft ? (
              <button
                onClick={handleCreateDraft}
                disabled={safetyLocked}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors',
                  safetyLocked
                    ? 'cursor-not-allowed opacity-50'
                    : 'hover:bg-muted'
                )}
              >
                <Edit3 className="h-4 w-4" />
                Create Draft
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="text-xs font-medium text-primary">Draft Active</span>
                </div>

                <DiffViewer
                  before={mockDraftConfig.before}
                  after={mockDraftConfig.after}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setHasDraft(false)}
                    className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Discard
                  </button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Apply Draft
                  </button>
                </div>
              </>
            )}

            <p className="text-xxs text-muted-foreground">
              Changes are saved as local drafts only. Apply requires backend integration.
            </p>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Apply Hunter Configuration"
        description="This will apply the draft configuration to the Hunter phase."
        confirmLabel="Apply"
        onConfirm={() => {
          setShowConfirm(false);
          toast.info('Waiting for backend integration...');
        }}
      />
    </div>
  );
}
