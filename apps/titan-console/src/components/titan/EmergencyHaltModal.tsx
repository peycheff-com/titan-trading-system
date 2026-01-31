import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface EmergencyHaltModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmHalt: () => void;
}

export function EmergencyHaltModal({ open, onOpenChange, onConfirmHalt }: EmergencyHaltModalProps) {
  const [confirmationText, setConfirmationText] = useState('');
  const [isLocked, setIsLocked] = useState(true);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setConfirmationText('');
      setIsLocked(true);
    }
  }, [open]);

  const handleConfirm = () => {
    if (confirmationText !== 'HALT') {
      toast.error('Please type HALT to confirm.');
      return;
    }
    onConfirmHalt();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] border-destructive/50 bg-destructive/5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            EMERGENCY SYSTEM HALT
          </DialogTitle>
          <DialogDescription className="text-destructive/90">
            This action will immediately <strong>cancel all open orders</strong> and{' '}
            <strong>stop all trading engines</strong>. This action requires manual intervention to
            resume.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmation" className="text-destructive font-semibold">
              Type "HALT" to confirm:
            </Label>
            <div className="flex gap-2">
              <Input
                id="confirmation"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                className="border-destructive/50 focus-visible:ring-destructive"
                placeholder="HALT"
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsLocked(!isLocked)}
                className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                title={isLocked ? 'Unlock to Confirm' : 'Locked'}
              >
                <Lock className={isLocked ? 'h-4 w-4' : 'h-4 w-4 opacity-50'} />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmationText !== 'HALT' || isLocked}
            className="w-full sm:w-auto font-bold tracking-wider"
          >
            CONFIRM HALT
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
