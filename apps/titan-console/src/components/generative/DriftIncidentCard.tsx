import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export interface DriftIncidentCardProps {
  incidentId: string;
  asset: string;
  driftBps: number;
  hypothesis: string;
  evidenceLinks: string[];
  recommendedAction: string;
}

export const DriftIncidentCard: React.FC<DriftIncidentCardProps> = ({
  incidentId,
  asset,
  driftBps,
  hypothesis,
  evidenceLinks,
  recommendedAction
}) => {
  return (
    <Card className="w-full max-w-md border-red-500/50 bg-destructive/5">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-bold text-destructive">Drift Incident {incidentId}</CardTitle>
          <Badge variant="destructive">{driftBps} bps</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-semibold text-sm">Asset</h4>
          <p className="text-sm">{asset}</p>
        </div>
        <div>
          <h4 className="font-semibold text-sm">Hypothesis</h4>
          <p className="text-sm">{hypothesis}</p>
        </div>
        <div>
          <h4 className="font-semibold text-sm">Evidence</h4>
          <ul className="list-disc pl-4 text-xs">
            {evidenceLinks.map((link, i) => (
              <li key={i}>{link}</li>
            ))}
          </ul>
        </div>
        <div className="pt-2">
          <Button variant="outline" className="w-full text-destructive border-destructive hover:bg-destructive/10">
            Action: {recommendedAction}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-1">Requires Approval</p>
        </div>
      </CardContent>
    </Card>
  );
};
