import { cn } from '@/lib/utils';
import { StatusDot } from './StatusPill';
import type { SystemStatus } from '@/types';
import { formatTimeAgo } from '@/types';
import { Activity } from 'lucide-react';

interface ServiceHealthCardProps {
  name: string;
  status: SystemStatus;
  lastHeartbeat: number;
  eventRate?: number;
  uptime?: number;
  errorRate?: number;
  compact?: boolean;
  className?: string;
}

export function ServiceHealthCard({
  name,
  status,
  lastHeartbeat,
  eventRate,
  uptime,
  errorRate,
  compact = false,
  className,
}: ServiceHealthCardProps) {
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5',
          'transition-titan hover:border-primary/30',
          className,
        )}
      >
        <StatusDot status={status} size="sm" />
        <span className="text-xs font-medium text-foreground">{name}</span>
        {eventRate !== undefined && (
          <span className="ml-auto flex items-center gap-1 text-xxs text-muted-foreground">
            <Activity className="h-3 w-3" />
            {eventRate}/s
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-card p-3',
        'transition-titan hover:border-primary/30',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={status} size="md" />
          <span className="text-sm font-medium text-foreground">{name}</span>
        </div>
        {uptime !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">{uptime.toFixed(2)}%</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Heartbeat</span>
          <span className="font-mono text-foreground">{formatTimeAgo(lastHeartbeat)}</span>
        </div>
        {eventRate !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Events</span>
            <span className="font-mono text-foreground">{eventRate}/s</span>
          </div>
        )}
        {errorRate !== undefined && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Error Rate</span>
            <span
              className={cn(
                'font-mono',
                errorRate > 1 ? 'text-status-critical' : 'text-foreground',
              )}
            >
              {errorRate.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
