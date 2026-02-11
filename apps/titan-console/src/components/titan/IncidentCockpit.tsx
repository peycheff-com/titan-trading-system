import React, { useEffect, useState } from 'react';
import { useTitanStream } from '@/hooks/useTitanStream';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldAlert, Activity, CheckCircle, Flame } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { TITAN_SUBJECTS } from '@titan/shared';

interface IncidentEvent {
    id: string;
    type: 'alert' | 'dlq';
    subject: string;
    payload: unknown;
    timestamp: number;
}

export function IncidentCockpit() {
    // We need to monitor multiple streams.
    // In a real app we might multiplex this in a context, but here we use two hooks.
    const alertStream = useTitanStream(TITAN_SUBJECTS.EVT.ALERT.ALL);
    const dlqStream = useTitanStream(TITAN_SUBJECTS.DLQ.ALL);
    
    // We also monitor heartbeats for system vitality
    const heartbeatStream = useTitanStream(TITAN_SUBJECTS.SYS.HEARTBEAT_ALL);

    const [incidents, setIncidents] = useState<IncidentEvent[]>([]);
    const [systemHealth, setSystemHealth] = useState<Record<string, number>>({});

    useEffect(() => {
        if (alertStream.lastMessage) {
            addIncident('alert', alertStream.lastMessage);
        }
    }, [alertStream.lastMessage]);

    useEffect(() => {
        if (dlqStream.lastMessage) {
            addIncident('dlq', dlqStream.lastMessage);
        }
    }, [dlqStream.lastMessage]);

    useEffect(() => {
        if (heartbeatStream.lastMessage) {
             const service = heartbeatStream.lastMessage.subject.split('.').pop() || 'unknown';
             setSystemHealth(prev => ({
                 ...prev,
                 [service]: Date.now()
             }));
        }
    }, [heartbeatStream.lastMessage]);

    const addIncident = (type: 'alert' | 'dlq', msg: { subject: string; data: unknown; timestamp: number }) => {
        const incident: IncidentEvent = {
            id: `${type}-${Date.now()}-${Math.random()}`,
            type,
            subject: msg.subject,
            payload: msg.data,
            timestamp: msg.timestamp
        };
        setIncidents(prev => [incident, ...prev].slice(0, 50));
    };

    // calculate health status (red if no heartbeat > 10s)
    const getServiceStatus = (lastSeen: number) => {
        const diff = Date.now() - lastSeen;
        return diff < 10000 ? 'healthy' : 'critical';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* System Health Status */}
             <Card className="md:col-span-1">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                         <Activity className="w-4 h-4 text-primary" /> System Vitals
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {Object.entries(systemHealth).length === 0 && (
                             <p className="text-xs text-muted-foreground italic">No heartbeats detected...</p>
                        )}
                        {Object.entries(systemHealth).map(([service, lastSeen]) => (
                            <div key={service} className="flex items-center justify-between text-sm border p-2 rounded bg-muted/20">
                                <span className="font-mono uppercase text-xs">{service}</span>
                                <div className="flex items-center gap-2">
                                     <span className="text-[10px] text-muted-foreground">
                                        {((Date.now() - lastSeen) / 1000).toFixed(1)}s ago
                                     </span>
                                     {getServiceStatus(lastSeen) === 'healthy' ? (
                                         <CheckCircle className="w-3 h-3 text-green-500" />
                                     ) : (
                                         <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />
                                     )}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
             </Card>

             {/* Live Incident Feed */}
             <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5" /> Incident Stream
                    </CardTitle>
                    <CardDescription>Real-time Alerts & Dead Letter Queue</CardDescription>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[300px] w-full pr-4">
                         <div className="space-y-3">
                             {incidents.length === 0 && (
                                 <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                     <CheckCircle className="w-8 h-8 mb-2 opacity-20" />
                                     <p className="text-xs">System Nominal. No Active Incidents.</p>
                                 </div>
                             )}
                             {incidents.map((incident) => (
                                 <div key={incident.id} className="flex flex-col gap-1 p-3 border rounded-md bg-card hover:bg-muted/50 transition-colors">
                                     <div className="flex items-center justify-between">
                                         <div className="flex items-center gap-2">
                                             {incident.type === 'dlq' ? (
                                                 <Badge variant="destructive" className="font-mono text-[10px] px-1">DLQ</Badge>
                                             ) : (
                                                 <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 font-mono text-[10px] px-1">ALERT</Badge>
                                             )}
                                             <span className="font-mono text-xs font-semibold truncate max-w-[200px]" title={incident.subject}>
                                                {incident.subject}
                                             </span>
                                         </div>
                                         <span className="text-[10px] text-muted-foreground font-mono">
                                             {new Date(incident.timestamp).toLocaleTimeString()}
                                         </span>
                                     </div>
                                     <div className="mt-1 text-xs text-muted-foreground break-all font-mono bg-muted/30 p-2 rounded">
                                          {typeof incident.payload === 'object' ? JSON.stringify(incident.payload).slice(0, 150) + (JSON.stringify(incident.payload).length > 150 ? '...' : '') : String(incident.payload)}
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </ScrollArea>
                </CardContent>
             </Card>
        </div>
    );
}
