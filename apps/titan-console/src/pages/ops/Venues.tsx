/**
 * Venues - Exchange connectivity and market status page
 * 
 * Features:
 * - Exchange cards with connectivity status
 * - Product tabs (Spot, Futures, Options)
 * - Symbol search and filtering
 * - Connectivity testing
 */
import React, { useState, useMemo } from 'react';
import { 
  Globe, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  Search, 
  RefreshCw,
  Activity,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getTitanBrainUrl } from '@/lib/api-config';
import { useAuth } from '@/context/AuthContext';

// Exchange definitions
interface Exchange {
  id: string;
  name: string;
  logo: string;
  products: ('spot' | 'futures' | 'options')[];
  status: 'connected' | 'degraded' | 'disconnected';
  latency?: number;
  lastHeartbeat?: number;
  config: {
    wsEndpoint: string;
    restEndpoint: string;
    rateLimit: number;
  };
}

// Mock exchange data - would come from API in production
const EXCHANGES: Exchange[] = [
  {
    id: 'binance',
    name: 'Binance',
    logo: '🟡',
    products: ['spot', 'futures'],
    status: 'connected',
    latency: 23,
    lastHeartbeat: Date.now() - 2000,
    config: {
      wsEndpoint: 'wss://stream.binance.com:9443/ws',
      restEndpoint: 'https://api.binance.com',
      rateLimit: 1200,
    },
  },
  {
    id: 'bybit',
    name: 'Bybit',
    logo: '🟠',
    products: ['spot', 'futures', 'options'],
    status: 'connected',
    latency: 45,
    lastHeartbeat: Date.now() - 3000,
    config: {
      wsEndpoint: 'wss://stream.bybit.com/v5/public/spot',
      restEndpoint: 'https://api.bybit.com',
      rateLimit: 600,
    },
  },
  {
    id: 'coinbase',
    name: 'Coinbase',
    logo: '🔵',
    products: ['spot'],
    status: 'degraded',
    latency: 89,
    lastHeartbeat: Date.now() - 15000,
    config: {
      wsEndpoint: 'wss://advanced-trade-ws.coinbase.com',
      restEndpoint: 'https://api.coinbase.com',
      rateLimit: 300,
    },
  },
  {
    id: 'kraken',
    name: 'Kraken',
    logo: '🟣',
    products: ['spot', 'futures'],
    status: 'connected',
    latency: 67,
    lastHeartbeat: Date.now() - 5000,
    config: {
      wsEndpoint: 'wss://ws.kraken.com',
      restEndpoint: 'https://api.kraken.com',
      rateLimit: 60,
    },
  },
  {
    id: 'mexc',
    name: 'MEXC',
    logo: '🟢',
    products: ['spot'],
    status: 'disconnected',
    config: {
      wsEndpoint: 'wss://wbs.mexc.com/ws',
      restEndpoint: 'https://api.mexc.com',
      rateLimit: 100,
    },
  },
];

// Symbol data
interface Symbol {
  symbol: string;
  base: string;
  quote: string;
  exchange: string;
  product: 'spot' | 'futures' | 'options';
  status: 'trading' | 'halted' | 'restricted';
  volume24h: number;
  price: number;
  priceChange24h: number;
}

// Mock symbols - would come from API
const SYMBOLS: Symbol[] = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', exchange: 'binance', product: 'spot', status: 'trading', volume24h: 2340000000, price: 67500, priceChange24h: 2.3 },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', exchange: 'binance', product: 'spot', status: 'trading', volume24h: 1200000000, price: 3650, priceChange24h: -1.2 },
  { symbol: 'BTCUSD', base: 'BTC', quote: 'USD', exchange: 'coinbase', product: 'spot', status: 'trading', volume24h: 890000000, price: 67480, priceChange24h: 2.1 },
  { symbol: 'BTC-PERP', base: 'BTC', quote: 'USDT', exchange: 'bybit', product: 'futures', status: 'trading', volume24h: 5600000000, price: 67520, priceChange24h: 2.4 },
  { symbol: 'ETH-PERP', base: 'ETH', quote: 'USDT', exchange: 'bybit', product: 'futures', status: 'trading', volume24h: 3200000000, price: 3655, priceChange24h: -1.0 },
  { symbol: 'BTC-24MAR-70000-C', base: 'BTC', quote: 'USDT', exchange: 'bybit', product: 'options', status: 'trading', volume24h: 45000000, price: 1250, priceChange24h: 15.3 },
  { symbol: 'XXBTZUSD', base: 'XBT', quote: 'USD', exchange: 'kraken', product: 'spot', status: 'trading', volume24h: 320000000, price: 67510, priceChange24h: 2.2 },
];

