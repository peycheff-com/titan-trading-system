import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  Activity,
  Wallet,
  Server,
  Zap,
  TrendingUp,
  BarChart3,
  Globe,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
import { InfrastructureSettings } from '@/components/titan/InfrastructureSettings';
import { ExchangesSettings } from '@/components/settings/ExchangesSettings';
import { IntelligenceSettings } from '@/components/settings/IntelligenceSettings';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { ConfigItemRenderer } from '@/components/settings/ConfigItemRenderer';
import {
  useConfigCatalog,
  useEffectiveConfig,
  useConfigOverrides,
  useConfigPresets,
} from '@/hooks/useConfig';
import type { ConfigItem, EffectiveConfig } from '@/hooks/useConfig';

// Category icons and tab mapping
const CATEGORY_META: Record<string, { icon: React.ReactNode; tab: string; order: number }> = {
  'Capital':          { icon: <Wallet className="h-4 w-4" />,          tab: 'trading',   order: 0 },
  'Risk':             { icon: <Shield className="h-4 w-4" />,          tab: 'trading',   order: 1 },
  'Fees':             { icon: <Wallet className="h-4 w-4" />,          tab: 'trading',   order: 2 },
  'Phase Risk':       { icon: <TrendingUp className="h-4 w-4" />,      tab: 'trading',   order: 3 },
  'Circuit Breaker':  { icon: <AlertTriangle className="h-4 w-4" />,   tab: 'safety',    order: 0 },
  'Safety':           { icon: <Shield className="h-4 w-4" />,          tab: 'safety',    order: 1 },
  'Trading Limits':   { icon: <Gauge className="h-4 w-4" />,           tab: 'safety',    order: 2 },
  'Market Sentiment': { icon: <BarChart3 className="h-4 w-4" />,       tab: 'execution', order: 0 },
  'Execution':        { icon: <Zap className="h-4 w-4" />,             tab: 'execution', order: 1 },
  'Exchanges':        { icon: <Globe className="h-4 w-4" />,           tab: 'exchanges', order: 0 },
};

// Render a category card with its items
function CategoryCard({
  category,
  items,
  effectiveMap,
  onSave,
  onRollback,
  saving,
}: {
  category: string;
  items: ConfigItem[];
  effectiveMap: Map<string, EffectiveConfig>;
  onSave: (key: string, value: unknown, reason: string) => Promise<{ success: boolean; error?: string }>;
  onRollback: (key: string) => Promise<{ success: boolean; error?: string }>;
  saving: boolean;
}) {
  const meta = CATEGORY_META[category];
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          {meta?.icon || <Activity className="h-4 w-4" />}
          {category}
        </CardTitle>
        <CardDescription>{items.length} parameter{items.length !== 1 ? 's' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((item) => (
          <ConfigItemRenderer
            key={item.key}
            item={item}
            effective={effectiveMap.get(item.key)}
            onSave={onSave}
            onRollback={onRollback}
            saving={saving}
          />
        ))}
      </CardContent>
    </Card>
  );
}

