import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Server, Activity, Database, RefreshCw, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getTitanBrainUrl } from '@/lib/api-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InfraStatus {
  services: {
    name: string;
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    lastRestart: number;
    errorRate: number;
  }[];
  backups: {
    type: string;
    status: string;
    lastBackup: number;
    size: string;
  }[];
  standby: {
    status: 'ready' | 'syncing' | 'stale';
    lastSync: number;
    syncLag: number;
    enabled: boolean;
  };
}

export const InfrastructureSettings = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<InfraStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [failoverTarget, setFailoverTarget] = useState('standby-1');
  const [selectedBackup, setSelectedBackup] = useState<string>('');

  const BRAIN_URL = getTitanBrainUrl();
  // TODO: Get token from auth context
  const getToken = () => localStorage.getItem('titan_jwt') || '';

  const fetchStatus = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BRAIN_URL}/api/admin/infra-status`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error('Failed to fetch infra status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Status Check Failed',
        description: 'Could not connect to Titan Brain.',
      });
    } finally {
      setLoading(false);
    }
  }, [BRAIN_URL, toast]);

  useEffect(() => {
    fetchStatus();
    // Poll every 30s
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleFailover = async () => {
    if (
      !confirm(
        'Are you sure you want to trigger a system FAILOVER? This will switch active traffic to the standby instance.',
      )
    )
      return;

    try {
      setLoading(true);
      const response = await fetch(`${BRAIN_URL}/api/admin/failover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ target: failoverTarget }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: 'Failover Initiated',
        description: result.message,
        variant: 'default', // or a custom "warning" style if available
      });
    } catch (error) {
      const err = error as Error;
      toast({
        variant: 'destructive',
        title: 'Failover Failed',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackup) {
      toast({
        variant: 'destructive',
        title: 'Selection Required',
        description: 'Please select a backup to restore.',
      });
      return;
    }
    if (
      !confirm(
        `Are you sure you want to RESTORE from ${selectedBackup}? Current state will be overwritten.`,
      )
    )
      return;

    try {
      setLoading(true);
      const response = await fetch(`${BRAIN_URL}/api/admin/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ backupId: selectedBackup }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast({
        title: 'Restore Initiated',
        description: result.message,
      });
    } catch (error) {
      const err = error as Error;
      toast({
        variant: 'destructive',
        title: 'Restore Failed',
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!status && loading)
    return (
      <div className="p-8 text-center text-muted-foreground">Loading Infrastructure Status...</div>
    );

  return (
    <div className="space-y-6">
      {/* Service Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" /> Service Health
          </CardTitle>
          <CardDescription>Real-time status of Titan Core services.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {status?.services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <p className="font-medium">{svc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Uptime: {(svc.uptime / 3600).toFixed(1)}h
                  </p>
                </div>
                <Badge variant={svc.status === 'healthy' ? 'default' : 'destructive'}>
                  {svc.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Emergency Controls (Failover & Restore) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Failover Control */}
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" /> Disaster Recovery
            </CardTitle>
            <CardDescription>Trigger failover to standby infrastructure.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="standby-target" className="text-sm font-medium">Standby Target</label>
              <Select value={failoverTarget} onValueChange={setFailoverTarget}>
                <SelectTrigger id="standby-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standby-1">Standby Region 1 (EU-West)</SelectItem>
                  <SelectItem value="standby-2">Standby Region 2 (US-East)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status?.standby && (
              <div className="text-xs text-muted-foreground">
                Status:{' '}
                <span
                  className={
                    status.standby.status === 'ready'
                      ? 'text-green-600 font-bold'
                      : 'text-yellow-600'
                  }
                >
                  {status.standby.status.toUpperCase()}
                </span>
                | Lag: {status.standby.syncLag}ms
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleFailover}
              disabled={loading || status?.standby.status !== 'ready'}
            >
              <ShieldAlert className="mr-2 h-4 w-4" /> Trigger System Failover
            </Button>
          </CardFooter>
        </Card>

        {/* Restore Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" /> State Recovery
            </CardTitle>
            <CardDescription>Restore system state from backups.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="backup-select" className="text-sm font-medium">Available Backups</label>
              <Select value={selectedBackup} onValueChange={setSelectedBackup}>
                <SelectTrigger id="backup-select">
                  <SelectValue placeholder="Select a backup point" />
                </SelectTrigger>
                <SelectContent>
                  {/* Mocking backup list derived from status, referencing 'lastBackup' timestamp */}
                  {status?.backups.map((bak, i) => (
                    <SelectItem key={i} value={`backup_${bak.lastBackup}`}>
                      {bak.type} - {new Date(bak.lastBackup).toLocaleString()} ({bak.size})
                    </SelectItem>
                  ))}
                  <SelectItem value="manual_upload">Upload Snapshot...</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleRestore}
              disabled={loading || !selectedBackup}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Restore State
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
