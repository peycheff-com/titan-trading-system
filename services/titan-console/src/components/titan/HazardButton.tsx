import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { useSafety } from '@/context/SafetyContext';
import { Lock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HazardButtonProps extends ButtonProps {
  confirmationText?: string;
}

export const HazardButton = React.forwardRef<HTMLButtonElement, HazardButtonProps>(
  ({ className, children, onClick, disabled, ...props }, ref) => {
    const { isArmed } = useSafety();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isArmed) return;
      onClick?.(e);
    };

    if (!isArmed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="inline-block cursor-not-allowed">
                <Button
                  ref={ref}
                  variant="outline"
                  className={cn('opacity-50 gap-2 relative overflow-hidden', className)}
                  disabled={true}
                  {...props}
                >
                  <Lock className="h-4 w-4" />
                  {children}
                  {/* Stripes pattern overlay */}
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,.05)_25%,rgba(0,0,0,.05)_50%,transparent_50%,transparent_75%,rgba(0,0,0,.05)_75%,rgba(0,0,0,.05)_100%)] bg-[length:10px_10px]" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>System Disarmed. Enable 'Armed Mode' to execute this command.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Button
        ref={ref}
        variant="destructive"
        className={cn('gap-2 animate-pulse-gentle', className)}
        onClick={handleClick}
        disabled={disabled}
        {...props}
      >
        <AlertTriangle className="h-4 w-4" />
        {children}
      </Button>
    );
  },
);

// eslint-disable-next-line functional/immutable-data
HazardButton.displayName = 'HazardButton';
