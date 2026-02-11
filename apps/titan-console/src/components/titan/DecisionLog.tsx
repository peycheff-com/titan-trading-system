import React, { useEffect, useState } from 'react';
import { useTitanStream } from '@/hooks/useTitanStream';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit } from 'lucide-react';
import { BrainDecision } from '@/types/index';
import { DecisionDetails } from './DecisionDetails';
import { TITAN_SUBJECTS } from '@titan/shared';

export function DecisionLog() {
  // Subscribe specifically to the decision event
  const { lastMessage } = useTitanStream(TITAN_SUBJECTS.EVT.BRAIN.DECISION);
  const [logs, setLogs] = useState<BrainDecision[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<BrainDecision | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Check if the message is actually a decision event
    // The subject check ensures we don't process potential cross-talk if the subscription was wider
    if (lastMessage && (lastMessage.subject === TITAN_SUBJECTS.EVT.BRAIN.DECISION)) {
       setLogs(prev => [lastMessage.data as BrainDecision, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  const handleRowClick = (decision: BrainDecision) => {
    setSelectedDecision(decision);
    setDetailsOpen(true);
  };

  return (
    <>
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
             <BrainCircuit className="w-5 h-5" /> Decision Log
          </CardTitle>
          <CardDescription>Real-time audit of Brain risk decisions (Last 50) - Click to inspect</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Time</TableHead>
                <TableHead className="w-[100px]">Signal ID</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Metrics</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow 
                  key={log.signalId} 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(log)}
                >
                  <TableCell className="font-mono text-xs">{new Date(log.timestamp).toLocaleTimeString()}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{log.signalId.split('-')[0]}</TableCell>
                  <TableCell>
                    {log.approved ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">Approved</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20">Rejected</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{log.reason}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground text-right">
                     {log.risk?.riskMetrics ? (
                        <div className="flex flex-col items-end gap-1">
                          <span>Lev: {log.risk.riskMetrics.projectedLeverage?.toFixed(2) ?? '-'}x</span>
                          <span>Corr: {log.risk.riskMetrics.correlation?.toFixed(2) ?? '-'}</span>
                        </div>
                     ) : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No decisions recorded yet. Waiting for signal stream...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DecisionDetails 
        decision={selectedDecision} 
        open={detailsOpen} 
        onOpenChange={setDetailsOpen} 
      />
    </>
  );
}
