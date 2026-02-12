import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface OrderSubmission {
  symbol: string;
  side: 'Buy' | 'Sell';
  type: 'Market' | 'Limit';
  price: number | null;
  size: number;
  timestamp: number;
}

interface OrderFormProps {
  onPlaceOrder: (order: OrderSubmission) => void;
  symbols: string[];
}

export function OrderForm({ onPlaceOrder, symbols }: OrderFormProps) {
  const [symbol, setSymbol] = useState(symbols[0] || 'BTCUSDT');
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [type, setType] = useState<'Market' | 'Limit'>('Market');
  const [price, setPrice] = useState('');
  const [size, setSize] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onPlaceOrder({
      symbol,
      side,
      type,
      price: type === 'Limit' ? Number(price) : null,
      size: Number(size),
      timestamp: Date.now(),
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Place Order</CardTitle>
        <CardDescription>Manual trade execution override.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger>
                <SelectValue placeholder="Select symbol" />
              </SelectTrigger>
              <SelectContent>
                {symbols.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Side</Label>
              <Tabs value={side} onValueChange={(v) => setSide(v as 'Buy' | 'Sell')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="Buy"
                    className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
                  >
                    Buy
                  </TabsTrigger>
                  <TabsTrigger
                    value="Sell"
                    className="data-[state=active]:bg-red-500 data-[state=active]:text-white"
                  >
                    Sell
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'Market' | 'Limit')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Market">Market</SelectItem>
                  <SelectItem value="Limit">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Size (USD)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                required
              />
            </div>
            {type === 'Limit' && (
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full"
              variant={side === 'Buy' ? 'default' : 'destructive'}
            >
              {side.toUpperCase()} {symbol}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter className="bg-muted/50 p-3">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Checks: Risk Engine limits apply.
        </p>
      </CardFooter>
    </Card>
  );
}
