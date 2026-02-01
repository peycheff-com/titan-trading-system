import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface FlattenProposalFormProps {
  initialAsset?: string;
  initialReason?: string;
  onPropose: (payload: { asset: string; reason: string }) => void;
}

export const FlattenProposalForm: React.FC<FlattenProposalFormProps> = ({
  initialAsset = '',
  initialReason = '',
  onPropose
}) => {
  const [asset, setAsset] = useState(initialAsset);
  const [reason, setReason] = useState(initialReason);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPropose({ asset, reason });
  };

  return (
    <Card className="w-full max-w-sm border-blue-500/50">
      <CardHeader>
        <CardTitle>Propose Flatten Action</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="asset">Traing Pair/Asset</Label>
            <Input 
              id="asset" 
              value={asset} 
              onChange={(e) => setAsset(e.target.value)} 
              placeholder="BTC-USDT"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (Required)</Label>
            <Input 
              id="reason" 
              value={reason} 
              onChange={(e) => setReason(e.target.value)} 
              placeholder="Drift > 50bps detected"
            />
          </div>
          <Button type="submit" className="w-full">
            Draft Proposal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
