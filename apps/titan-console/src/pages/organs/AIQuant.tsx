import { useState } from 'react';
import { StatusPill } from '@/components/titan/StatusPill';
import { DiffViewer } from '@/components/titan/DiffViewer';
import { ConfirmModal } from '@/components/titan/ConfirmModal';
import { formatTimeAgo } from '@/types';
import { cn } from '@/lib/utils';
import { Cpu, Check, X, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';

import { LucideIcon } from 'lucide-react';

interface BacktestConfigItem {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
}

const backtestConfig: Record<string, BacktestConfigItem> = {
  improved: {
    icon: TrendingUp,
    color: 'text-pnl-positive',
    bg: 'bg-pnl-positive/10',
    label: 'Improved',
  },
  unchanged: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted', label: 'Unchanged' },
  worse: {
    icon: TrendingDown,
    color: 'text-pnl-negative',
    bg: 'bg-pnl-negative/10',
    label: 'Worse',
  },
};

interface Proposal {
  id: string;
  hypothesis: string;
  createdAt: number;
  backtestResult: string;
  sharpeImprovement: number;
  drawdownChange: number;
  guardrailWarnings: string[];
  configDiff: { before: Record<string, unknown>; after: Record<string, unknown> };
  status: 'pending' | 'approved' | 'rejected';
}

export default function AIQuantPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]); // Default empty
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject'>('approve');

  const handleAction = (id: string, action: 'approve' | 'reject') => {
    setSelectedProposal(id);
    setConfirmAction(action);
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (selectedProposal) {
      setProposals((prev) =>
        prev.map((p) =>
          p.id === selectedProposal
            ? { ...p, status: confirmAction === 'approve' ? 'approved' : 'rejected' }
            : p,
        ),
      );
    }
    setShowConfirm(false);
    toast.info('Waiting for backend integration...');
  };

  const pendingProposals = proposals.filter((p) => p.status === 'pending');
  const processedProposals = proposals.filter((p) => p.status !== 'pending');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Cpu className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">AI Quant</h1>
            <p className="text-sm text-muted-foreground">
              Optimization proposals and parameter tuning
            </p>
          </div>
        </div>
        <StatusPill status="healthy" label="Online" size="md" />
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Pending Review
          </span>
          <div className="mt-1 text-xl font-semibold text-foreground">
            {pendingProposals.length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Approved (Session)
          </span>
          <div className="mt-1 text-xl font-semibold text-pnl-positive">
            {proposals.filter((p) => p.status === 'approved').length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <span className="text-xxs font-medium uppercase tracking-wider text-muted-foreground">
            Rejected (Session)
          </span>
          <div className="mt-1 text-xl font-semibold text-pnl-negative">
            {proposals.filter((p) => p.status === 'rejected').length}
          </div>
        </div>
      </div>

      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Pending Proposals</h2>
          <div className="space-y-4">
            {pendingProposals.map((proposal) => {
              const btConfig = backtestConfig[proposal.backtestResult];
              const BacktestIcon = btConfig.icon;

              return (
                <div
                  key={proposal.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-4"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{proposal.hypothesis}</p>
                      <span className="text-xxs text-muted-foreground">
                        Created {formatTimeAgo(proposal.createdAt)}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5',
                        btConfig.bg,
                      )}
                    >
                      <BacktestIcon className={cn('h-3 w-3', btConfig.color)} />
                      <span className={cn('text-xxs font-medium', btConfig.color)}>
                        {btConfig.label}
                      </span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                      <span className="text-xxs text-muted-foreground">Sharpe:</span>
                      <span
                        className={cn(
                          'font-mono text-xs',
                          proposal.sharpeImprovement > 0
                            ? 'text-pnl-positive'
                            : proposal.sharpeImprovement < 0
                              ? 'text-pnl-negative'
                              : 'text-foreground',
                        )}
                      >
                        {proposal.sharpeImprovement > 0 ? '+' : ''}
                        {proposal.sharpeImprovement.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xxs text-muted-foreground">Drawdown:</span>
                      <span
                        className={cn(
                          'font-mono text-xs',
                          proposal.drawdownChange < 0
                            ? 'text-pnl-positive'
                            : proposal.drawdownChange > 0
                              ? 'text-pnl-negative'
                              : 'text-foreground',
                        )}
                      >
                        {proposal.drawdownChange > 0 ? '+' : ''}
                        {proposal.drawdownChange.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Guardrail Warnings */}
                  {proposal.guardrailWarnings.length > 0 && (
                    <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
                      <div className="flex items-center gap-1 text-xxs font-medium text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Guardrail Warnings
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {proposal.guardrailWarnings.map((warning, i) => (
                          <li key={i} className="text-xxs text-warning/80">
                            • {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Config Diff */}
                  <DiffViewer
                    before={proposal.configDiff.before}
                    after={proposal.configDiff.after}
                  />

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(proposal.id, 'reject')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => handleAction(proposal.id, 'approve')}
                      className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Check className="h-4 w-4" />
                      Approve (Draft)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Processed Proposals */}
      {processedProposals.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Processed (This Session)</h2>
          <div className="space-y-2">
            {processedProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="flex items-center justify-between rounded-md border border-border bg-card/50 p-3"
              >
                <p className="flex-1 truncate text-sm text-muted-foreground">
                  {proposal.hypothesis}
                </p>
                <span
                  className={cn(
                    'ml-4 rounded-full px-2 py-0.5 text-xxs font-medium',
                    proposal.status === 'approved'
                      ? 'bg-pnl-positive/10 text-pnl-positive'
                      : 'bg-pnl-negative/10 text-pnl-negative',
                  )}
                >
                  {proposal.status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={confirmAction === 'approve' ? 'Approve Proposal' : 'Reject Proposal'}
        description={
          confirmAction === 'approve'
            ? 'This will mark the proposal as approved (Draft). Actual deployment requires backend integration.'
            : 'This will reject the proposal. It can be reviewed again from the archive.'
        }
        confirmLabel={confirmAction === 'approve' ? 'Approve' : 'Reject'}
        variant={confirmAction === 'reject' ? 'destructive' : 'default'}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
