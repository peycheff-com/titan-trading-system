import { useState } from 'react';
import { ServiceHealthCard } from '@/components/titan/ServiceHealthCard';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatTimeAgo } from '@/types';
import { cn } from '@/lib/utils';
import { Server, Database, RefreshCw, AlertTriangle, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';

const standbyConfig: any = {
  ready: { color: 'text-status-healthy', bg: 'bg-status-healthy/10', label: 'Ready' },
  syncing: { color: 'text-warning', bg: 'bg-warning/10', label: 'Syncing' },
  stale: { color: 'text-status-critical', bg: 'bg-status-critical/10', label: 'Stale' },
};

const defaultInfraStatus = {
  services: [],
  backups: [],
  standby: { status: 'ready', lastSync: Date.now(), syncLag: 0, enabled: true },
};

export default function InfraPage() {
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showFailoverModal, setShowFailoverModal] = useState(false);

  const { services, backups, standby } = defaultInfraStatus;
  const sbConfig = standbyConfig[standby.status];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Infra / DR / Standby</h1>
            <p className="text-sm text-muted-foreground">
              Infrastructure status, disaster recovery, and backup management
            </p>
          </div>
        </div>
      </div>

      {/* Service Health Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Service Health</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <ServiceHealthCard
              key={service.name}
              name={service.name}
              status={service.status}
              lastHeartbeat={service.lastRestart}
              uptime={service.uptime}
              errorRate={service.errorRate}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Backup Status */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Backup Status</h2>
          </div>

          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.type}
                className="flex items-center justify-between rounded-md border border-border bg-card p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{backup.type}</span>
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xxs font-medium',
                        backup.status === 'success'
                          ? 'bg-status-healthy/10 text-status-healthy'
                          : 'bg-status-critical/10 text-status-critical'
                      )}
                    >
                      {backup.status === 'success' ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {backup.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatTimeAgo(backup.lastBackup)}</span>
                    <span>•</span>
                    <span>{backup.size}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowRestoreModal(true)}
                  className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Standby Status */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Standby Status</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">Standby Instance</span>
                <span
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xxs font-medium',
                    sbConfig.bg,
                    sbConfig.color
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      standby.status === 'ready' && 'bg-status-healthy pulse-healthy',
                      standby.status === 'syncing' && 'bg-warning pulse-warning',
                      standby.status === 'stale' && 'bg-status-critical'
                    )}
                  />
                  {sbConfig.label}
                </span>
              </div>
              {standby.enabled && (
                <span className="rounded-full bg-status-healthy/10 px-2 py-0.5 text-xxs font-medium text-status-healthy">
                  Enabled
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Sync</span>
                <span className="font-mono text-foreground">{formatTimeAgo(standby.lastSync)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sync Lag</span>
                <span className="font-mono text-foreground">{standby.syncLag}ms</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              <button
                onClick={() => setShowFailoverModal(true)}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <AlertTriangle className="h-4 w-4" />
                Initiate Failover
              </button>
              <p className="mt-2 text-xxs text-muted-foreground text-center">
                Failover requires backend integration and operator confirmation
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* DR Checklist */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">DR Readiness Checklist</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'State Backup', status: true, lastCheck: Date.now() - 3600000 },
            { label: 'Config Sync', status: true, lastCheck: Date.now() - 1800000 },
            { label: 'Standby Health', status: true, lastCheck: Date.now() - 600000 },
            { label: 'Network Routes', status: true, lastCheck: Date.now() - 7200000 },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                {item.status ? (
                  <Check className="h-4 w-4 text-status-healthy" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-status-critical" />
                )}
                <span className="text-sm text-foreground">{item.label}</span>
              </div>
              <div className="flex items-center gap-1 text-xxs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatTimeAgo(item.lastCheck)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Restore Modal */}
      <ConfirmModal
        open={showRestoreModal}
        onOpenChange={setShowRestoreModal}
        title="Restore from Backup"
        description="This will initiate a restore process from the selected backup point. This action requires backend integration."
        confirmLabel="Initiate Restore"
        variant="destructive"
        onConfirm={() => {
          setShowRestoreModal(false);
          toast.info('Waiting for backend integration...');
        }}
      />

      {/* Failover Modal */}
      <ConfirmModal
        open={showFailoverModal}
        onOpenChange={setShowFailoverModal}
        title="Initiate Failover"
        description="This will trigger a failover to the standby instance. All active connections will be transferred. This is a critical operation."
        confirmLabel="Confirm Failover"
        variant="destructive"
        onConfirm={() => {
          setShowFailoverModal(false);
          toast.info('Waiting for backend integration...');
        }}
      />
    </div>
  );
}
