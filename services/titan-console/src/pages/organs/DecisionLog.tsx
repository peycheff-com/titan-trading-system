import { useState } from 'react';
import { DecisionLogTable, DecisionLogEntry } from '@/components/titan/DecisionLogTable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';

export default function DecisionLog() {
    // Mock Data
    const [logs] = useState<DecisionLogEntry[]>([
        { id: '1', timestamp: Date.now() - 5000, symbol: 'BTCUSDT', side: 'LONG', score: 0.85, status: 'ACCEPTED', reason: 'High RSI + PowerLaw Conf', engine: 'Hunter' },
        { id: '2', timestamp: Date.now() - 65000, symbol: 'ETHUSDT', side: 'SHORT', score: 0.45, status: 'REJECTED', reason: 'Score below threshold (0.6)', engine: 'Scavenger' },
        { id: '3', timestamp: Date.now() - 120000, symbol: 'SOLUSDT', side: 'LONG', score: 0.92, status: 'REJECTED', reason: 'Risk Gated: Exposure Limit', engine: 'Hunter' },
    ]);

    return (
        <div className="space-y-6 animate-fade-in">
             <div>
                <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                    <BrainCircuit className="h-6 w-6 text-primary" />
                    Decision Log
                </h1>
                <p className="text-sm text-muted-foreground">
                    Audit trail of Active Inference engine proposals and decisions.
                </p>
            </div>

            <div className="grid gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Recent Proposals</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <DecisionLogTable logs={logs} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
