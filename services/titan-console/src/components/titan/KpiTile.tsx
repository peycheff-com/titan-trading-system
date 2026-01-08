import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiTileProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  variant?: 'default' | 'positive' | 'negative' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function KpiTile({
  label,
  value,
  subValue,
  trend,
  trendValue,
  variant = 'default',
  size = 'md',
  className,
}: KpiTileProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card p-3 transition-titan',
        'hover:border-primary/30 hover:bg-card/80',
        size === 'sm' && 'p-2',
        size === 'lg' && 'p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {trend && (
          <div
            className={cn(
              'flex items-center gap-0.5 text-xxs font-medium',
              trend === 'up' && 'text-pnl-positive',
              trend === 'down' && 'text-pnl-negative',
              trend === 'neutral' && 'text-muted-foreground'
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {trendValue && <span>{trendValue}</span>}
          </div>
        )}
      </div>
      <div
        className={cn(
          'mt-1 font-mono font-semibold tracking-tight',
          size === 'sm' && 'text-lg',
          size === 'md' && 'text-xl',
          size === 'lg' && 'text-2xl',
          variant === 'positive' && 'text-pnl-positive',
          variant === 'negative' && 'text-pnl-negative',
          variant === 'warning' && 'text-warning',
          variant === 'default' && 'text-foreground'
        )}
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-0.5 text-xxs text-muted-foreground">{subValue}</div>
      )}
    </div>
  );
}
