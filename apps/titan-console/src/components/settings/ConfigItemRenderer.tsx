/**
 * ConfigItemRenderer — renders a single catalog config item
 * with the correct widget (slider, input, toggle, select, secret)
 * plus provenance badge and rollback support.
 */
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, RotateCcw, Info, Lock, Eye, EyeOff } from 'lucide-react';
import type { ConfigItem, EffectiveConfig, ConfigProvenance } from '@/hooks/useConfig';

interface ConfigItemRendererProps {
  item: ConfigItem;
  effective?: EffectiveConfig;
  onSave: (key: string, value: unknown, reason: string) => Promise<{ success: boolean; error?: string }>;
  onRollback: (key: string) => Promise<{ success: boolean; error?: string }>;
  saving?: boolean;
}

// Provenance source display
function ProvenanceBadge({ provenance }: { provenance?: ConfigProvenance[] }) {
  if (!provenance || provenance.length === 0) return null;
  const top = provenance[provenance.length - 1];
  const colorMap: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    env: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    override: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    file: 'bg-green-500/15 text-green-600 border-green-500/30',
    deploy: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  };
  return (
    <Badge variant="outline" className={`text-xs font-mono ${colorMap[top.source] || ''}`}>
      {top.source}
    </Badge>
  );
}

// Safety badge
function SafetyBadge({ safety }: { safety: string }) {
  const map: Record<string, { label: string; className: string }> = {
    immutable: { label: '🔒 Immutable', className: 'bg-red-500/15 text-red-600' },
    tighten_only: { label: '⬇ Tighten Only', className: 'bg-orange-500/15 text-orange-600' },
    raise_only: { label: '⬆ Raise Only', className: 'bg-yellow-500/15 text-yellow-600' },
    tunable: { label: '⚙ Tunable', className: 'bg-green-500/15 text-green-600' },
  };
  const entry = map[safety] || { label: safety, className: '' };
  return (
    <Badge variant="outline" className={`text-xs ${entry.className}`}>
      {entry.label}
    </Badge>
  );
}

// Format a number for slider display
function formatValue(value: unknown, schema: ConfigItem['schema']): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'number') {
    // If it seems like a percentage fraction
    if (schema.max !== undefined && schema.max <= 1 && schema.min !== undefined && schema.min >= 0) {
      return `${(value * 100).toFixed(2)}%`;
    }
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4);
  }
  return String(value ?? '');
}

// Select options generator for whole-number selects
function generateSelectOptions(min: number, max: number): number[] {
  const options: number[] = [];
  // Generate sensible steps
  const range = max - min;
  const step = range <= 10 ? 1 : range <= 50 ? 5 : range <= 200 ? 10 : 50;
  for (let v = min; v <= max; v += step) {
    options.push(v);
  }
  if (!options.includes(max)) options.push(max);
  return options;
}

// Select options for time durations (ms)
function generateTimeSelectOptions(min: number, max: number): { value: number; label: string }[] {
  const presets = [1000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1800000, 3600000, 7200000, 14400000, 28800000, 43200000, 86400000];
  return presets
    .filter((v) => v >= min && v <= max)
    .map((v) => ({
      value: v,
      label: v >= 3600000 ? `${v / 3600000}h` : v >= 60000 ? `${v / 60000}m` : `${v / 1000}s`,
    }));
}

