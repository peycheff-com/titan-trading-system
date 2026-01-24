import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  showBackendWarning?: boolean;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  showBackendWarning = true,
}: ConfirmModalProps) {
  const [isPending, setIsPending] = useState(false);

  const handleConfirm = () => {
    setIsPending(true);
    // Simulate pending state then show warning
    setTimeout(() => {
      setIsPending(false);
      onConfirm();
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {variant === 'destructive' && <AlertTriangle className="h-5 w-5 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>

        {showBackendWarning && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs text-warning">
              ⚠️ This action will be saved as a local Draft only. Actual system changes require
              backend integration.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface HoldToConfirmProps {
  onConfirm: () => void;
  label?: string;
  holdDuration?: number;
  className?: string;
}

export function HoldToConfirm({
  onConfirm,
  label = 'Hold to Confirm',
  holdDuration = 2000,
  className,
}: HoldToConfirmProps) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const handleMouseDown = () => {
    setIsHolding(true);
    const interval = 50;
    const steps = holdDuration / interval;
     
    let current = 0;

    const timer = setInterval(() => {
      current += 1;
      setProgress((current / steps) * 100);

      if (current >= steps) {
        clearInterval(timer);
        onConfirm();
        setProgress(0);
        setIsHolding(false);
      }
    }, interval);

    const cleanup = () => {
      clearInterval(timer);
      setProgress(0);
      setIsHolding(false);
    };

    document.addEventListener('mouseup', cleanup, { once: true });
    document.addEventListener('mouseleave', cleanup, { once: true });
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      className={cn(
        'relative overflow-hidden rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-all',
        'hover:border-destructive hover:bg-destructive/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
        isHolding && 'border-destructive',
        className,
      )}
    >
      <span
        className="absolute inset-0 bg-destructive/30 transition-all"
        style={{ width: `${progress}%` }}
      />
      <span className="relative">{label}</span>
    </button>
  );
}
