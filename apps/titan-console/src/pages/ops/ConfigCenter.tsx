/**
 * ConfigCenter - Central Configuration Management Page
 * 
 * Features:
 * - Category navigation sidebar
 * - Schema-driven form rendering
 * - Effective value display with provenance
 * - Override creation with expiry
 * - Audit log display
 */
import React, { useState, useMemo } from 'react';
import { Settings2, Search, Clock, Shield, AlertTriangle, CheckCircle2, RotateCcw, History } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ConfigSchemaForm } from '@/components/titan/ConfigSchemaForm';
import { 
  useConfigCatalog, 
  useEffectiveConfig, 
  useConfigOverrides,
  useConfigReceipts,
  type ConfigItem,
  type EffectiveConfig 
} from '@/hooks/useConfig';

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Risk': <Shield className="w-4 h-4" />,
  'Circuit Breaker': <AlertTriangle className="w-4 h-4" />,
  'Phases': <Settings2 className="w-4 h-4" />,
  'Fees': <Clock className="w-4 h-4" />,
  'System': <AlertTriangle className="w-4 h-4 text-red-500" />,
};

// Risk presets for one-click configuration
interface Preset {
  name: string;
  description: string;
  color: string;
  values: Record<string, unknown>;
}

const PRESETS: Preset[] = [
  {
    name: 'Normal',
    description: 'Standard operating parameters',
    color: 'bg-green-500',
    values: {
      'risk.maxAccountLeverage': 3,
      'risk.maxPositionSize': 0.1,
      'risk.maxDailyLoss': 0.05,
      'breaker.volatilityThreshold': 0.1,
      'breaker.enabled': true,
    },
  },
  {
    name: 'Cautious',
    description: 'Reduced risk exposure',
    color: 'bg-yellow-500',
    values: {
      'risk.maxAccountLeverage': 2,
      'risk.maxPositionSize': 0.05,
      'risk.maxDailyLoss': 0.03,
      'breaker.volatilityThreshold': 0.07,
      'breaker.enabled': true,
    },
  },
  {
    name: 'Defensive',
    description: 'Minimal risk, capital preservation',
    color: 'bg-orange-500',
    values: {
      'risk.maxAccountLeverage': 1,
      'risk.maxPositionSize': 0.02,
      'risk.maxDailyLoss': 0.01,
      'breaker.volatilityThreshold': 0.05,
      'breaker.enabled': true,
    },
  },
  {
    name: 'Emergency',
    description: 'Trading paused, all limits at minimum',
    color: 'bg-red-500',
    values: {
      'risk.maxAccountLeverage': 0,
      'risk.maxPositionSize': 0,
      'risk.maxDailyLoss': 0,
      'breaker.volatilityThreshold': 0.01,
      'breaker.enabled': true,
    },
  },
];

// Override dialog component
interface OverrideDialogProps {
  item: ConfigItem;
  currentValue: unknown;
  newValue: unknown;
  onConfirm: (reason: string, expiresInHours: number) => Promise<void>;
  onCancel: () => void;
  open: boolean;
}