export function ConfigItemRenderer({ item, effective, onSave, onRollback, saving }: ConfigItemRendererProps) {
  const currentValue = effective?.value ?? item.defaultValue;
  const [localValue, setLocalValue] = useState<unknown>(currentValue);
  const [reason, setReason] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isOverridden = effective?.provenance?.some((p) => p.source === 'override') ?? false;
  const isImmutable = item.safety === 'immutable';

  const updateValue = (v: unknown) => {
    setLocalValue(v);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!dirty) return;
    const r = reason.trim() || `Updated via Settings UI`;
    const result = await onSave(item.key, localValue, r);
    if (result.success) {
      setDirty(false);
      setReason('');
    }
  };

  const handleRollback = async () => {
    await onRollback(item.key);
    setLocalValue(item.defaultValue);
    setDirty(false);
  };

  // Widget rendering
  const renderWidget = () => {
    if (isImmutable) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="font-mono text-sm">{formatValue(currentValue, item.schema)}</span>
        </div>
      );
    }

    switch (item.widget) {
      case 'slider': {
        const min = item.schema.min ?? 0;
        const max = item.schema.max ?? 100;
        const isPercent = max <= 1 && min >= 0;
        const displayMin = isPercent ? min * 100 : min;
        const displayMax = isPercent ? max * 100 : max;
        const displayValue = isPercent ? (localValue as number) * 100 : (localValue as number);
        const step = isPercent ? 0.1 : max <= 10 ? 0.1 : 1;

        return (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{displayMin}{isPercent ? '%' : ''}</span>
              <span className="font-mono font-semibold">{isPercent ? `${displayValue.toFixed(1)}%` : displayValue}</span>
              <span className="text-muted-foreground">{displayMax}{isPercent ? '%' : ''}</span>
            </div>
            <Slider
              value={[displayValue]}
              min={displayMin}
              max={displayMax}
              step={step}
              onValueChange={(val: number[]) => {
                const newVal = isPercent ? val[0] / 100 : val[0];
                updateValue(newVal);
              }}
            />
          </div>
        );
      }

      case 'input': {
        if (item.schema.type === 'number') {
          return (
            <Input
              type="number"
              value={localValue as number}
              min={item.schema.min}
              max={item.schema.max}
              step={item.schema.max && item.schema.max <= 1 ? 0.001 : 1}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) updateValue(v);
              }}
              className="font-mono"
            />
          );
        }
        return (
          <Input
            type="text"
            value={(localValue as string) || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateValue(e.target.value)}
            className="font-mono"
          />
        );
      }

      case 'toggle':
        return (
          <div className="flex items-center gap-3">
            <Switch
              checked={!!localValue}
              onCheckedChange={(checked: boolean) => updateValue(checked)}
            />
            <span className="text-sm text-muted-foreground">
              {localValue ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        );

      case 'select': {
        // Time-based selects (ms fields)
        if (item.key.includes('IntervalMs') || item.key.includes('Window') || item.key.includes('Timeout')) {
          const options = generateTimeSelectOptions(
            item.schema.min ?? 0,
            item.schema.max ?? 86400000,
          );
          return (
            <Select
              value={String(localValue)}
              onValueChange={(val: string) => updateValue(Number(val))}
            >
              <SelectTrigger className="font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        // Numeric selects
        const options = generateSelectOptions(
          item.schema.min ?? 0,
          item.schema.max ?? 100,
        );
        return (
          <Select
            value={String(localValue)}
            onValueChange={(val: string) => updateValue(Number(val))}
          >
            <SelectTrigger className="font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((v) => (
                <SelectItem key={v} value={String(v)}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case 'secret':
        return (
          <div className="flex gap-2">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={(localValue as string) || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateValue(e.target.value)}
              className="font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        );

      default:
        return (
          <span className="font-mono text-sm text-muted-foreground">
            {formatValue(currentValue, item.schema)}
          </span>
        );
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm font-semibold">{item.title}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p>{item.description}</p>
                <p className="text-xs opacity-70 mt-1">Key: {item.key} · Apply: {item.apply}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1.5">
          <ProvenanceBadge provenance={effective?.provenance} />
          <SafetyBadge safety={item.safety} />
        </div>
      </div>

      {/* Widget */}
      {renderWidget()}

      {/* Save / Rollback row */}
      {!isImmutable && (
        <div className="flex items-center gap-2 pt-1">
          {dirty && (
            <>
              <Input
                placeholder="Reason for change..."
                value={reason}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
                className="text-xs h-7 flex-1"
              />
              <Button size="sm" variant="default" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                <Save className="h-3 w-3 mr-1" /> Save
              </Button>
            </>
          )}
          {isOverridden && !dirty && (
            <Button size="sm" variant="ghost" onClick={handleRollback} className="h-7 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3 mr-1" /> Rollback
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
