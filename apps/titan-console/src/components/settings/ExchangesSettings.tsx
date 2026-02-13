import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const API_URL = import.meta.env.VITE_TITAN_API_URL || 'http://localhost:3100';

interface ConfigOverride {
  key: string;
  value: any;
  reason: string;
}

// -------------------------------------------------------------------
// Exchange definitions — single source of truth for all 15 adapters
// -------------------------------------------------------------------
interface ExchangeDef {
  id: string;
  label: string;
  type: 'cex' | 'dex';
  hasPassphrase?: boolean;
  hasRpcUrl?: boolean;
  hasWalletPubkey?: boolean;
  secretLabel?: string;
}

const EXCHANGES: ExchangeDef[] = [
  // CEX
  { id: 'binance',    label: 'Binance',     type: 'cex' },
  { id: 'bybit',      label: 'Bybit',       type: 'cex' },
  { id: 'mexc',       label: 'MEXC',        type: 'cex' },
  { id: 'okx',        label: 'OKX',         type: 'cex' },
  { id: 'coinbase',   label: 'Coinbase',    type: 'cex' },
  { id: 'kraken',     label: 'Kraken',      type: 'cex' },
  { id: 'kucoin',     label: 'KuCoin',      type: 'cex', hasPassphrase: true },
  { id: 'gateio',     label: 'Gate.io',     type: 'cex' },
  { id: 'cryptocom',  label: 'Crypto.com',  type: 'cex' },
  { id: 'dydx',       label: 'dYdX v4',     type: 'cex' },
  // DEX
  { id: 'uniswap',     label: 'Uniswap',      type: 'dex', secretLabel: 'Private Key', hasRpcUrl: true },
  { id: 'pancakeswap', label: 'PancakeSwap',   type: 'dex', secretLabel: 'Private Key', hasRpcUrl: true },
  { id: 'sushiswap',   label: 'SushiSwap',     type: 'dex', secretLabel: 'Private Key', hasRpcUrl: true },
  { id: 'curve',       label: 'Curve',         type: 'dex', secretLabel: 'Private Key', hasRpcUrl: true },
  { id: 'jupiter',     label: 'Jupiter',       type: 'dex', secretLabel: 'Private Key (base58)', hasRpcUrl: true, hasWalletPubkey: true },
];

const CEX_EXCHANGES = EXCHANGES.filter(e => e.type === 'cex');
const DEX_EXCHANGES = EXCHANGES.filter(e => e.type === 'dex');

// Build initial config state from exchange definitions
function buildInitialConfig(): Record<string, string | boolean> {
  const cfg: Record<string, string | boolean> = {};
  for (const ex of EXCHANGES) {
    cfg[`exchange.${ex.id}.apiKey`] = '';
    cfg[`exchange.${ex.id}.apiSecret`] = '';
    cfg[`exchange.${ex.id}.testnet`] = false;
    if (ex.hasPassphrase) cfg[`exchange.${ex.id}.apiKeyAlt`] = '';
    if (ex.hasRpcUrl)     cfg[`exchange.${ex.id}.rpcUrl`] = '';
    if (ex.hasWalletPubkey) cfg[`exchange.${ex.id}.walletPubkey`] = '';
  }
  return cfg;
}

