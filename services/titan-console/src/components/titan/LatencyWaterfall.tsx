import { cn } from '@/lib/utils';

interface LatencyStep {
  name: string;
  duration: number;
  color?: string;
}

interface LatencyWaterfallProps {
  steps: LatencyStep[];
  className?: string;
  budget?: number;
}

const defaultColors = [
  'bg-primary',
  'bg-phase-hunter',
  'bg-phase-scavenger',
  'bg-phase-sentinel',
  'bg-status-healthy',
];

export function LatencyWaterfall({ steps, className, budget }: LatencyWaterfallProps) {
  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
   
  let accumulated = 0;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Waterfall bars */}
      <div className="relative h-8 rounded-md bg-muted/30">
        {steps.map((step, index) => {
          const left = (accumulated / totalDuration) * 100;
          const width = (step.duration / totalDuration) * 100;
          accumulated += step.duration;

          return (
            <div
              key={step.name}
              className={cn(
                'absolute top-1 h-6 rounded-sm transition-all',
                step.color || defaultColors[index % defaultColors.length],
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 2)}%`,
              }}
              title={`${step.name}: ${step.duration}ms`}
            />
          );
        })}
        {budget && (
             <div 
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 opacity-70 border-l border-dashed border-red-200"
                style={{ left: `${Math.min((budget / totalDuration) * 100, 100)}%` }}
                title={`SLO Budget: ${budget}ms`}
             />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {steps.map((step, index) => (
          <div key={step.name} className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 rounded-sm',
                step.color || defaultColors[index % defaultColors.length],
              )}
            />
            <span className="text-xxs text-muted-foreground">{step.name}</span>
            <span className="font-mono text-xxs text-foreground">{step.duration}ms</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-muted-foreground">Total Latency</span>
        <span className="font-mono text-sm font-medium text-foreground">{totalDuration}ms</span>
      </div>
    </div>
  );
}
