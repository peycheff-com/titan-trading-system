import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, AlertOctagon, XCircle, RefreshCw } from "lucide-react";

interface ServiceStatus {
    name: string;
    healthy: boolean;
}

interface SystemStatusProps {
    services?: ServiceStatus[];
    lastSyncTime?: number;
    exchangeConnected?: boolean;
}

export function SystemStatusBanner({ 
    services = [
        { name: 'Brain', healthy: true }, 
        { name: 'Execution', healthy: true },
        { name: 'DataStream', healthy: true }
    ],
    lastSyncTime = Date.now(),
    exchangeConnected = true 
}: SystemStatusProps) {

    const allServicesHealthy = services.every(s => s.healthy);
    const isReady = allServicesHealthy && exchangeConnected;

    const timeSinceSync = Date.now() - lastSyncTime;
    const isStale = timeSinceSync > 10000; // 10s

    if (isReady && !isStale) {
        return (
            <Alert className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 mb-4 py-2">
                <CheckCircle2 className="h-4 w-4" color="#059669" />
                <AlertTitle className="text-sm font-semibold text-emerald-700">System Ready</AlertTitle>
                <AlertDescription className="text-xs text-emerald-600/90 flex gap-4">
                    <span>All services operational.</span>
                    <span>Exchange Connected.</span>
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <Alert variant="destructive" className="mb-4 py-2">
             <AlertOctagon className="h-4 w-4" />
            <AlertTitle className="text-sm font-semibold">System Not Ready</AlertTitle>
            <AlertDescription className="text-xs flex gap-4 flex-wrap mt-1">
                {!exchangeConnected && <span className="flex items-center gap-1"><XCircle className="h-3 w-3"/> Exchange Disconnected</span>}
                {isStale && <span className="flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin"/> Stale Data ({Math.round(timeSinceSync/1000)}s)</span>}
                {!allServicesHealthy && services.filter(s => !s.healthy).map(s => (
                     <span key={s.name} className="flex items-center gap-1"><XCircle className="h-3 w-3"/> {s.name} Down</span>
                ))}
            </AlertDescription>
        </Alert>
    );
}
