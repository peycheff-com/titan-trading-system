
import { BrainDecision } from '../../types/index.js'; // We will add BrainDecision to types/index.ts
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTimestamp, formatNumber, formatPercent } from '@/types/index';
import { AlertTriangle, CheckCircle, XCircle, Activity, Shield, TrendingUp, Info } from 'lucide-react';

interface DecisionDetailsProps {
    decision: BrainDecision | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DecisionDetails({ decision, open, onOpenChange }: DecisionDetailsProps) {
    if (!decision) return null;

    const { signalId, approved, reason, timestamp, risk, context, allocation } = decision;
    
    // Safety for missing context (older events or minimal payloads)
    const marketState = context?.marketState;
    const riskState = context?.riskState || risk?.riskMetrics;
    const signal = context?.signal;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[600px] sm:w-[540px] overflow-hidden flex flex-col">
                <SheetHeader className="pb-4 border-b">
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="font-mono text-xs">
                            {signalId}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                            {formatTimestamp(timestamp)}
                        </span>
                    </div>
                    <SheetTitle className="flex items-center gap-2 text-xl">
                        {approved ? (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                        ) : (
                            <XCircle className="w-6 h-6 text-red-500" />
                        )}
                        {approved ? "Brain Approved" : "Brain Rejected"}
                    </SheetTitle>
                    <SheetDescription className="text-base font-medium text-foreground mt-2">
                        {reason}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 pr-4 -mr-4">
                    <div className="space-y-6 py-6">
                        {/* Signal Details */}
                        {signal && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary" /> Signal Intent
                                </h3>
                                <Card className="bg-muted/50 border-none">
                                    <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm">
                                        <div>
                                            <p className="text-muted-foreground text-xs">Symbol</p>
                                            <p className="font-mono font-bold">{signal.symbol}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Action</p>
                                            <Badge variant={signal.side === 'BUY' || signal.side === 'LONG' ? 'default' : 'secondary'} className="font-mono">
                                                {signal.side}
                                            </Badge>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Requested Size</p>
                                            <p className="font-mono">${formatNumber(signal.requestedSize)}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground text-xs">Strategy Phase</p>
                                            <Badge variant="outline" className="capitalize">{signal.phaseId}</Badge>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Risk Metrics */}
                        {riskState && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-primary" /> Risk Analysis
                                </h3>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <MetricCard label="Proj. Leverage" value={`${riskState.projectedLeverage?.toFixed(2)}x`} />
                                    <MetricCard label="Correlation" value={riskState.correlation?.toFixed(2)} />
                                    <MetricCard label="Portfolio Beta" value={riskState.portfolioBeta?.toFixed(2)} />
                                    <MetricCard label="Net Delta" value={riskState.portfolioDelta?.toFixed(0)} />
                                </div>
                                {risk && !approved && (
                                     <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-600 font-mono mt-2">
                                        VETO: {risk.reason}
                                     </div>
                                )}
                            </div>
                        )}

                        {/* Market Context */}
                        {marketState && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-primary" /> Market Regime
                                </h3>
                                <Card className="bg-muted/50 border-none">
                                    <CardContent className="grid grid-cols-2 gap-4 p-4 text-sm">
                                        <div>
                                            <p className="text-muted-foreground text-xs">Detected Regime</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="secondary" className="font-mono uppercase">
                                                    {marketState.regime || 'UNKNOWN'}
                                                </Badge>
                                            </div>
                                        </div>
                                        {marketState.volatility && (
                                            <div>
                                                <p className="text-muted-foreground text-xs">Volatility</p>
                                                <p className="font-mono">{marketState.volatility.toFixed(1)}</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Allocation Impact */}
                        {allocation && (
                            <div className="space-y-3">
                                <h3 className="text-sm font-semibold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary" /> Target Allocation
                                </h3>
                                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                                    <div className="p-2 border rounded flex flex-col items-center">
                                        <span className="text-muted-foreground">Scavenger</span>
                                        <span className="font-bold text-lg text-primary">{formatPercent((allocation.scavenger || 0) * 100, 1)}</span>
                                    </div>
                                    <div className="p-2 border rounded flex flex-col items-center">
                                        <span className="text-muted-foreground">Hunter</span>
                                        <span className="font-bold text-lg text-primary">{formatPercent((allocation.hunter || 0) * 100, 1)}</span>
                                    </div>
                                    <div className="p-2 border rounded flex flex-col items-center">
                                        <span className="text-muted-foreground">Sentinel</span>
                                        <span className="font-bold text-lg text-primary">{formatPercent((allocation.sentinel || 0) * 100, 1)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Raw JSON fallback/debug */}
                        <div className="pt-4 border-t">
                            <details className="text-xs text-muted-foreground">
                                <summary className="cursor-pointer hover:text-foreground mb-2 font-mono">View Raw JSON Payload</summary>
                                <pre className="bg-black/50 p-4 rounded-md overflow-x-auto">
                                    {JSON.stringify(decision, null, 2)}
                                </pre>
                            </details>
                        </div>
                    </div>
                </ScrollArea>
                <SheetFooter className="border-t pt-4">
                     <p className="text-[10px] text-muted-foreground font-mono w-full text-center">
                        Decision ID: {signalId} • Generated by Titan Brain v1
                     </p>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

function MetricCard({ label, value }: { label: string, value?: string | number }) {
    return (
        <div className="p-3 border rounded-md bg-card">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className="font-mono text-lg font-bold">{value || '-'}</div>
        </div>
    );
}