const Settings = () => {
  const { toast } = useToast();
  const { grouped, loading: catalogLoading } = useConfigCatalog();
  const { configs, loading: effectiveLoading, refetch: refetchEffective } = useEffectiveConfig();
  const { createOverride, rollbackOverride } = useConfigOverrides();
  const { presets, applying, applyPreset } = useConfigPresets();
  const [saving, setSaving] = useState(false);

  // Build effective config lookup map
  const effectiveMap = new Map<string, EffectiveConfig>();
  for (const cfg of configs) {
    effectiveMap.set(cfg.key, cfg);
  }

  // Save handler
  const handleSave = async (key: string, value: unknown, reason: string) => {
    setSaving(true);
    const result = await createOverride(key, value, reason);
    setSaving(false);
    if (result.success) {
      toast({ title: 'Saved', description: `${key} updated successfully.` });
      await refetchEffective();
    } else {
      toast({ variant: 'destructive', title: 'Save Failed', description: result.error || 'Unknown error' });
    }
    return result;
  };

  // Rollback handler
  const handleRollback = async (key: string) => {
    const result = await rollbackOverride(key);
    if (result.success) {
      toast({ title: 'Rolled Back', description: `${key} restored to default.` });
      await refetchEffective();
    } else {
      toast({ variant: 'destructive', title: 'Rollback Failed', description: result.error || 'Unknown error' });
    }
    return result;
  };

  // Preset handler
  const handleApplyPreset = async (name: string) => {
    const result = await applyPreset(name);
    if (result.success) {
      toast({ title: 'Preset Applied', description: `${name} profile applied successfully.` });
      await refetchEffective();
    } else {
      toast({ variant: 'destructive', title: 'Preset Failed', description: result.error || 'Some parameters failed' });
    }
  };

  // Group categories by tab
  const getTabCategories = (tab: string): string[] => {
    return Object.entries(CATEGORY_META)
      .filter(([, meta]) => meta.tab === tab)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([cat]) => cat)
      .filter((cat) => grouped[cat] && grouped[cat].length > 0);
  };

  const loading = catalogLoading || effectiveLoading;

  if (loading) {
    return (
      <div className="p-8 flex justify-center text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          Loading Configuration Catalog...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage trading parameters, risk limits, and system configuration.
        </p>
      </div>

      <Tabs defaultValue="trading" className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 h-auto">
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="safety">Safety</TabsTrigger>
          <TabsTrigger value="execution">Execution</TabsTrigger>
          <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
          <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="infra">Infra</TabsTrigger>
        </TabsList>

        {/* TRADING TAB */}
        <TabsContent value="trading" className="space-y-6">
          {/* Preset Profiles */}
          {presets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Quick Presets
                </CardTitle>
                <CardDescription>Apply a pre-defined risk profile in one click</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {presets.map((preset) => (
                  <Button
                    key={preset.name}
                    variant="outline"
                    disabled={applying}
                    onClick={() => handleApplyPreset(preset.name)}
                    className="flex items-center gap-2"
                  >
                    <Badge variant="secondary" className="text-xs">
                      {Object.keys(preset.overrides).length}
                    </Badge>
                    <span className="font-semibold">{preset.label}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      — {preset.description}
                    </span>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Category cards */}
          {getTabCategories('trading').map((cat) => (
            <CategoryCard
              key={cat}
              category={cat}
              items={grouped[cat]}
              effectiveMap={effectiveMap}
              onSave={handleSave}
              onRollback={handleRollback}
              saving={saving}
            />
          ))}
        </TabsContent>

        {/* SAFETY TAB */}
        <TabsContent value="safety" className="space-y-6">
          {getTabCategories('safety').map((cat) => (
            <CategoryCard
              key={cat}
              category={cat}
              items={grouped[cat]}
              effectiveMap={effectiveMap}
              onSave={handleSave}
              onRollback={handleRollback}
              saving={saving}
            />
          ))}
        </TabsContent>

        {/* EXECUTION TAB */}
        <TabsContent value="execution" className="space-y-6">
          {getTabCategories('execution').map((cat) => (
            <CategoryCard
              key={cat}
              category={cat}
              items={grouped[cat]}
              effectiveMap={effectiveMap}
              onSave={handleSave}
              onRollback={handleRollback}
              saving={saving}
            />
          ))}
        </TabsContent>

        {/* EXCHANGES TAB */}
        <TabsContent value="exchanges">
          <ExchangesSettings />
        </TabsContent>

        {/* INTELLIGENCE TAB */}
        <TabsContent value="intelligence">
          <IntelligenceSettings />
        </TabsContent>

        {/* NOTIFICATIONS TAB */}
        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>

        {/* INFRA TAB */}
        <TabsContent value="infra">
          <InfrastructureSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
