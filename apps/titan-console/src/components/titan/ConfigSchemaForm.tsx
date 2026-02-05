/**
 * ConfigSchemaForm - Dynamic form component for config items
 * 
 * Renders appropriate UI controls based on schema:
 * - slider: Bounded numbers
 * - toggle: Booleans
 * - input: Strings/numbers
 * - select: Enums
 * - readonly: Immutable values
 * - big_button: Emergency toggles
 */
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Lock, AlertTriangle, Shield, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfigItem, ConfigSchema, ConfigSafety } from '@/hooks/useConfig';

interface ConfigSchemaFormProps {
  item: ConfigItem;
  currentValue: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

// Safety level badges
const SafetyBadge: React.FC<{ safety: ConfigSafety }> = ({ safety }) => {
  const styles: Record<ConfigSafety, { bg: string; text: string; icon: React.ReactNode }> = {
    immutable: { bg: 'bg-slate-100', text: 'text-slate-600', icon: <Lock className="w-3 h-3" /> },
    tighten_only: { bg: 'bg-amber-100', text: 'text-amber-700', icon: <TrendingDown className="w-3 h-3" /> },
    raise_only: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <TrendingUp className="w-3 h-3" /> },
    append_only: { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Shield className="w-3 h-3" /> },
    tunable: { bg: 'bg-green-100', text: 'text-green-700', icon: null },
  };

  const style = styles[safety];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', style.bg, style.text)}>
      {style.icon}
      {safety.replace('_', '-')}
    </span>
  );
};

export const ConfigSchemaForm: React.FC<ConfigSchemaFormProps> = ({
  item,
  currentValue,
  onChange,
  disabled = false,
}) => {
  const isImmutable = item.safety === 'immutable';
  const isDisabled = disabled || isImmutable;

  // Render slider for bounded numbers
  if (item.widget === 'slider' && item.schema.type === 'number') {
    const min = item.schema.min ?? 0;
    const max = item.schema.max ?? 100;
    const value = typeof currentValue === 'number' ? currentValue : min;
    const step = max <= 1 ? 0.01 : 1;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{item.title}</Label>
            <SafetyBadge safety={item.safety} />
          </div>
          <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{value}</span>
        </div>
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => onChange(v)}
          disabled={isDisabled}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    );
  }

  // Render toggle for booleans
  if (item.widget === 'toggle' && item.schema.type === 'boolean') {
    const value = Boolean(currentValue);

    return (
      <div className="flex items-center justify-between p-3 rounded-lg border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">{item.title}</Label>
            <SafetyBadge safety={item.safety} />
          </div>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
        <Switch
          checked={value}
          onCheckedChange={onChange}
          disabled={isDisabled}
        />
      </div>
    );
  }

  // Render big button for emergency toggles
  if (item.widget === 'big_button') {
    const isActive = Boolean(currentValue);

    return (
      <div className={cn(
        'p-4 rounded-lg border-2 transition-colors',
        isActive ? 'border-red-500 bg-red-500/10' : 'border-muted'
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn('w-5 h-5', isActive ? 'text-red-500' : 'text-muted-foreground')} />
            <Label className="text-sm font-medium">{item.title}</Label>
            <SafetyBadge safety={item.safety} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{item.description}</p>
        <Button
          variant={isActive ? 'destructive' : 'outline'}
          className="w-full"
          onClick={() => onChange(!isActive)}
          disabled={isDisabled}
        >
          {isActive ? 'RELEASE HALT' : 'ACTIVATE HALT'}
        </Button>
      </div>
    );
  }

  // Render input for numbers/strings
  if (item.widget === 'input') {
    const value = currentValue !== undefined ? String(currentValue) : '';
    const type = item.schema.type === 'number' ? 'number' : 'text';

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{item.title}</Label>
          <SafetyBadge safety={item.safety} />
        </div>
        <Input
          type={type}
          value={value}
          onChange={(e) => {
            const v = type === 'number' ? parseFloat(e.target.value) : e.target.value;
            onChange(v);
          }}
          disabled={isDisabled}
          className="font-mono"
          placeholder={item.defaultValue !== undefined ? `Default: ${item.defaultValue}` : undefined}
        />
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    );
  }

  // Render select for enums
  if (item.widget === 'select' && item.schema.enum) {
    const value = String(currentValue);

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{item.title}</Label>
          <SafetyBadge safety={item.safety} />
        </div>
        <Select value={value} onValueChange={onChange} disabled={isDisabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {item.schema.enum.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{item.description}</p>
      </div>
    );
  }

  // Readonly fallback
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium">{item.title}</Label>
        <SafetyBadge safety={item.safety} />
      </div>
      <div className="p-3 rounded-lg bg-muted font-mono text-sm">
        {JSON.stringify(currentValue)}
      </div>
      <p className="text-xs text-muted-foreground">{item.description}</p>
    </div>
  );
};
