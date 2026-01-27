import { useState, useEffect } from 'react';
import { DecisionLogTable, DecisionLogEntry } from '@/components/titan/DecisionLogTable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrainCircuit, ShieldAlert, History } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-config';

interface OperatorAction {
  id: string;
  timestamp: number;
  action: string;
  reason: string;
  status: 'EXECUTED' | 'FAILED';
  operatorId: string;
}

export default function DecisionLog() {
  const { token } = useAuth();
  // Mock AI Data (keep for now)
  const [logs] = useState<DecisionLogEntry[]>([
    {
      id: '1',
      timestamp: Date.now() - 5000,
      symbol: 'BTCUSDT',
      side: 'LONG',
      score: 0.85,
      status: 'ACCEPTED',
      reason: 'High RSI + PowerLaw Conf',
      engine: 'Hunter',
    },
  ]);

  const [auditLogs, setAuditLogs] = useState<OperatorAction[]>([]);

  useEffect(() => {
    if (token) {
      fetch(`${getApiBaseUrl()}/audit/logs?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            // Map TitanEvent to OperatorAction
            const mapped = data.data
              .filter((e: any) =>
                [
                  'SYSTEM_HALT',
                  'MANUAL_OVERRIDE',
                  'CIRCUIT_BREAKER_RESET',
                  'RESET',
                  'RISK_CONFIG_UPDATE',
                ].includes(e.type),
              )
              .map((e: any) => ({
                id: e.id,
                timestamp: new Date(e.metadata?.timestamp || Date.now()).getTime(),
                action: e.type,
                reason: e.payload?.reason || 'No reason provided',
                status: 'EXECUTED', // Default since event log implies executed/recorded
                operatorId: e.payload?.operatorId || e.metadata?.actor || 'unknown',
              }));
            setAuditLogs(mapped);
          }
        })
        .catch((err) => console.error('Failed to fetch audit logs', err));
    }
  }, [token]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <History className="h-6 w-6 text-foreground" />
          System Audit & Decisions
        </h1>
        <p className="text-sm text-muted-foreground">
          Traceability for AI decisions and Operator interventions.
        </p>
      </div>

      <Tabs defaultValue="ai" className="w-full">
        <TabsList>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4" /> AI Decisions
          </TabsTrigger>
          <TabsTrigger value="ops" className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Operator Actions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent Proposals</CardTitle>
            </CardHeader>
            <CardContent>
              <DecisionLogTable logs={logs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ops" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Operator Intervention Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Time
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Action
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Operator
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Reason
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="p-4 align-middle font-mono text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="p-4 align-middle font-semibold text-orange-500">
                          {log.action}
                        </td>
                        <td className="p-4 align-middle text-xs">{log.operatorId}</td>
                        <td className="p-4 align-middle italic text-muted-foreground">
                          {log.reason}
                        </td>
                        <td className="p-4 align-middle">
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20">
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
