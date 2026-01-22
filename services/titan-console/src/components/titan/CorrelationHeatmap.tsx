import { cn } from '@/lib/utils';

interface CorrelationHeatmapProps {
  assets: string[];
  data: number[][];
  className?: string;
}

function getCorrelationColor(value: number): string {
  if (value >= 0.8) return 'bg-status-critical/80';
  if (value >= 0.6) return 'bg-warning/70';
  if (value >= 0.4) return 'bg-warning/40';
  if (value >= 0.2) return 'bg-primary/30';
  if (value >= 0) return 'bg-primary/20';
  if (value >= -0.2) return 'bg-status-healthy/20';
  if (value >= -0.4) return 'bg-status-healthy/40';
  return 'bg-status-healthy/60';
}

export function CorrelationHeatmap({ assets, data, className }: CorrelationHeatmapProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="inline-block">
        {/* Header row */}
        <div className="flex">
          <div className="h-8 w-14" /> {/* Empty corner */}
          {assets.map((asset) => (
            <div
              key={asset}
              className="flex h-8 w-14 items-center justify-center text-xxs font-medium text-muted-foreground"
            >
              {asset}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {data.map((row, i) => (
          <div key={assets[i]} className="flex">
            <div className="flex h-10 w-14 items-center justify-start text-xxs font-medium text-muted-foreground">
              {assets[i]}
            </div>
            {row.map((value, j) => (
              <div
                key={`${i}-${j}`}
                className={cn(
                  'flex h-10 w-14 items-center justify-center rounded-sm border border-background/50 font-mono text-xxs transition-all hover:scale-105',
                  getCorrelationColor(value),
                  i === j && 'opacity-50',
                )}
                title={`${assets[i]} / ${assets[j]}: ${value.toFixed(2)}`}
              >
                {value.toFixed(2)}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-1">
        <span className="text-xxs text-muted-foreground">-1.0</span>
        <div className="flex h-2 w-32 overflow-hidden rounded-full">
          <div className="h-full w-1/4 bg-status-healthy/60" />
          <div className="h-full w-1/4 bg-primary/30" />
          <div className="h-full w-1/4 bg-warning/50" />
          <div className="h-full w-1/4 bg-status-critical/80" />
        </div>
        <span className="text-xxs text-muted-foreground">+1.0</span>
      </div>
    </div>
  );
}
