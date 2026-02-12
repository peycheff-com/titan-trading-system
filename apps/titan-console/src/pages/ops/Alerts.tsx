import { useState } from 'react';
import { formatTimeAgo } from '@/types';
import { cn } from '@/lib/utils';
import { Bell, Check, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

import { LucideIcon } from 'lucide-react';

interface SeverityConfigItem {
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
}

const severityConfig: Record<string, SeverityConfigItem> = {
  info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/20',
  },
  critical: {
    icon: AlertCircle,
    color: 'text-status-critical',
    bg: 'bg-status-critical/10',
    border: 'border-status-critical/20',
  },
};

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
  acknowledged: boolean;
}

export default function AlertsPage() {
  const [alertList, setAlertList] = useState<Alert[]>([]); // Initialize with empty array instead of mock data

  const unacknowledged = alertList.filter((a) => !a.acknowledged);
  const acknowledged = alertList.filter((a) => a.acknowledged);

  const handleAcknowledge = (id: string) => {
    setAlertList((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
    toast.success('Alert acknowledged (local only)');
  };

  const handleAcknowledgeAll = () => {
    setAlertList((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    toast.success('All alerts acknowledged (local only)');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
            <Bell className="h-6 w-6 text-warning" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Alerts & Incidents</h1>
            <p className="text-sm text-muted-foreground">
              System alerts, warnings, and incident management
            </p>
          </div>
        </div>
        {unacknowledged.length > 0 && (
          <button
            onClick={handleAcknowledgeAll}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Check className="h-4 w-4" />
            Acknowledge All
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Unacknowledged
          </span>
          <div className="mt-1 text-xl font-semibold text-warning">{unacknowledged.length}</div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Critical
          </span>
          <div className="mt-1 text-xl font-semibold text-status-critical">
            {alertList.filter((a) => a.severity === 'critical').length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Today
          </span>
          <div className="mt-1 text-xl font-semibold text-foreground">{alertList.length}</div>
        </div>
      </div>

      {/* Unacknowledged Alerts */}
      {unacknowledged.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Requires Attention</h2>
          <div className="space-y-2">
            {unacknowledged.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-4',
                    config.border,
                    config.bg,
                  )}
                >
                  <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">{alert.title}</h3>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-xxs font-medium uppercase',
                          config.bg,
                          config.color,
                        )}
                      >
                        {alert.severity}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                    <span className="mt-1 block text-xxs text-muted-foreground">
                      {formatTimeAgo(alert.timestamp)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="flex-shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Acknowledge
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Acknowledged Alerts */}
      {acknowledged.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Acknowledged</h2>
          <div className="space-y-2">
            {acknowledged.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;

              return (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-4 opacity-60"
                >
                  <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-muted-foreground">{alert.title}</h3>
                      <Check className="h-3.5 w-3.5 text-status-healthy" />
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                    <span className="mt-1 block text-xxs text-muted-foreground">
                      {formatTimeAgo(alert.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {alertList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium text-foreground">No alerts</h3>
          <p className="mt-1 text-xs text-muted-foreground">System is operating normally</p>
        </div>
      )}
    </div>
  );
}
