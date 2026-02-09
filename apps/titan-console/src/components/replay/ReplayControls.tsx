import React from 'react';
import { useReplay } from '@/context/ReplayContext';
import { Button } from '@/components/ui/button';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Rewind, 
  FastForward, 
  History, 
  Activity 
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export const ReplayControls: React.FC = () => {
  const {
    isReplayMode,
    isPlaying,
    currentTime,
    playbackSpeed,
    toggleReplayMode,
    play,
    pause,
    setPlaybackSpeed,
    stepForward,
    stepBackward,
    loading
  } = useReplay();

  if (!isReplayMode) {
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={toggleReplayMode}
        className="gap-2 border-amber-500/50 text-amber-500 hover:text-amber-400 hover:bg-amber-950/30"
      >
        <History className="h-4 w-4" />
        Enter Time Travel
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border rounded-md p-1 shadow-sm">
      <div className="flex items-center gap-1 px-2 border-r mr-1">
         <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/50 gap-1 animate-pulse">
            <History className="h-3 w-3" />
            REPLAY
         </Badge>
         <span className="text-xs font-mono text-muted-foreground w-36 text-center">
            {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}
         </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={stepBackward}
        disabled={loading}
        className="h-8 w-8"
      >
        <SkipBack className="h-4 w-4" />
      </Button>

      <Button
        variant={isPlaying ? "secondary" : "default"}
        size="icon"
        onClick={isPlaying ? pause : play}
        disabled={loading}
        className={cn("h-8 w-8", isPlaying ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30" : "bg-primary")}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={stepForward}
        disabled={loading}
        className="h-8 w-8"
      >
        <SkipForward className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-4 w-[1px] bg-border" />

      <Select 
        value={playbackSpeed.toString()} 
        onValueChange={(val) => setPlaybackSpeed(parseFloat(val))}
      >
        <SelectTrigger className="h-7 w-[70px] text-xs">
          <SelectValue placeholder="Speed" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.5">0.5x</SelectItem>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="5">5x</SelectItem>
          <SelectItem value="10">10x</SelectItem>
        </SelectContent>
      </Select>

      <Button 
        variant="ghost" 
        size="sm" 
        onClick={toggleReplayMode}
        className="ml-2 text-xs text-muted-foreground hover:text-foreground"
      >
        Exit
      </Button>
    </div>
  );
};
