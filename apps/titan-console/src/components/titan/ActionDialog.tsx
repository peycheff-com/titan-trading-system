import React, { useState } from 'react';
import { useSafety } from '../../context/SafetyContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ActionDialogProps {
  trigger: React.ReactNode;
  title: string;
  description: string;
  actionName: string; // The text to type to confirm
  dangerLevel?: 'medium' | 'high' | 'critical';
  onConfirm: (reason: string) => Promise<void>;
  requireArmed?: boolean; // Defaults to true
}

export const ActionDialog: React.FC<ActionDialogProps> = ({
  trigger,
  title,
  description,
  actionName,
  dangerLevel = 'medium',
  onConfirm,
  requireArmed = true,
}) => {
  const { isArmed } = useSafety();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If not armed, render the disabled trigger (or wrap it)
  if (requireArmed && !isArmed) {
    return (
      <div
        className="opacity-50 cursor-not-allowed relative group"
        onClick={() => toast.error('Console must be ARMED to perform this action.')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            toast.error('Console must be ARMED to perform this action.');
          }
        }}
      >
        {trigger}
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] rounded transition-opacity opacity-0 group-hover:opacity-100">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  const handleConfirm = async () => {
    if (confirmation.toUpperCase() !== actionName.toUpperCase()) {
      toast.error('Confirmation phrase does not match.');
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required for audit logs.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onConfirm(reason);
      setOpen(false);
      setReason('');
      setConfirmation('');
    } catch (error) {
      // Error handling usually done in onConfirm or global handler, but we catch here to stop loading state
      console.error('Action failed', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDangerColor = () => {
    switch (dangerLevel) {
      case 'critical':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] border-l-4 border-l-red-500">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">
              Audit Reason <span className="text-red-500">*</span>
            </Label>
            <Input
              id="reason"
              placeholder="e.g. Market dislocation detected"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmation">
              Type <span className="font-mono font-bold select-all text-red-600">{actionName}</span>{' '}
              to confirm
            </Label>
            <Input
              id="confirmation"
              placeholder={actionName}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="col-span-3 font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={
              confirmation.toUpperCase() !== actionName.toUpperCase() ||
              !reason.trim() ||
              isSubmitting
            }
          >
            {isSubmitting ? 'Executing...' : 'Confirm Action'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
