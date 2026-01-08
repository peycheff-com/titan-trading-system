import { cn } from '@/lib/utils';
import type { SystemStatus } from '@/types';

interface StatusPillProps {
  status: SystemStatus;
  label?: string;
  showDot?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const statusConfig = {
  healthy: {
    bg: 'bg-status-healthy/10',
    text: 'text-status-healthy',
    dot: 'bg-status-healthy',
    pulse: 'pulse-healthy',
    label: 'Healthy',
  },
  degraded: {
    bg: 'bg-status-degraded/10',
    text: 'text-status-degraded',
    dot: 'bg-status-degraded',
    pulse: 'pulse-warning',
    label: 'Degraded',
  },
  critical: {
    bg: 'bg-status-critical/10',
    text: 'text-status-critical',
    dot: 'bg-status-critical',
    pulse: 'pulse-critical',
    label: 'Critical',
  },
  offline: {
    bg: 'bg-status-offline/10',
    text: 'text-status-offline',
    dot: 'bg-status-offline',
    pulse: '',
    label: 'Offline',
  },
};

export function StatusPill({
  status,
  label,
  showDot = true,
  size = 'sm',
  className,
}: StatusPillProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        config.bg,
        config.text,
        size === 'xs' && 'px-1.5 py-0.5 text-xxs',
        size === 'sm' && 'px-2 py-0.5 text-xs',
        size === 'md' && 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'rounded-full',
            config.dot,
            config.pulse,
            size === 'xs' && 'h-1 w-1',
            size === 'sm' && 'h-1.5 w-1.5',
            size === 'md' && 'h-2 w-2'
          )}
        />
      )}
      {label || config.label}
    </span>
  );
}

// Simple dot indicator for compact spaces
interface StatusDotProps {
  status: SystemStatus;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function StatusDot({ status, size = 'sm', className }: StatusDotProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-block rounded-full',
        config.dot,
        config.pulse,
        size === 'xs' && 'h-1.5 w-1.5',
        size === 'sm' && 'h-2 w-2',
        size === 'md' && 'h-2.5 w-2.5',
        className
      )}
      title={config.label}
    />
  );
}
