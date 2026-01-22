import { cn } from '@/lib/utils';
import { formatTimestamp } from '@/types';
import type { TimelineEvent, Severity, Phase } from '@/types';
import { Activity, AlertTriangle, AlertCircle, Settings, TrendingUp } from 'lucide-react';

interface EventTimelineProps {
  events: TimelineEvent[];
  maxItems?: number;
  showFilters?: boolean;
  className?: string;
}

const eventTypeConfig = {
  trade: { icon: TrendingUp, color: 'text-primary' },
  alert: { icon: AlertTriangle, color: 'text-warning' },
  system: { icon: Settings, color: 'text-muted-foreground' },
  risk: { icon: AlertCircle, color: 'text-status-critical' },
};

const severityConfig = {
  info: 'border-l-muted-foreground',
  warning: 'border-l-warning',
  critical: 'border-l-status-critical',
};

const phaseConfig = {
  scavenger: { bg: 'bg-phase-scavenger/10', text: 'text-phase-scavenger' },
  hunter: { bg: 'bg-phase-hunter/10', text: 'text-phase-hunter' },
  sentinel: { bg: 'bg-phase-sentinel/10', text: 'text-phase-sentinel' },
};

export function EventTimeline({ events, maxItems = 10, className }: EventTimelineProps) {
  const displayEvents = events.slice(0, maxItems);

  return (
    <div className={cn('space-y-1', className)}>
      {displayEvents.map((event) => {
        const typeConfig = eventTypeConfig[event.type];
        const Icon = typeConfig.icon;

        return (
          <div
            key={event.id}
            className={cn(
              'flex items-start gap-2 rounded-sm border-l-2 bg-card/50 px-2 py-1.5',
              'transition-titan hover:bg-card',
              severityConfig[event.severity],
            )}
          >
            <Icon className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', typeConfig.color)} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground">{event.message}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-xxs text-muted-foreground">
                  {formatTimestamp(event.timestamp)}
                </span>
                {event.symbol && (
                  <span className="rounded bg-muted px-1 py-0.5 text-xxs font-medium text-muted-foreground">
                    {event.symbol}
                  </span>
                )}
                {event.phase && (
                  <span
                    className={cn(
                      'rounded px-1 py-0.5 text-xxs font-medium capitalize',
                      phaseConfig[event.phase].bg,
                      phaseConfig[event.phase].text,
                    )}
                  >
                    {event.phase}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