const OverrideDialog: React.FC<OverrideDialogProps> = ({
  item,
  currentValue,
  newValue,
  onConfirm,
  onCancel,
  open,
}) => {
  const [reason, setReason] = useState('');
  const [expiresIn, setExpiresIn] = useState('4');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.error('Reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(reason, parseInt(expiresIn));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply Configuration Override</DialogTitle>
          <DialogDescription>
            Override <span className="font-mono font-bold">{item.key}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 my-4">
          <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted">
            <div>
              <Label className="text-xs text-muted-foreground">Current Value</Label>
              <div className="font-mono text-sm">{JSON.stringify(currentValue)}</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">New Value</Label>
              <div className="font-mono text-sm font-bold text-blue-600">{JSON.stringify(newValue)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why are you making this change?"
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Expires In</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="4">4 hours</SelectItem>
                <SelectItem value="8">8 hours</SelectItem>
                <SelectItem value="24">24 hours</SelectItem>
                <SelectItem value="168">1 week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {item.safety === 'tighten_only' && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-100 text-amber-800 text-xs">
              <AlertTriangle className="w-4 h-4" />
              Tighten-only: Can only make this value more conservative
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Applying...' : 'Apply Override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function ConfigCenter() {
  const { catalog, grouped, loading: catalogLoading, refetch: refetchCatalog } = useConfigCatalog();
  const { configs, loading: effectiveLoading, refetch: refetchEffective } = useEffectiveConfig();
  const { overrides, createOverride, rollbackOverride } = useConfigOverrides();
  const { receipts } = useConfigReceipts();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, unknown>>({});
  const [overrideDialog, setOverrideDialog] = useState<{ item: ConfigItem; value: unknown } | null>(null);

  // Build effective value map
  const effectiveMap = useMemo(() => {
    const map: Record<string, unknown> = {};
    configs.forEach((c) => {
      map[c.key] = c.value;
    });
    return map;
  }, [configs]);

  // Build override map
  const overrideMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    overrides.forEach((o) => {
      map[o.key] = o.active;
    });
    return map;
  }, [overrides]);

  // Categories list
  const categories = useMemo(() => Object.keys(grouped), [grouped]);

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    let items = catalog;
    if (selectedCategory) {
      items = items.filter((i) => i.category === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.key.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q)
      );
    }
    return items;
  }, [catalog, selectedCategory, searchQuery]);

  // Handle value change
  const handleValueChange = (key: string, value: unknown) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
  };

  // Get current value (pending or effective)
  const getCurrentValue = (key: string) => {
    if (key in pendingChanges) return pendingChanges[key];
    return effectiveMap[key];
  };

  // Handle apply override
  const handleApplyOverride = (item: ConfigItem) => {
    const value = pendingChanges[item.key];
    if (value === undefined) {
      toast.error('No changes to apply');
      return;
    }
    setOverrideDialog({ item, value });
  };

  // Confirm override
  const handleConfirmOverride = async (reason: string, expiresInHours: number) => {
    if (!overrideDialog) return;
    const { item, value } = overrideDialog;
    
    const result = await createOverride(item.key, value, reason, expiresInHours);
    if (result.success) {
      toast.success(`Override applied to ${item.title}`);
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[item.key];
        return next;
      });
      setOverrideDialog(null);
      refetchEffective();
    } else {
      toast.error(result.error || 'Failed to apply override');
    }
  };

  // Handle rollback
  const handleRollback = async (key: string) => {
    const result = await rollbackOverride(key);
    if (result.success) {
      toast.success('Override rolled back');
      refetchEffective();
    } else {
      toast.error(result.error || 'Failed to rollback');
    }
  };

  const isLoading = catalogLoading || effectiveLoading;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="w-6 h-6" />
            Configuration Center
          </h1>
          <p className="text-muted-foreground">
            Manage system configuration with safety boundaries and audit trails.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Presets Dropdown */}
          <Select onValueChange={(presetName) => {
            const preset = PRESETS.find(p => p.name === presetName);
            if (preset) {
              setPendingChanges({ ...pendingChanges, ...preset.values });
              toast.info(`${preset.name} preset loaded - review changes before applying`);
            }
          }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Load Preset..." />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((preset) => (
                <SelectItem key={preset.name} value={preset.name}>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', preset.color)} />
                    {preset.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline">{catalog.length} items</Badge>
          <Badge variant="secondary">{overrides.length} active overrides</Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search configurations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6">
        {/* Category Sidebar */}
        <div className="col-span-3">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <nav className="space-y-1 p-2">
                <button
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                    !selectedCategory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  )}
                  onClick={() => setSelectedCategory(null)}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors',
                      selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    )}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {CATEGORY_ICONS[cat] || <Settings2 className="w-4 h-4" />}
                    {cat}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {grouped[cat]?.length || 0}
                    </Badge>
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>

          {/* Active Overrides */}
          {overrides.length > 0 && (
            <Card className="mt-4 border-amber-500/30">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2 text-amber-600">
                  <Clock className="w-4 h-4" />
                  Active Overrides
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                {overrides.map((o) => (
                  <div key={o.id} className="text-xs p-2 rounded bg-amber-50 border border-amber-200">
                    <div className="font-mono font-medium">{o.key}</div>
                    <div className="text-muted-foreground mt-1">
                      Expires: {o.expiresAt ? new Date(o.expiresAt).toLocaleString() : 'Never'}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 h-6 text-xs"
                      onClick={() => handleRollback(o.key)}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Rollback
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Config Items */}
        <div className="col-span-9">
          <Tabs defaultValue="config">
            <TabsList>
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="mt-4 space-y-4">
              {isLoading ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Loading configuration...
                  </CardContent>
                </Card>
              ) : filteredItems.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No configuration items found
                  </CardContent>
                </Card>
              ) : (
                filteredItems.map((item) => {
                  const currentValue = getCurrentValue(item.key);
                  const hasPendingChange = item.key in pendingChanges;
                  const hasActiveOverride = overrideMap[item.key];

                  return (
                    <Card key={item.key} className={cn(
                      hasActiveOverride && 'border-amber-500/50 bg-amber-500/5'
                    )}>
                      <CardContent className="py-4">
                        <div className="flex gap-6">
                          <div className="flex-1">
                            <ConfigSchemaForm
                              item={item}
                              currentValue={currentValue}
                              onChange={(v) => handleValueChange(item.key, v)}
                              disabled={item.safety === 'immutable'}
                            />
                          </div>
                          <div className="flex flex-col gap-2 w-32">
                            {hasPendingChange && (
                              <Button
                                size="sm"
                                onClick={() => handleApplyOverride(item)}
                                disabled={item.safety === 'immutable'}
                              >
                                Apply
                              </Button>
                            )}
                            {hasActiveOverride && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRollback(item.key)}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Rollback
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Change Log
                  </CardTitle>
                  <CardDescription>Recent configuration changes</CardDescription>
                </CardHeader>
                <CardContent>
                  {receipts.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No changes recorded yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {receipts.map((r) => (
                        <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            r.action === 'override' ? 'bg-blue-100' : 'bg-amber-100'
                          )}>
                            {r.action === 'override' ? (
                              <Settings2 className="w-4 h-4 text-blue-600" />
                            ) : (
                              <RotateCcw className="w-4 h-4 text-amber-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{r.key}</span>
                              <Badge variant="outline" className="text-xs">
                                {r.action}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{r.reason}</p>
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              <span>By: {r.operatorId}</span>
                              <span>{new Date(r.timestamp).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {JSON.stringify(r.previousValue)} → {JSON.stringify(r.newValue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Override Dialog */}
      {overrideDialog && (
        <OverrideDialog
          item={overrideDialog.item}
          currentValue={effectiveMap[overrideDialog.item.key]}
          newValue={overrideDialog.value}
          onConfirm={handleConfirmOverride}
          onCancel={() => setOverrideDialog(null)}
          open={true}
        />
      )}
    </div>
  );
}
