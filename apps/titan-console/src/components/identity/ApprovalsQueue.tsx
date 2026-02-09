import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-config';
import { OperatorIntentRecord } from '@titan/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Check, X, Loader2, Eye, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { ProvenanceChain } from './ProvenanceChain';

interface ApprovalsResponse {
  approvals: (OperatorIntentRecord & { danger_level?: string; time_pending_ms?: number })[];
  total: number;
  pending_count: number;
}

export const ApprovalsQueue = () => {
  const { token, operatorId } = useAuth();
  const queryClient = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/operator/approvals?status=PENDING_APPROVAL`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch approvals');
      return res.json() as Promise<ApprovalsResponse>;
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${getApiBaseUrl()}/operator/intents/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Intent approved');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`${getApiBaseUrl()}/operator/intents/${id}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Intent rejected');
      setRejectId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: () => toast.error('Rejection failed'),
  });

  const handleReject = () => {
    if (rejectId && rejectReason.trim()) {
      rejectMutation.mutate({ id: rejectId, reason: rejectReason });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const intents = data?.approvals || [];

  if (intents.length === 0) {
    return (
      <div className="text-center p-12 text-muted-foreground border rounded-lg bg-muted/10">
        No pending approvals.
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Intent Type</TableHead>
            <TableHead>Operator</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Risk Level</TableHead>
            <TableHead>Time Pending</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {intents.map((intent) => (
            <TableRow key={intent.id}>
              <TableCell className="font-medium">
                <Badge variant="outline">{intent.type}</Badge>
              </TableCell>
              <TableCell>{intent.operator_id}</TableCell>
              <TableCell className="max-w-[200px] truncate" title={intent.reason}>
                {intent.reason}
              </TableCell>
              <TableCell>
                {intent.danger_level && (
              <TableCell>
                {intent.danger_level && (
                  <Badge 
                    variant={intent.danger_level === 'critical' ? 'destructive' : 'secondary'}
                    className="capitalize flex w-fit items-center gap-1"
                  >
                    {intent.danger_level === 'critical' && <ShieldAlert className="h-3 w-3" />}
                    {intent.danger_level}
                  </Badge>
                )}
              </TableCell>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm font-mono">
                {intent.time_pending_ms ? `${Math.round(intent.time_pending_ms / 1000)}s` : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                    onClick={() => approveMutation.mutate(intent.id)}
                    disabled={approveMutation.isPending || intent.operator_id === operatorId}
                  >
                    {approveMutation.isPending && approveMutation.variables === intent.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Approve
                  </Button>

                  <Sheet>
                    <SheetTrigger asChild>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                    </SheetTrigger>
                    <SheetContent className="w-[400px] sm:w-[540px]">
                      <SheetHeader>
                        <SheetTitle>Intent Details</SheetTitle>
                      </SheetHeader>
                      <ScrollArea className="h-[calc(100vh-100px)] pr-4">
                        <div className="space-y-6 py-6">
                           {/* Intent Summary */}
                           <div className="space-y-4">
                              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Summary</h3>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <div className="text-muted-foreground mb-1">Type</div>
                                  <div className="font-mono">{intent.type}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground mb-1">Operator</div>
                                  <div>{intent.operator_id}</div>
                                </div>
                                <div className="col-span-2">
                                  <div className="text-muted-foreground mb-1">Reason</div>
                                  <div className="p-3 bg-muted/50 rounded-md italic">"{intent.reason}"</div>
                                </div>
                              </div>
                           </div>

                           <Separator />

                           {/* Provenance Chain */}
                           <div className="space-y-4">
                              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Provenance Chain</h3>
                              <ProvenanceChain intent={intent} />
                           </div>

                             {/* Raw Data (Optional) */}
                            <Separator />
                            <div className="space-y-4">
                               <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Raw Payload</h3>
                               <pre className="text-xs bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto">
                                 {JSON.stringify(intent, null, 2)}
                               </pre>
                            </div>
                        </div>
                      </ScrollArea>
                    </SheetContent>
                  </Sheet>



                  <Dialog open={rejectId === intent.id} onOpenChange={(open) => !open && setRejectId(null)}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setRejectId(intent.id)}
                        disabled={approveMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject Intent</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Reason for rejection</Label>
                          <Input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g. Policy violation..."
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
                        <Button
                          variant="destructive"
                          onClick={handleReject}
                          disabled={rejectMutation.isPending || !rejectReason.trim()}
                        >
                          {rejectMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : null}
                          Confirm Rejection
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
