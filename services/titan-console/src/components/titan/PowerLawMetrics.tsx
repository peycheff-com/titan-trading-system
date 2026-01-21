import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, AlertTriangle, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/types";

interface PowerLawMetricsProps {
    tailExponent?: number;
    volatilityState?: 'quiet' | 'expanding' | 'mean_revert';
    persistenceScore?: number;
    isCrisis?: boolean;
}

export function PowerLawMetrics({ 
    tailExponent = 2.45, 
    volatilityState = 'quiet', 
    persistenceScore = 0.65,
    isCrisis = false
}: PowerLawMetricsProps) {

    // Determine color coding based on Regime
    const getVolColor = (state: string) => {
        switch(state) {
            case 'quiet': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
            case 'expanding': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
            case 'mean_revert': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            default: return 'text-muted-foreground';
        }
    };

    const getAlphaColor = (alpha: number) => {
        if (alpha < 1.8) return 'text-destructive';
        if (alpha < 2.0) return 'text-yellow-500';
        return 'text-emerald-500';
    };

    return (
        <Card className={cn("w-full transition-all duration-300", isCrisis ? "border-destructive/50 bg-destructive/5" : "")}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Waves className="h-4 w-4" />
                    Market Regime
                </CardTitle>
                {isCrisis && <Badge variant="destructive" className="animate-pulse">CRISIS DETECTED</Badge>}
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-4">
                    {/* Tail Exponent (Alpha) */}
                    <div className="flex flex-col space-y-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Tail Exp (α)
                            <TrendingUp className="h-3 w-3" />
                        </span>
                        <span className={cn("text-2xl font-bold font-mono tracking-tight", getAlphaColor(tailExponent))}>
                            {formatNumber(tailExponent, 2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            {tailExponent < 2.0 ? "Heavy Tails (Dangerous)" : "Normal Tails"}
                        </span>
                    </div>

                    {/* Volatility Regime */}
                    <div className="flex flex-col space-y-1">
                         <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Vol State
                            <Activity className="h-3 w-3" />
                        </span>
                        <Badge variant="outline" className={cn("w-fit uppercase text-[10px]", getVolColor(volatilityState))}>
                            {volatilityState}
                        </Badge>
                         <span className="text-[10px] text-muted-foreground">
                            Cycle Phase
                        </span>
                    </div>

                     {/* Persistence Score */}
                     <div className="flex flex-col space-y-1">
                        <span className="text-xs text-muted-foreground">Persistence</span>
                        <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
                            {formatNumber(persistenceScore, 2)}
                        </span>
                         <span className="text-[10px] text-muted-foreground">
                            Hurst ~ 0.72
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
