import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Shield, Activity, Wallet, Server, Save, Globe, Database } from 'lucide-react';
import { getTitanBrainUrl } from '@/lib/api-config';
import { InfrastructureSettings } from '@/components/titan/InfrastructureSettings';

// Types matching Backend Config
interface RiskTuner {
  phase1_risk_pct: number;
  phase2_risk_pct: number;
}

interface AssetWhitelist {
  enabled: boolean;
  assets: Record<string, boolean>;
  disabled_assets: string[];
}

interface ApiKeys {
  broker: string;
  bybit_api_key?: string;
  bybit_api_secret?: string;
  mexc_api_key?: string;
  mexc_api_secret?: string;
  testnet?: boolean; // New field
  validated: boolean;
  last_validated: string | null;
  has_api_key?: boolean;
  has_api_secret?: boolean;
}

interface Fees {
  maker_fee_pct: number;
  taker_fee_pct: number;
}

interface Safety {
  max_consecutive_losses: number;
  max_daily_drawdown_pct: number;
  max_weekly_drawdown_pct: number;
  circuit_breaker_cooldown_hours: number;
}

interface System {
  rate_limit_per_sec: number;
}

interface Guardrails {
  maxLeverage: number;
  maxStopLossPct: number;
  maxRiskPerTrade: number;
  maxPositionSizePct: number;
  maxDailyDrawdownPct: number;
  maxTotalDrawdownPct: number;
  minConfidenceScore: number;
  maxConsecutiveLosses: number;
}

interface Backtester {
  bulgariaLatencyMs: number;
  bulgariaSlippagePct: number;
  minTradesForValidation: number;
  maxDrawdownIncreasePct: number;
}

interface StrategicMemory {
  maxRecords: number;
  archiveAfterDays: number;
  duplicateWindowDays: number;
  performanceTrackingDays: number;
  contextLimit: number;
}