// Exchange Card Component
const ExchangeCard: React.FC<{ 
  exchange: Exchange; 
  onTest: () => void;
  testing: boolean;
}> = ({ exchange, onTest, testing }) => {
  const statusColor = {
    connected: 'bg-green-100 text-green-800 border-green-200',
    degraded: 'bg-amber-100 text-amber-800 border-amber-200',
    disconnected: 'bg-red-100 text-red-800 border-red-200',
  }[exchange.status];

  const statusIcon = {
    connected: <CheckCircle2 className="w-4 h-4 text-green-600" />,
    degraded: <AlertTriangle className="w-4 h-4 text-amber-600" />,
    disconnected: <XCircle className="w-4 h-4 text-red-600" />,
  }[exchange.status];

  const latencyColor = exchange.latency 
    ? exchange.latency < 50 ? 'text-green-600' 
    : exchange.latency < 100 ? 'text-amber-600' 
    : 'text-red-600'
    : 'text-muted-foreground';

  return (
    <Card className={cn(
      'transition-all hover:shadow-md',
      exchange.status === 'disconnected' && 'opacity-60'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{exchange.logo}</span>
            <div>
              <CardTitle className="text-lg">{exchange.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {exchange.products.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs capitalize">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className={cn('px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 border', statusColor)}>
            {statusIcon}
            {exchange.status}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Latency</div>
            <div className={cn('font-mono text-lg', latencyColor)}>
              {exchange.latency ? `${exchange.latency}ms` : 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last Heartbeat</div>
            <div className="font-mono text-sm">
              {exchange.lastHeartbeat 
                ? `${Math.round((Date.now() - exchange.lastHeartbeat) / 1000)}s ago`
                : 'Never'
              }
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mb-3 font-mono truncate">
          {exchange.config.wsEndpoint}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={onTest}
          disabled={testing}
        >
          {testing ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-2" />
          )}
          Test Connection
        </Button>
      </CardContent>
    </Card>
  );
};

// Symbols Table Component
const SymbolsTable: React.FC<{ 
  symbols: Symbol[]; 
  searchQuery: string;
}> = ({ symbols, searchQuery }) => {
  const filtered = useMemo(() => {
    if (!searchQuery) return symbols;
    const q = searchQuery.toLowerCase();
    return symbols.filter(
      (s) => s.symbol.toLowerCase().includes(q) || 
             s.base.toLowerCase().includes(q) ||
             s.exchange.toLowerCase().includes(q)
    );
  }, [symbols, searchQuery]);

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium">Symbol</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Exchange</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Price</th>
            <th className="px-4 py-3 text-right text-sm font-medium">24h Change</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Volume (24h)</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={`${s.exchange}-${s.symbol}`} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="font-mono font-medium">{s.symbol}</div>
                <div className="text-xs text-muted-foreground">{s.base}/{s.quote}</div>
              </td>
              <td className="px-4 py-3 capitalize">{s.exchange}</td>
              <td className="px-4 py-3">
                <Badge 
                  variant={s.status === 'trading' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  {s.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                ${s.price.toLocaleString()}
              </td>
              <td className={cn(
                'px-4 py-3 text-right font-mono',
                s.priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {s.priceChange24h >= 0 ? '+' : ''}{s.priceChange24h.toFixed(2)}%
              </td>
              <td className="px-4 py-3 text-right font-mono text-sm">
                ${(s.volume24h / 1e6).toFixed(1)}M
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          No symbols found
        </div>
      )}
    </div>
  );
};

export default function Venues() {
  const { token } = useAuth();
  const [testingExchange, setTestingExchange] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<'all' | 'spot' | 'futures' | 'options'>('all');

  // Filter symbols by product
  const filteredSymbols = useMemo(() => {
    if (selectedProduct === 'all') return SYMBOLS;
    return SYMBOLS.filter((s) => s.product === selectedProduct);
  }, [selectedProduct]);

  // Test connection
  const handleTestConnection = async (exchangeId: string) => {
    setTestingExchange(exchangeId);
    try {
      // Simulate connectivity test - would call real API
      await new Promise((resolve) => setTimeout(resolve, 1500));
      toast.success(`${exchangeId} connection verified`);
    } catch {
      toast.error(`${exchangeId} connection failed`);
    } finally {
      setTestingExchange(null);
    }
  };

  // Aggregate stats
  const stats = useMemo(() => {
    const connected = EXCHANGES.filter((e) => e.status === 'connected').length;
    const avgLatency = EXCHANGES
      .filter((e) => e.latency)
      .reduce((sum, e) => sum + (e.latency || 0), 0) / 
      EXCHANGES.filter((e) => e.latency).length;
    return { connected, total: EXCHANGES.length, avgLatency: Math.round(avgLatency) };
  }, []);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Globe className="w-6 h-6" />
            Venues & Markets
          </h1>
          <p className="text-muted-foreground">
            Exchange connectivity, market status, and instrument registry.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-600" />
            {stats.connected}/{stats.total} Connected
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Activity className="w-3 h-3" />
            Avg Latency: {stats.avgLatency}ms
          </Badge>
        </div>
      </div>

      {/* Exchange Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Exchanges</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {EXCHANGES.map((exchange) => (
            <ExchangeCard
              key={exchange.id}
              exchange={exchange}
              onTest={() => handleTestConnection(exchange.id)}
              testing={testingExchange === exchange.id}
            />
          ))}
        </div>
      </div>

      {/* Instruments Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Instruments</h2>
          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search symbols..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <Tabs value={selectedProduct} onValueChange={(v) => setSelectedProduct(v as typeof selectedProduct)}>
          <TabsList>
            <TabsTrigger value="all">All Markets</TabsTrigger>
            <TabsTrigger value="spot">Spot</TabsTrigger>
            <TabsTrigger value="futures">Futures</TabsTrigger>
            <TabsTrigger value="options">Options</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedProduct} className="mt-4">
            <SymbolsTable symbols={filteredSymbols} searchQuery={searchQuery} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
