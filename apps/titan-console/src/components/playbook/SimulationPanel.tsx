import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Play, RotateCcw, Clock, CheckCircle2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimulationResult {
  passed: boolean;
  score: number;
  steps: {
    id: string;
    action: string;
    result: 'success' | 'failure' | 'skipped';
    output?: string;
    timestamp: string;
  }[];
  stateDiff?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
}

interface SimulationPanelProps {
  onRun: (time: string) => Promise<SimulationResult>;
  isSimulating: boolean;
  result?: SimulationResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SimulationPanel({ onRun, isSimulating, result }: SimulationPanelProps) {
  const [selectedTime, setSelectedTime] = useState<string>('now-1h');

  const handleRun = () => {
    onRun(selectedTime).catch(() => toast.error('Simulation failed'));
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Deterministic Simulation</h3>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="space-y-1.5">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- select is the associated control */}
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Time Travel (Historical State)
          </label>
          <select 
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="now-1h">Last Hour (Incident #402)</option>
            <option value="now-24h">Yesterday Close</option>
            <option value="now-7d">Last Week (High Volatility)</option>
            <option value="scenario-A">Scenario A: Flash Crash</option>
            <option value="scenario-B">Scenario B: API Outage</option>
          </select>
        </div>

        <button
          onClick={handleRun}
          disabled={isSimulating}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors",
            isSimulating 
              ? "bg-muted text-muted-foreground cursor-not-allowed" 
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          )}
        >
          {isSimulating ? (
            <>Running Simulation...</>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              Run Verification
            </>
          )}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-titan">
        {!result && !isSimulating && (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-4">
            <div className="rounded-full bg-muted p-3 mb-2">
               <Play className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium">Ready to Simulate</p>
            <p className="text-xs max-w-[200px] mt-1 text-muted-foreground/70">
              Select a historical timeframe to verify this playbook against past data.
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Status Banner */}
            <div className={cn(
              "rounded-md p-3 flex items-start gap-3 border",
              result.passed 
                ? "bg-status-healthy/10 border-status-healthy/20" 
                : "bg-status-critical/10 border-status-critical/20"
            )}>
              {result.passed ? (
                <CheckCircle2 className="h-5 w-5 text-status-healthy flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-status-critical flex-shrink-0 mt-0.5" />
              )}
              <div>
                <h4 className={cn("text-sm font-semibold", result.passed ? "text-status-healthy" : "text-status-critical")}>
                  {result.passed ? "Verification Passed" : "Verification Failed"}
                </h4>
                <p className="text-xs text-foreground/80 mt-1">
                  Score: {result.score}/100. 
                  {result.passed 
                    ? " Logic held safe across all test steps." 
                    : " Critical failure detected in simulation steps."}
                </p>
              </div>
            </div>

            {/* Steps Log */}
            <div className="space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Log</h5>
               {result.steps.map((step) => (
                 <div key={step.id} className="flex items-start gap-2 text-xs py-1 border-b border-border/40 last:border-0 hover:bg-muted/20 px-1 rounded">
                   <div className={cn(
                     "mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0",
                     step.result === 'success' ? "bg-status-healthy" : step.result === 'failure' ? "bg-status-critical" : "bg-muted-foreground"
                   )} />
                   <div className="flex-1 min-w-0">
                     <div className="flex justify-between">
                       <span className="font-mono font-medium">{step.action}</span>
                       <span className="text-muted-foreground text-xxs font-mono">{step.timestamp}</span>
                     </div>
                     {step.output && (
                       <p className="text-muted-foreground/80 mt-0.5 font-mono text-[10px] truncate">{step.output}</p>
                     )}
                   </div>
                 </div>
               ))}
            </div>
            
            {/* State Diff (Simplified for v2) */}
            {result.stateDiff && (
               <div className="rounded-md bg-muted/30 border border-border/50 p-2">
                 <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">State Impact</h5>
                 <div className="grid grid-cols-2 gap-4 text-xs">
                   <div>
                     <span className="block text-xxs text-muted-foreground mb-1">Before</span>
                     <pre className="font-mono text-[10px] text-foreground/70">{JSON.stringify(result.stateDiff.before, null, 2)}</pre>
                   </div>
                   <div>
                      <span className="block text-xxs text-muted-foreground mb-1">After</span>
                      <pre className="font-mono text-[10px] text-foreground/70">{JSON.stringify(result.stateDiff.after, null, 2)}</pre>
                   </div>
                 </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