interface Config {
  mode?: string;
  risk_tuner: RiskTuner;
  asset_whitelist: AssetWhitelist;
  api_keys: ApiKeys;
  fees?: Fees;
  safety?: Safety;
  system?: System;
  guardrails?: Guardrails;
  backtester?: Backtester;
  strategic_memory?: StrategicMemory;
}

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);

  // Form states to track changes locally before save
  const [localRisk, setLocalRisk] = useState<RiskTuner | null>(null);
  const [localWhitelist, setLocalWhitelist] = useState<AssetWhitelist | null>(null);
  const [localApiKey, setLocalApiKey] = useState('');
  const [localApiSecret, setLocalApiSecret] = useState('');
  const [localBroker, setLocalBroker] = useState('BYBIT');

  // New local states
  const [localFees, setLocalFees] = useState<Fees | null>(null);
  const [localSafety, setLocalSafety] = useState<Safety | null>(null);
  const [localSystem, setLocalSystem] = useState<System | null>(null);
  const [localGuardrails, setLocalGuardrails] = useState<Guardrails | null>(null);
  const [localBacktester, setLocalBacktester] = useState<Backtester | null>(null);
  const [localMemory, setLocalMemory] = useState<StrategicMemory | null>(null);
  const [localApiKeys, setLocalApiKeys] = useState<ApiKeys | null>(null);

  const TITAN_EXECUTION_URL = getTitanBrainUrl();

  const fetchConfig = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${TITAN_EXECUTION_URL}/api/config/current`);
      if (!response.ok) throw new Error('Failed to fetch config');
      const data = await response.json();

      setConfig(data);
      setLocalRisk(data.risk_tuner);
      setLocalWhitelist(data.asset_whitelist);
      setLocalBroker(data.api_keys.broker);

      // Initialize new sections or defaults if missing
      setLocalFees(data.fees || { maker_fee_pct: 0.0002, taker_fee_pct: 0.0005 });
      setLocalSafety(
        data.safety || {
          max_consecutive_losses: 10,
          max_daily_drawdown_pct: 0.05,
          max_weekly_drawdown_pct: 0.1,
          circuit_breaker_cooldown_hours: 1,
        },
      );
      setLocalSystem(data.system || { rate_limit_per_sec: 10 });
      setLocalGuardrails(
        data.guardrails || {
          maxLeverage: 20,
          maxStopLossPct: 5,
          maxRiskPerTrade: 5,
          maxPositionSizePct: 50,
          maxDailyDrawdownPct: 10,
          maxTotalDrawdownPct: 20,
          minConfidenceScore: 0.5,
          maxConsecutiveLosses: 10,
        },
      );
      setLocalBacktester(
        data.backtester || {
          bulgariaLatencyMs: 200,
          bulgariaSlippagePct: 0.2,
          minTradesForValidation: 10,
          maxDrawdownIncreasePct: 10,
        },
      );
      setLocalMemory(
        data.strategic_memory || {
          maxRecords: 10000,
          archiveAfterDays: 90,
          duplicateWindowDays: 30,
          performanceTrackingDays: 7,
          contextLimit: 10,
        },
      );
      // Initialize API Keys state
      setLocalApiKeys(
        data.api_keys || {
          broker: 'BYBIT',
          testnet: false,
          validated: false,
          last_validated: null,
        },
      );
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error loading settings',
        description: 'Could not connect to Titan Execution service.',
      });
    } finally {
      setLoading(false);
    }
  }, [TITAN_EXECUTION_URL, toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (section: string, updates: unknown) => {
    try {
      setSaving(true);
      const payload = { [section]: updates };

      const response = await fetch(`${TITAN_EXECUTION_URL}/api/config/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Update failed');
      }

      toast({
        title: 'Settings Saved',
        description: `${section.replace('_', ' ')} updated successfully.`,
      });

      // Refresh config to get latest state (e.g. valid flags)
      await fetchConfig();
      // Clear sensitive fields if broker update
      if (section === 'broker') {
        setLocalApiKey('');
        setLocalApiSecret('');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: errorMessage,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRiskSave = () => {
    if (localRisk) saveConfig('risk_tuner', localRisk);
  };

  const handleWhitelistSave = () => {
    if (localWhitelist) saveConfig('asset_whitelist', localWhitelist);
  };

  const handleBrokerSave = () => {
    saveConfig('broker', {
      name: localBroker,
      apiKey: localApiKey,
      apiSecret: localApiSecret,
    });
  };

  const handleFeesSave = () => {
    if (localFees) saveConfig('fees', localFees);
  };

  const handleSafetySave = () => {
    if (localSafety) saveConfig('safety', localSafety);
  };

  const handleSystemSave = () => {
    if (localSystem) saveConfig('system', localSystem);
    if (localMemory) saveConfig('strategic_memory', localMemory);
  };

  const handleGuardrailsSave = () => {
    if (localGuardrails) saveConfig('guardrails', localGuardrails);
  };

  const handleBacktesterSave = () => {
    if (localBacktester) saveConfig('backtester', localBacktester);
  };

  const handleApiKeysSave = () => {
    if (localApiKeys) saveConfig('api_keys', localApiKeys);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center text-muted-foreground">Loading Configuration...</div>
    );
  }

  if (!config || !localRisk || !localWhitelist) {
    return (
      <div className="p-8 flex justify-center text-destructive">
        Failed to load configuration. Check backend connection.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your Titan Execution configuration, risk parameters, and connections.
        </p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:w-[600px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="risk">Risk</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="safety">Safety</TabsTrigger>
          <TabsTrigger value="backtester">Simulation</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="infra" className="text-orange-500">
            Infrastructure
          </TabsTrigger>
          <TabsTrigger value="connections" className="text-blue-400">
            Connections
          </TabsTrigger>
        </TabsList>

        {/* GENERAL TAB */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" /> System Status
              </CardTitle>
              <CardDescription>General system information and mode settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Trading Mode</Label>
                  <div className="text-sm text-muted-foreground">
                    Current mode:{' '}
                    <span className="font-mono font-semibold">{config.mode || 'UNKNOWN'}</span>
                  </div>
                </div>
                {/* Mode is usually env var driven, but if we allow override: */}
                <Select
                  value={config.mode || 'MOCK'}
                  onValueChange={(val: string) => saveConfig('mode', val)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MOCK">MOCK (Paper)</SelectItem>
                    <SelectItem value="LIVE">LIVE (Real Money)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RISK TAB */}
        <TabsContent value="risk">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Risk Management
              </CardTitle>
              <CardDescription>Configure risk percentages and global guardrails.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <h3 className="font-semibold text-sm uppercase text-muted-foreground">Phases</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Phase 1 (Kickstarter) Risk %</Label>
                      <span className="font-mono text-sm">
                        {(localRisk.phase1_risk_pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Slider
                      value={[localRisk.phase1_risk_pct * 100]}
                      min={1}
                      max={20}
                      step={0.5}
                      onValueChange={(val: number[]) =>
                        setLocalRisk({ ...localRisk, phase1_risk_pct: val[0] / 100 })
                      }
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Phase 2 (Trend Rider) Risk %</Label>
                      <span className="font-mono text-sm">
                        {(localRisk.phase2_risk_pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Slider
                      value={[localRisk.phase2_risk_pct * 100]}
                      min={1}
                      max={10}
                      step={0.5}
                      onValueChange={(val: number[]) =>
                        setLocalRisk({ ...localRisk, phase2_risk_pct: val[0] / 100 })
                      }
                    />
                  </div>
                </div>

                {localGuardrails && (
                  <div className="space-y-6 border-l pl-6">
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground">
                      Guardrails (Hard Limits)
                    </h3>

                    <div className="space-y-2">
                      <Label>Max Leverage (x)</Label>
                      <Input
                        type="number"
                        value={localGuardrails.maxLeverage}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalGuardrails({
                            ...localGuardrails,
                            maxLeverage: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Max Position Size %</Label>
                      <Input
                        type="number"
                        value={localGuardrails.maxPositionSizePct}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalGuardrails({
                            ...localGuardrails,
                            maxPositionSizePct: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Min Confidence Score (0-1)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={localGuardrails.minConfidenceScore}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalGuardrails({
                            ...localGuardrails,
                            minConfidenceScore: parseFloat(e.target.value) || 0.1,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button onClick={handleRiskSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Risk Phases
              </Button>
              <Button onClick={handleGuardrailsSave} variant="secondary" disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Guardrails
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* FEES TAB */}
        <TabsContent value="fees">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" /> Trading Fees
              </CardTitle>
              <CardDescription>
                Configure Exchange Fees (affects limit chaser thresholds).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {localFees && (
                <>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Maker Fee %</Label>
                      <span className="font-mono text-sm">
                        {(localFees.maker_fee_pct * 100).toFixed(4)}%
                      </span>
                    </div>
                    <Slider
                      value={[localFees.maker_fee_pct * 100]}
                      min={0}
                      max={0.2}
                      step={0.001}
                      onValueChange={(val: number[]) =>
                        setLocalFees({ ...localFees, maker_fee_pct: val[0] / 100 })
                      }
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Taker Fee %</Label>
                      <span className="font-mono text-sm">
                        {(localFees.taker_fee_pct * 100).toFixed(4)}%
                      </span>
                    </div>
                    <Slider
                      value={[localFees.taker_fee_pct * 100]}
                      min={0}
                      max={0.2}
                      step={0.001}
                      onValueChange={(val: number[]) =>
                        setLocalFees({ ...localFees, taker_fee_pct: val[0] / 100 })
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleFeesSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Fees
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* SAFETY TAB */}
        <TabsContent value="safety">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" /> Safety Gates
              </CardTitle>
              <CardDescription>Configure circuit breakers and drawdown protection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {localSafety && (
                <>
                  <div className="space-y-2">
                    <Label>Max Consecutive Losses</Label>
                    <Input
                      type="number"
                      value={localSafety.max_consecutive_losses}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setLocalSafety({
                          ...localSafety,
                          max_consecutive_losses: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Trigger circuit breaker after N consecutive losses.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Max Daily Drawdown %</Label>
                      <span className="font-mono text-sm">
                        {(localSafety.max_daily_drawdown_pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Slider
                      value={[localSafety.max_daily_drawdown_pct * 100]}
                      min={1}
                      max={20}
                      step={0.5}
                      onValueChange={(val: number[]) =>
                        setLocalSafety({ ...localSafety, max_daily_drawdown_pct: val[0] / 100 })
                      }
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Max Weekly Drawdown %</Label>
                      <span className="font-mono text-sm">
                        {(localSafety.max_weekly_drawdown_pct * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Slider
                      value={[localSafety.max_weekly_drawdown_pct * 100]}
                      min={1}
                      max={30}
                      step={0.5}
                      onValueChange={(val: number[]) =>
                        setLocalSafety({ ...localSafety, max_weekly_drawdown_pct: val[0] / 100 })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Use Cooldown (Hours)</Label>
                    <Input
                      type="number"
                      value={localSafety.circuit_breaker_cooldown_hours}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setLocalSafety({
                          ...localSafety,
                          circuit_breaker_cooldown_hours: parseInt(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleSafetySave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Safety Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* BACKTESTER TAB */}
        <TabsContent value="backtester">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" /> Simulation & Backtesting
              </CardTitle>
              <CardDescription>
                Configure "Bulgaria Mode" parameters for realistic simulation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {localBacktester && (
                <>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Simulated Latency (ms)</Label>
                      <span className="font-mono text-sm">
                        {localBacktester.bulgariaLatencyMs}ms
                      </span>
                    </div>
                    <Slider
                      value={[localBacktester.bulgariaLatencyMs]}
                      min={0}
                      max={2000}
                      step={10}
                      onValueChange={(val: number[]) =>
                        setLocalBacktester({ ...localBacktester, bulgariaLatencyMs: val[0] })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Artificial delay added to order execution in backtests.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <Label>Simulated Slippage %</Label>
                      <span className="font-mono text-sm">
                        {localBacktester.bulgariaSlippagePct}%
                      </span>
                    </div>
                    <Slider
                      value={[localBacktester.bulgariaSlippagePct]}
                      min={0}
                      max={5}
                      step={0.1}
                      onValueChange={(val: number[]) =>
                        setLocalBacktester({ ...localBacktester, bulgariaSlippagePct: val[0] })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Price slippage penalty applied to backtest trades.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleBacktesterSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Simulation Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ASSETS TAB (Moved down) */}
        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" /> Asset Whitelist
              </CardTitle>
              <CardDescription>Select which assets are eligible for trading.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="whitelist-enabled"
                  checked={localWhitelist.enabled}
                  onCheckedChange={(checked: boolean) =>
                    setLocalWhitelist({ ...localWhitelist, enabled: checked })
                  }
                />
                <Label htmlFor="whitelist-enabled">Enable Whitelist Enforcement</Label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                {Object.entries(localWhitelist.assets).map(([asset, enabled]) => (
                  <div key={asset} className="flex items-center space-x-2 border p-3 rounded-md">
                    <Checkbox
                      id={`asset-${asset}`}
                      checked={enabled}
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        const newAssets = { ...localWhitelist.assets, [asset]: !!checked };
                        setLocalWhitelist({ ...localWhitelist, assets: newAssets });
                      }}
                    />
                    <Label htmlFor={`asset-${asset}`} className="cursor-pointer font-mono">
                      {asset}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleWhitelistSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save Whitelist
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* SYSTEM TAB */}
        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" /> System Parameters
              </CardTitle>
              <CardDescription>Advanced system configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {localSystem && (
                <>
                  <div className="space-y-2">
                    <Label>Rate Limit (Requests Per Second)</Label>
                    <Input
                      type="number"
                      value={localSystem.rate_limit_per_sec}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setLocalSystem({
                          ...localSystem,
                          rate_limit_per_sec: parseInt(e.target.value) || 10,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Max requests per second for Order Manager.
                    </p>
                  </div>
                </>
              )}

              {localMemory && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold text-sm uppercase text-muted-foreground">
                    Strategic Memory
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Max Records</Label>
                      <Input
                        type="number"
                        value={localMemory.maxRecords}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalMemory({
                            ...localMemory,
                            maxRecords: parseInt(e.target.value) || 1000,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Archive After (Days)</Label>
                      <Input
                        type="number"
                        value={localMemory.archiveAfterDays}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalMemory({
                            ...localMemory,
                            archiveAfterDays: parseInt(e.target.value) || 90,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleSystemSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Save System Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* INFRASTRUCTURE TAB */}
        <TabsContent value="infra">
          <InfrastructureSettings />
        </TabsContent>

        {/* CONNECTIONS TAB */}
        <TabsContent value="connections">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" /> Exchange Connections
              </CardTitle>
              <CardDescription>Manage API keys and environment (Testnet/Mainnet).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {localApiKeys && (
                <>
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/10">
                    <div className="space-y-0.5">
                      <Label className="text-base">Testnet Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Toggle between Bybit Testnet (Paper Trading) and Mainnet (Real Money).
                      </p>
                    </div>
                    <Switch
                      checked={localApiKeys.testnet}
                      onCheckedChange={(checked: boolean) =>
                        setLocalApiKeys({ ...localApiKeys, testnet: checked })
                      }
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground">
                      Bybit Credentials
                    </h3>

                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        value={localApiKeys.bybit_api_key || ''}
                        placeholder="Masked"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalApiKeys({ ...localApiKeys, bybit_api_key: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>API Secret</Label>
                      <Input
                        type="password"
                        value={localApiKeys.bybit_api_secret || ''}
                        placeholder="Masked"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setLocalApiKeys({ ...localApiKeys, bybit_api_secret: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${localApiKeys.validated ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    <span className="text-sm text-muted-foreground">
                      {localApiKeys.validated
                        ? `Connected (Last checked: ${localApiKeys.last_validated ? new Date(localApiKeys.last_validated).toLocaleString() : 'Never'})`
                        : 'Not Validated / Disconnected'}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleApiKeysSave} disabled={saving} variant="default">
                <Save className="mr-2 h-4 w-4" /> Update Credentials
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* BROKER TAB */}
        <TabsContent value="broker">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" /> Broker Connection
              </CardTitle>
              <CardDescription>Configure your exchange API keys.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg bg-secondary p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-none">Connection Status</p>
                  <p className="text-sm text-muted-foreground">
                    {config.api_keys.validated ? 'Connected & Validated' : 'Not Validated'}
                  </p>
                </div>
                <div
                  className={`h-3 w-3 rounded-full ${config.api_keys.validated ? 'bg-green-500' : 'bg-red-500'}`}
                />
              </div>

              <div className="space-y-2">
                <Label>Exchange</Label>
                <Select value={localBroker} onValueChange={setLocalBroker}>
                  <SelectTrigger disabled>
                    <SelectValue placeholder="Select broker" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BYBIT">Bybit</SelectItem>
                    <SelectItem value="MEXC">MEXC</SelectItem>
                    <SelectItem value="BINANCE">Binance</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Currently locked to BYBIT/MEXC in ConfigSchema.
                </p>
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={localApiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalApiKey(e.target.value)}
                  placeholder={config.api_keys.has_api_key ? '••••••••••••••••' : 'Enter API Key'}
                />
              </div>

              <div className="space-y-2">
                <Label>API Secret</Label>
                <Input
                  type="password"
                  value={localApiSecret}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalApiSecret(e.target.value)}
                  placeholder={
                    config.api_keys.has_api_secret ? '••••••••••••••••' : 'Enter API Secret'
                  }
                />
              </div>

              <div className="rounded-md bg-yellow-500/10 p-4 border border-yellow-500/20">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-500">Security Warning</h3>
                    <div className="text-sm text-yellow-500/90 mt-2">
                      <p>
                        API Keys are stored in memory. They may be lost if the service restarts
                        unless configured in environment variables.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleBrokerSave}
                disabled={saving || !localApiKey || !localApiSecret}
              >
                <Save className="mr-2 h-4 w-4" /> Update Keys
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