export const ExchangesSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, string | boolean>>(buildInitialConfig);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const resAll = await fetch(`${API_URL}/config/effective`);
      if (!resAll.ok) throw new Error('Failed to fetch config');
      const data = await resAll.json();
      
      const newConfig = { ...config };
      data.configs.forEach((item: any) => {
        if (item.key in newConfig) {
          (newConfig as any)[item.key] = item.value;
        }
      });
      setConfig(newConfig);
    } catch (err) {
      console.error(err);
      setError('Failed to load exchange settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const overrides: ConfigOverride[] = Object.entries(config).map(([key, value]) => ({
      key,
      value,
      reason: 'Updated via Titan Console Settings',
    }));

    try {
      const res = await fetch(`${API_URL}/config/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save settings');
      }

      setSuccess('Exchange settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  /** Render tab content for a single exchange */
  const renderExchangeTab = (ex: ExchangeDef) => (
    <TabsContent key={ex.id} value={ex.id} className="space-y-4 pt-4">
      {/* Testnet toggle */}
      <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
        <Label htmlFor={`${ex.id}-testnet`} className="flex flex-col space-y-1">
          <span>Testnet Mode</span>
          <span className="font-normal leading-snug text-muted-foreground">
            Toggle between Mainnet and {ex.type === 'dex' ? 'Testnet' : 'Testnet/Demo'} trading.
          </span>
        </Label>
        <Switch
          id={`${ex.id}-testnet`}
          checked={config[`exchange.${ex.id}.testnet`] as boolean}
          onCheckedChange={(c) => handleChange(`exchange.${ex.id}.testnet`, c)}
        />
      </div>

      {/* API Key / Wallet Address */}
      <div className="grid gap-2">
        <Label htmlFor={`${ex.id}-key`}>{ex.type === 'dex' ? 'Wallet Address' : 'API Key'}</Label>
        <Input
          id={`${ex.id}-key`}
          type="password"
          value={config[`exchange.${ex.id}.apiKey`] as string}
          onChange={(e) => handleChange(`exchange.${ex.id}.apiKey`, e.target.value)}
          placeholder={`Enter ${ex.label} ${ex.type === 'dex' ? 'Wallet Address' : 'API Key'}`}
        />
      </div>

      {/* API Secret / Private Key */}
      <div className="grid gap-2">
        <Label htmlFor={`${ex.id}-secret`}>{ex.secretLabel || 'API Secret'}</Label>
        <Input
          id={`${ex.id}-secret`}
          type="password"
          value={config[`exchange.${ex.id}.apiSecret`] as string}
          onChange={(e) => handleChange(`exchange.${ex.id}.apiSecret`, e.target.value)}
          placeholder={`Enter ${ex.label} ${ex.secretLabel || 'API Secret'}`}
        />
      </div>

      {/* Passphrase (KuCoin) */}
      {ex.hasPassphrase && (
        <div className="grid gap-2">
          <Label htmlFor={`${ex.id}-passphrase`}>Passphrase</Label>
          <Input
            id={`${ex.id}-passphrase`}
            type="password"
            value={config[`exchange.${ex.id}.apiKeyAlt`] as string}
            onChange={(e) => handleChange(`exchange.${ex.id}.apiKeyAlt`, e.target.value)}
            placeholder={`Enter ${ex.label} Passphrase`}
          />
          <p className="text-xs text-muted-foreground">Required for {ex.label} API.</p>
        </div>
      )}

      {/* RPC URL (DEX) */}
      {ex.hasRpcUrl && (
        <div className="grid gap-2">
          <Label htmlFor={`${ex.id}-rpc`}>RPC URL</Label>
          <Input
            id={`${ex.id}-rpc`}
            type="text"
            value={config[`exchange.${ex.id}.rpcUrl`] as string}
            onChange={(e) => handleChange(`exchange.${ex.id}.rpcUrl`, e.target.value)}
            placeholder={`Enter ${ex.label} RPC endpoint (optional — uses default)`}
          />
          <p className="text-xs text-muted-foreground">Leave empty to use default public RPC.</p>
        </div>
      )}

      {/* Wallet Pubkey (Jupiter/Solana) */}
      {ex.hasWalletPubkey && (
        <div className="grid gap-2">
          <Label htmlFor={`${ex.id}-pubkey`}>Wallet Public Key</Label>
          <Input
            id={`${ex.id}-pubkey`}
            type="text"
            value={config[`exchange.${ex.id}.walletPubkey`] as string}
            onChange={(e) => handleChange(`exchange.${ex.id}.walletPubkey`, e.target.value)}
            placeholder="Enter Solana wallet public key (base58)"
          />
        </div>
      )}
    </TabsContent>
  );

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* CEX Exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>CEX Exchanges</CardTitle>
          <CardDescription>
            Centralized exchange API credentials for {CEX_EXCHANGES.length} adapters.
            <br />
            <span className="text-yellow-500 font-medium">⚠️ Keys are stored securely in the database.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="binance" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              {CEX_EXCHANGES.slice(0, 5).map(ex => (
                <TabsTrigger key={ex.id} value={ex.id}>{ex.label}</TabsTrigger>
              ))}
            </TabsList>
            <TabsList className="grid w-full grid-cols-5 mt-1">
              {CEX_EXCHANGES.slice(5).map(ex => (
                <TabsTrigger key={ex.id} value={ex.id}>{ex.label}</TabsTrigger>
              ))}
            </TabsList>
            {CEX_EXCHANGES.map(renderExchangeTab)}
          </Tabs>
        </CardContent>
      </Card>

      {/* DEX Exchanges */}
      <Card>
        <CardHeader>
          <CardTitle>DEX Exchanges</CardTitle>
          <CardDescription>
            Decentralized exchange wallet credentials for {DEX_EXCHANGES.length} adapters across Ethereum, BNB Chain, and Solana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="uniswap" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              {DEX_EXCHANGES.map(ex => (
                <TabsTrigger key={ex.id} value={ex.id}>{ex.label}</TabsTrigger>
              ))}
            </TabsList>
            {DEX_EXCHANGES.map(renderExchangeTab)}
          </Tabs>
        </CardContent>
      </Card>

      {/* Status alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500 text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save All Exchange Settings
        </Button>
      </div>
    </div>
  );
};
