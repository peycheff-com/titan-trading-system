import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RiskMetrics {
  marginUtilization: number;
  liquidationDistance: number; // Avg % to liquidation
  dailyLoss: number;
  maxDailyLoss: number; // Circuit breaker limit
  exposureRaw: {
    btc: number;
    eth: number;
    others: number;
  };
}

interface RiskDashboardProps {
  metrics?: RiskMetrics;
}

export function RiskDashboard({ metrics }: RiskDashboardProps) {
  // Mock data if undefined
  const data = metrics || {
    marginUtilization: 45,
    liquidationDistance: 12.5,
    dailyLoss: -150,
    maxDailyLoss: 1000,
    exposureRaw: { btc: 65, eth: 25, others: 10 },
  };

  const isHighRisk = data.marginUtilization > 80;
  const isCircuitBreakerNear = Math.abs(data.dailyLoss) > data.maxDailyLoss * 0.8;

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Portfolio Risk</CardTitle>
        {isHighRisk ? (
          <AlertTriangle className="h-4 w-4 text-destructive animate-pulse" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-primary" />
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Margin Utilization */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Margin Used</span>
              <span className={cn("font-medium", isHighRisk && "text-destructive")}>
                {data.marginUtilization}%
              </span>
            </div>
            <Progress 
              value={data.marginUtilization} 
              className={cn("h-2", isHighRisk ? "bg-destructive/20" : "")} 
              indicatorClassName={cn(isHighRisk ? "bg-destructive" : "bg-primary")}
            />
          </div>

          {/* Daily Circuit Breaker */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Daily Drawdown</span>
              <span className="text-muted-foreground">
                ${Math.abs(data.dailyLoss)} / ${data.maxDailyLoss}
              </span>
            </div>
            <Progress 
              value={(Math.abs(data.dailyLoss) / data.maxDailyLoss) * 100} 
              className="h-2"
              indicatorClassName={isCircuitBreakerNear ? "bg-warning" : "bg-emerald-500"}
            />
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs pt-2">
            <div className="flex items-center gap-2 rounded-md border p-2">
              <Zap className="h-3 w-3 text-yellow-500" />
              <div>
                <p className="font-medium text-foreground">{data.liquidationDistance}%</p>
                <p className="text-[10px] text-muted-foreground">Avg Liq. Dist</p>
              </div>
            </div>
             <div className="flex flex-col justify-center rounded-md border p-2 gap-1">
                <span className="text-[10px] text-muted-foreground">Exposure</span>
                <div className="flex gap-1">
                    <Badge variant="outline" className="text-[10px] h-4 px-1">BTC {data.exposureRaw.btc}%</Badge>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">ETH {data.exposureRaw.eth}%</Badge>
                </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
