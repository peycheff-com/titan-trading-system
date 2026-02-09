import React, { useMemo } from 'react';
import { useReplay } from '@/context/ReplayContext';
import { Slider } from '@/components/ui/slider';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle } from 'lucide-react';
import { ReplayControls } from './ReplayControls';

interface IncidentTimelineProps {
  className?: string;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ className }) => {
  const {
    isReplayMode,
    currentTime,
    seekTo,
  } = useReplay();

  // Defines the "window" of available history for the slider.
  // In a real app, this might come from API metadata (min/max time).
  // For now, we assume a rolling 24h window ending at "Now".
  
  // Pivot time: "Now" (when component mounted or updated)
  // But wait, if we are in replay mode, "Now" is fixed to when we entered?
  // Or dynamic?
  // Let's just fix "Now" to Date.now() for the Slider range max.
  const now = useMemo(() => Date.now(), []); 
  const windowSize = 24 * 60 * 60 * 1000; // 24 hours
  const minTime = now - windowSize;
  const maxTime = now;

  // Handle slider change (scrubbing)
  const handleValueChange = (values: number[]) => {
    if (values.length > 0) {
      seekTo(values[0]);
    }
  };

  if (!isReplayMode) return null;

  // Calculate percentage for current time marker
  const percentage = Math.max(0, Math.min(100, ((currentTime - minTime) / windowSize) * 100));

  return (
    <div className={cn("fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4 shadow-lg", className)}>
        <div className="container mx-auto max-w-7xl flex flex-col gap-4">
            
            {/* Top Row: Controls & Info */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="flex flex-col">
                      <span className="text-xs font-semibold text-amber-500 uppercase tracking-widest flex items-center gap-1.5">
                         <Activity className="w-3 h-3 animate-pulse" />
                         Historical Replay Active
                      </span>
                      <span className="text-sm text-muted-foreground">
                         Viewing system state as of <span className="font-mono text-foreground">{format(currentTime, 'PP pp')}</span>
                      </span>
                   </div>
                </div>

                <ReplayControls />
            </div>

            {/* Bottom Row: Timeline Slider */}
            <div className="relative pt-6 pb-2 px-2">
                {/* Markers (Examples) */}
                <div 
                   className="absolute top-2 -ml-3 flex flex-col items-center" 
                   style={{ left: '80%' }}
                >
                    <AlertTriangle className="w-4 h-4 text-red-500 mb-1" />
                    <div className="h-2 w-0.5 bg-red-500/50" />
                    <span className="text-[10px] text-red-500 font-mono mt-1">Incident #123</span>
                </div>

                 <Slider
                    min={minTime}
                    max={maxTime}
                    step={1000} // 1 second resolution
                    value={[currentTime]}
                    onValueChange={handleValueChange}
                    className="cursor-pointer"
                 />
                 
                 {/* Time Labels */}
                 <div className="flex justify-between mt-2 text-xs text-muted-foreground font-mono">
                    <span>{format(minTime, 'HH:mm')} (-24h)</span>
                    <span>{format(minTime + windowSize/2, 'HH:mm')} (-12h)</span>
                    <span>Now</span>
                 </div>
            </div>
        </div>
        
        {/* Playhead Line visual enhancement if needed */}
        {/* <div 
           className="absolute top-0 bottom-0 w-0.5 bg-amber-500/50 pointer-events-none z-0" 
           style={{ left: `${percentage}%` }}
        /> */}
    </div>
  );
};
