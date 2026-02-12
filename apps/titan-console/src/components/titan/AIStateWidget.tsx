import { Brain, Zap, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/types';

interface AIStateWidgetProps {
  aiState?: {
    cortisol: number;
    regime: string;
    lastOptimizationProposal?: {
      timestamp: number;
      proposal: Record<string, unknown>;
    };
  };
  className?: string;
}

export function AIStateWidget({ aiState, className }: AIStateWidgetProps) {
  if (!aiState) return null;

  const cortisolPct = aiState.cortisol * 100;
  const isStress = aiState.cortisol > 0.7;
  const regime = aiState.regime || 'UNKNOWN';

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Active Inference</h3>
        </div>
        <div
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-mono border',
            regime === 'ACTIVE_INFERENCE'
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {regime}
        </div>
      </div>

      {/* Cortisol Gauge */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Cortisol (Surprise)</span>
          <span className={cn('font-mono', isStress ? 'text-destructive' : 'text-foreground')}>
            {cortisolPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isStress ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${cortisolPct}%` }}
          />
        </div>
      </div>

      {/* Last Proposal */}
      {aiState.lastOptimizationProposal && (
        <div className="pt-2 border-t border-border">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground">Optimization Proposed</p>
              <p className="text-xxs text-muted-foreground">
                {formatTimeAgo(aiState.lastOptimizationProposal.timestamp)}
              </p>
              <div className="mt-1 text-xs font-mono text-muted-foreground bg-muted/50 p-1.5 rounded">
                Target: {String(aiState.lastOptimizationProposal.proposal.target || 'Unknown')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
