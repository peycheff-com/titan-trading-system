import React from 'react';
import { Shield, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ArmedGuardProps {
  className?: string;
}

export const ArmedGuard: React.FC<ArmedGuardProps> = ({ className }) => {
  const { isArmed, toggleArmed } = useSafety();

  return (
    <div className={cn("flex items-center gap-3 px-4 py-2 rounded-md border transition-colors duration-300", 
      isArmed ? "bg-red-950/30 border-red-900" : "bg-sidebar-accent/50 border-sidebar-border",
      className
    )}>
      <div className="flex flex-col">
        <span className={cn("text-xs font-bold uppercase tracking-wider", isArmed ? "text-red-500" : "text-muted-foreground")}>
          {isArmed ? 'ARMED' : 'SAFE'}
        </span>
        <span className="text-[10px] text-muted-foreground/70 hidden sm:inline-block">
          {isArmed ? 'Controls Active' : 'Controls Locked'}
        </span>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative flex items-center">
               <Switch 
                checked={isArmed}
                onCheckedChange={toggleArmed}
                className={cn("data-[state=checked]:bg-red-600")}
              />
              <div className="absolute left-[-24px] pointer-events-none">
                {isArmed ? (
                  <Unlock className="w-4 h-4 text-red-500 animate-pulse" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isArmed ? "Click to Disarm" : "Click to Arm Console"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {isArmed && (
        <ShieldAlert className="w-5 h-5 text-red-500 animate-pulse hidden sm:block" />
      )}
      {!isArmed && (
        <Shield className="w-5 h-5 text-muted-foreground/50 hidden sm:block" />
      )}
    </div>
  );
};
