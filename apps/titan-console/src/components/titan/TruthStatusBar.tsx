import { useEffect, useState } from 'react';
import { useTitanStream } from '@/hooks/useTitanStream';
import { Activity, ShieldCheck, ShieldAlert, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TruthStatusBar() {
  const { lastMessage, isConnected } = useTitanStream('titan.>');
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());
  const [drift, setDrift] = useState<{ pct: number; status: 'safe' | 'warning' | 'critical' }>({
    pct: 0,
    status: 'safe',
  });

  // Force re-render to update "isAlive" visual if needed
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.subject === 'titan.sys.heartbeat') {
      setLastHeartbeat(Date.now());
    } else if (lastMessage.subject === 'titan.evt.alert.drift' || lastMessage.subject === 'titan.alert.drift') {
       // Support both old and new subject styles just in case
       const d = lastMessage.data as any;
       const pct = typeof d === 'number' ? d : (d.driftPct || 0);
       const status = pct > 0.05 ? 'critical' : pct > 0.01 ? 'warning' : 'safe';
       setDrift({ pct, status });
    }
  }, [lastMessage]);

  // Derived state
  const timeSinceHeartbeat = Date.now() - lastHeartbeat;
  const isAlive = timeSinceHeartbeat < 10000; // 10s timeout grace
  const isHealthy = isAlive && isConnected;

  return (
    <div className="flex items-center h-8 gap-3 px-3 mx-2 bg-background/50 border border-border/40 rounded-full shadow-sm backdrop-blur-sm">
        {/* Connection Status */}
        <div className="flex items-center gap-1.5" title={isConnected ? 'NATS Connected' : 'NATS Disconnected'}>
           <div className={cn("w-1.5 h-1.5 rounded-full transition-colors duration-500", isConnected ? "bg-status-healthy" : "bg-status-critical")} />
           <span className="text-[10px] font-mono font-bold text-muted-foreground tracking-wider">{isConnected ? 'LINK' : 'LINK'}</span>
        </div>

        <div className="h-3 w-px bg-border/50" />

        {/* Heartbeat */}
        <div className="flex items-center gap-1.5" title="System Heartbeat">
            <Activity className={cn("w-3.5 h-3.5 transition-colors duration-300", 
                isHealthy ? "text-status-healthy" : "text-status-critical",
                isHealthy && "animate-pulse"
            )} />
            <span className={cn("text-[10px] font-mono font-bold tracking-wider", 
                isHealthy ? "text-emerald-500/80" : "text-red-500/80"
            )}>
                {isAlive ? 'SYS.OK' : 'SYS.LAG'}
            </span>
        </div>

        <div className="h-3 w-px bg-border/50" />

        {/* Truth/Drift */}
        <div className="flex items-center gap-1.5" title="Truth Interpretation Drift">
            {drift.status === 'safe' ? 
                <ShieldCheck className="w-3.5 h-3.5 text-status-healthy" /> : 
                <ShieldAlert className={cn("w-3.5 h-3.5", drift.status === 'critical' ? "text-status-critical animate-bounce-subtle" : "text-status-warning")} />
            }
            <span className={cn("text-[10px] font-mono font-bold tracking-wider",
                drift.status === 'safe' ? "text-emerald-500/80" :
                drift.status === 'warning' ? "text-amber-500/80" : "text-red-500/80"
            )}>
                DRIFT:{(drift.pct * 100).toFixed(2)}%
            </span>
        </div>
    </div>
  );
}
