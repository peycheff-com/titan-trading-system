import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface RiskGateDecisionCardProps {
  orderId: string;
  gateName: string;
  decision: 'REJECT' | 'APPROVED'; // Mostly REJECT for this card
  reason: string;
  receiptJson: string;
}

export const RiskGateDecisionCard: React.FC<RiskGateDecisionCardProps> = ({
  orderId,
  gateName,
  decision,
  reason,
  receiptJson
}) => {
  return (
    <Card className="w-full max-w-md border-orange-500/50">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold">Risk Gate: {gateName}</CardTitle>
          <Badge variant={decision === 'REJECT' ? 'destructive' : 'default'}>{decision}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm">Order ID</h4>
          <p className="text-sm font-mono">{orderId}</p>
        </div>
        <div>
          <h4 className="font-semibold text-sm">Rejection Reason</h4>
          <p className="text-sm text-orange-600 dark:text-orange-400">{reason}</p>
        </div>
        <div>
          <h4 className="font-semibold text-sm">Receipt Data</h4>
          <ScrollArea className="h-24 w-full rounded-md border p-2">
            <pre className="text-xs font-mono">{receiptJson}</pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
};
