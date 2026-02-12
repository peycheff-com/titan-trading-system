import { useState, useCallback } from 'react';
import { RiskDashboard } from '@/components/titan/RiskDashboard';
import { PositionsTable, Position } from '@/components/titan/PositionsTable';
import { OrderForm } from '@/components/titan/OrderForm';
import { EmergencyHaltModal } from '@/components/titan/EmergencyHaltModal';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { Button } from '@/components/ui/button';
import { AlertOctagon, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function TradeControl() {
  const { sendMessage } = useTitanWebSocket();
  const [positions, setPositions] = useState<Position[]>([
    {
      symbol: 'BTCUSDT',
      side: 'Buy',
      size: 0.5,
      entryPrice: 64200,
      markPrice: 64500,
      unrealizedPnl: 150,
      liquidationPrice: 58000,
      leverage: 10,
    },
    {
      symbol: 'ETHUSDT',
      side: 'Sell',
      size: 5.0,
      entryPrice: 3400,
      markPrice: 3420,
      unrealizedPnl: -100,
      liquidationPrice: 3600,
      leverage: 10,
    },
  ]);

  // Mock symbols for now
  const availableSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

  const [showHaltModal, setShowHaltModal] = useState(false);

interface OrderPayload {
    side: string;
    symbol: string;
    size?: number;
    price?: number;
    type?: string;
  }

  const handlePlaceOrder = (order: OrderPayload) => {
    console.log('Placing order:', order);
    sendMessage({ type: 'PLACE_ORDER', payload: order });
    toast.success(`Order sent: ${order.side} ${order.symbol}`);
  };

  const handleClosePosition = (symbol: string) => {
    console.log('Closing position:', symbol);
    sendMessage({ type: 'CLOSE_POSITION', payload: { symbol } });
    toast.info(`Closing position: ${symbol}`);
  };

  const onConfirmHalt = () => {
    sendMessage({ type: 'SYSTEM_HALT' });
    toast.error('SYSTEM HALT COMMAND SENT');
  };

  return (
    <div className="space-y-6 animate-fade-in p-2 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Trade Control</h1>
          <p className="text-sm text-muted-foreground">Manual intervention and trade execution.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            className="w-full sm:w-auto border-orange-500 text-orange-500 hover:bg-orange-500/10 hover:text-orange-600 h-10"
          >
            <PauseCircle className="mr-2 h-4 w-4" />
            Pause Trading
          </Button>
          <Button
            variant="destructive"
            className="w-full sm:w-auto h-10"
            onClick={() => setShowHaltModal(true)}
          >
            <AlertOctagon className="mr-2 h-4 w-4" />
            Close All Positions
          </Button>
        </div>
      </div>

      <EmergencyHaltModal
        open={showHaltModal}
        onOpenChange={setShowHaltModal}
        onConfirmHalt={onConfirmHalt}
      />

      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Col: Order Form & Risk */}
        <div className="md:col-span-4 space-y-6">
          <RiskDashboard />
          <OrderForm onPlaceOrder={handlePlaceOrder} symbols={availableSymbols} />
        </div>

        {/* Right Col: Positions */}
        <div className="md:col-span-8">
          <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="p-6 pb-2">
              <h3 className="text-lg font-semibold leading-none tracking-tight">Open Positions</h3>
            </div>
            <div className="p-6 pt-0 overflow-x-auto">
              <PositionsTable positions={positions} onClosePosition={handleClosePosition} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
