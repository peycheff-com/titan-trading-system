import { cn } from '@/lib/utils';
import { Activity, Brain } from 'lucide-react';

interface ActiveInferenceWidgetProps {
    cortisol?: number; // 0-1
    surprise?: number;
    regime?: string;
}

export function ActiveInferenceWidget({ 
    cortisol = 0, 
    surprise = 0, 
    regime = 'CALM' 
}: ActiveInferenceWidgetProps) {
    
    const getCortisolColor = (val: number) => {
        if (val < 0.2) return 'bg-emerald-500';
        if (val < 0.5) return 'bg-yellow-500';
        if (val < 0.8) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getRegimeColor = (r: string) => {
        switch(r.toUpperCase()) {
            case 'PANIC': return 'bg-red-500/20 text-red-500 border-red-500/30';
            case 'STRESSED': return 'bg-orange-500/20 text-orange-500 border-orange-500/30';
            case 'ALERT': return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
            default: return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30';
        }
    };

    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm h-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    <h3 className="font-semibold text-foreground text-sm">Active Inference</h3>
                </div>
                <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-bold border",
                    getRegimeColor(regime)
                )}>
                    {regime || 'CALM'}
                </span>
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Activity className="h-3 w-3" />
                            Cortisol
                        </span>
                        <span className="font-mono font-medium">{cortisol.toFixed(2)}</span>
                    </div>
                    <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                        <div 
                            className={cn("h-full transition-all duration-700 ease-out", getCortisolColor(cortisol))}
                            style={{ width: `${Math.min(cortisol * 100, 100)}%` }}
                        />
                    </div>
                    <p className="text-xxs text-muted-foreground mt-1">
                        System stress level (Free Energy minimization)
                    </p>
                </div>

                <div className="pt-2 border-t border-border/50">
                    <div className="flex justify-between items-center text-sm">
                       <div className="flex flex-col">
                           <span className="text-muted-foreground text-xs">Surprise (KL)</span>
                       </div>
                       <span className="font-mono text-base font-medium">{surprise.toFixed(4)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
