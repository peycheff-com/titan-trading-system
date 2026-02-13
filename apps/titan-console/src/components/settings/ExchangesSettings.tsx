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

export const ExchangesSettings = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local state for form values
  interface ExchangeConfigState {
    'exchange.bybit.apiKey': string;
    'exchange.bybit.apiSecret': string;
    'exchange.bybit.testnet': boolean;
    'exchange.mexc.apiKey': string;
    'exchange.mexc.apiSecret': string;
    'exchange.kucoin.apiKey': string;
    'exchange.kucoin.apiSecret': string;
    'exchange.kucoin.apiKeyAlt': string;
    'exchange.kucoin.testnet': boolean;
  }

  const [config, setConfig] = useState<ExchangeConfigState>({
    'exchange.bybit.apiKey': '',
    'exchange.bybit.apiSecret': '',
    'exchange.bybit.testnet': false,
    'exchange.mexc.apiKey': '',
    'exchange.mexc.apiSecret': '',
    'exchange.kucoin.apiKey': '',
    'exchange.kucoin.apiSecret': '',
    'exchange.kucoin.apiKeyAlt': '', // Passphrase
    'exchange.kucoin.testnet': false,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/config/effective?key=exchange`); // Fetch all exchange.* keys if supported, or individual
      // Since backend might not support wildcard yet, let's fetch individual or catalog?
      // For now, let's hit effective for known keys in parallel or effective (all)
      const resAll = await fetch(`${API_URL}/config/effective`);
      if (!resAll.ok) throw new Error('Failed to fetch config');
      const data = await resAll.json();
      
      // Map effective values to state
      const newConfig = { ...config };
      data.configs.forEach((item: any) => {
        const key = item.key as keyof ExchangeConfigState;
        if (key in newConfig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (newConfig as any)[key] = item.value;
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

  const handleChange = (key: keyof typeof config, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Exchange Connections</CardTitle>
          <CardDescription>
            Manage API credentials and connectivity settings for supported exchanges.
            <br />
            <span className="text-yellow-500 font-medium">⚠️ Keys are stored securely in the database.</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="bybit" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="bybit">Bybit</TabsTrigger>
              <TabsTrigger value="mexc">MEXC</TabsTrigger>
              <TabsTrigger value="kucoin">KuCoin</TabsTrigger>
            </TabsList>
            
            <TabsContent value="bybit" className="space-y-4 pt-4">
              <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
                <Label htmlFor="bybit-testnet" className="flex flex-col space-y-1">
                  <span>Testnet Mode</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    Toggle between Mainnet and Testnet/Demo trading.
                  </span>
                </Label>
                <Switch
                  id="bybit-testnet"
                  checked={config['exchange.bybit.testnet']}
                  onCheckedChange={(c) => handleChange('exchange.bybit.testnet', c)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bybit-key">API Key</Label>
                <Input
                  id="bybit-key"
                  type="password"
                  value={config['exchange.bybit.apiKey']}
                  onChange={(e) => handleChange('exchange.bybit.apiKey', e.target.value)}
                  placeholder="Enter Bybit API Key"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bybit-secret">API Secret</Label>
                <Input
                  id="bybit-secret"
                  type="password"
                  value={config['exchange.bybit.apiSecret']}
                  onChange={(e) => handleChange('exchange.bybit.apiSecret', e.target.value)}
                  placeholder="Enter Bybit API Secret"
                />
              </div>
            </TabsContent>

            <TabsContent value="mexc" className="space-y-4 pt-4">
              <div className="grid gap-2">
                <Label htmlFor="mexc-key">API Key</Label>
                <Input
                  id="mexc-key"
                  type="password"
                  value={config['exchange.mexc.apiKey']}
                  onChange={(e) => handleChange('exchange.mexc.apiKey', e.target.value)}
                  placeholder="Enter MEXC API Key"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mexc-secret">API Secret</Label>
                <Input
                  id="mexc-secret"
                  type="password"
                  value={config['exchange.mexc.apiSecret']}
                  onChange={(e) => handleChange('exchange.mexc.apiSecret', e.target.value)}
                  placeholder="Enter MEXC API Secret"
                />
              </div>
            </TabsContent>

            <TabsContent value="kucoin" className="space-y-4 pt-4">
              <div className="flex items-center justify-between space-x-2 border p-4 rounded-md">
                <Label htmlFor="kucoin-testnet" className="flex flex-col space-y-1">
                  <span>Testnet Mode</span>
                  <span className="font-normal leading-snug text-muted-foreground">
                    Toggle between Mainnet and Sandbox trading.
                  </span>
                </Label>
                <Switch
                  id="kucoin-testnet"
                  checked={config['exchange.kucoin.testnet']}
                  onCheckedChange={(c) => handleChange('exchange.kucoin.testnet', c)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kucoin-key">API Key</Label>
                <Input
                  id="kucoin-key"
                  type="password"
                  value={config['exchange.kucoin.apiKey']}
                  onChange={(e) => handleChange('exchange.kucoin.apiKey', e.target.value)}
                  placeholder="Enter KuCoin API Key"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kucoin-secret">API Secret</Label>
                <Input
                  id="kucoin-secret"
                  type="password"
                  value={config['exchange.kucoin.apiSecret']}
                  onChange={(e) => handleChange('exchange.kucoin.apiSecret', e.target.value)}
                  placeholder="Enter KuCoin API Secret"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kucoin-passphrase">Passphrase</Label>
                <Input
                  id="kucoin-passphrase"
                  type="password"
                  value={config['exchange.kucoin.apiKeyAlt']} 
                  onChange={(e) => handleChange('exchange.kucoin.apiKeyAlt', e.target.value)}
                  placeholder="Enter KuCoin Passphrase"
                />
                <p className="text-xs text-muted-foreground">Required for KuCoin API (mapped to apiKeyAlt).</p>
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mt-4 border-green-500 text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
