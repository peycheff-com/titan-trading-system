import { OperatorIntentRecord } from '@titan/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Clock, FileText, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepProps {
  icon: React.ElementType;
  title: string;
  description: string;
  timestamp?: string;
  status?: 'completed' | 'current' | 'failed' | 'future';
  isLast?: boolean;
}

const TimelineStep = ({ icon: Icon, title, description, timestamp, status = 'future', isLast }: StepProps) => {
  const getColors = () => {
    switch (status) {
      case 'completed': return 'bg-emerald-500 text-white';
      case 'current': return 'bg-blue-500 text-white animate-pulse';
      case 'failed': return 'bg-red-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={cn("rounded-full p-2 z-10", getColors())}>
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && <div className="w-0.5 grow bg-border -my-2" />}
      </div>
      <div className="pb-8 pt-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-sm">{title}</h4>
          {timestamp && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(timestamp).toLocaleString()}
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
    </div>
  );
};

export const ProvenanceChain = ({ intent }: { intent: OperatorIntentRecord }) => {
  const isApproved = !!intent.approver_id;
  const isRejected = intent.status === 'REJECTED';
  const isExecuted = intent.status === 'VERIFIED' || intent.status === 'FAILED' || (intent.status === 'ACCEPTED' && intent.receipt); // Loosely executed if receipt exists

  return (
    <div className="space-y-4">
      <TimelineStep
        icon={User}
        title="Submitted"
        description={`Submitted by ${intent.operator_id} with reason: "${intent.reason}"`}
        timestamp={intent.submitted_at}
        status="completed"
      />

      {intent.approver_id && (
        <TimelineStep
          icon={isRejected ? X : Check}
          title={isRejected ? 'Rejected' : 'Approved'}
          description={
            isRejected 
              ? `Rejected by ${intent.approver_id}: "${intent.rejection_reason}"`
              : `Approved by ${intent.approver_id}`
          }
          timestamp={intent.approved_at}
          status={isRejected ? 'failed' : 'completed'}
          isLast={isRejected}
        />
      )}

      {!isRejected && (intent.status === 'PENDING_APPROVAL') && (
        <TimelineStep
          icon={Clock}
          title="Awaiting Approval"
          description="Waiting for authorized operator to approve."
          status="current"
          isLast
        />
      )}

      {intent.receipt && (
        <TimelineStep
          icon={FileText}
          title="Executed"
          description={
            intent.receipt.error 
              ? `Execution failed: ${intent.receipt.error}` 
              : `Executed with effect: ${intent.receipt.effect || 'No effect'}`
          }
          timestamp={intent.resolved_at} // Or receipt timestamp if available
          status={intent.receipt.error ? 'failed' : 'completed'}
          isLast
        />
      )}
      
      {!intent.receipt && !isRejected && intent.status !== 'PENDING_APPROVAL' && (
        <TimelineStep
          icon={Clock}
          title="Execution Pending"
          description="Processing..."
          status="current"
          isLast
        />
      )}
    </div>
  );
};
