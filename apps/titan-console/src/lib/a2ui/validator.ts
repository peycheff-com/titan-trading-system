/**
 * A2UI Spec Validator
 *
 * Runtime validation for A2UISpec payloads. Rejects unknown fields and
 * component types. No external schema library — pure TypeScript type guards.
 *
 * Usage:
 *   const result = validateA2UISpec(rawPayload);
 *   if (result.valid) { render(result.spec); }
 *   else { showErrors(result.errors); }
 */

import {
  A2UI_SPEC_VERSION,
  A2UI_COMPONENT_TYPES,
  type A2UISpec,
  type A2UIComponent,
  type A2UIComponentType,
} from './schema';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type ValidationResult =
  | { valid: true; spec: A2UISpec }
  | { valid: false; errors: string[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

const VALID_TYPES = new Set<string>(A2UI_COMPONENT_TYPES);
const VALID_DANGER = new Set(['safe', 'moderate', 'critical']);
const VALID_LAYOUTS = new Set(['stack', 'grid-2']);

// ---------------------------------------------------------------------------
// Component validators
// ---------------------------------------------------------------------------

function validateComponent(raw: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `components[${index}]`;

  if (!isObject(raw)) {
    errors.push(`${prefix}: must be an object`);
    return errors;
  }

  if (!isString(raw.type)) {
    errors.push(`${prefix}.type: required string`);
    return errors;
  }

  if (!VALID_TYPES.has(raw.type)) {
    errors.push(`${prefix}.type: unknown component type "${raw.type}". Allowed: ${[...VALID_TYPES].join(', ')}`);
    return errors;
  }

  if (!isObject(raw.props)) {
    errors.push(`${prefix}.props: required object`);
    return errors;
  }

  // Type-specific prop validation
  const type = raw.type as A2UIComponentType;
  const props = raw.props as Record<string, unknown>;

  switch (type) {
    case 'ActionCard':
      if (!isString(props.intentType)) errors.push(`${prefix}.props.intentType: required string`);
      if (!isString(props.description)) errors.push(`${prefix}.props.description: required string`);
      if (!isString(props.dangerLevel) || !VALID_DANGER.has(props.dangerLevel as string))
        errors.push(`${prefix}.props.dangerLevel: must be safe|moderate|critical`);
      if (!isObject(props.params)) errors.push(`${prefix}.props.params: required object`);
      break;

    case 'RiskDelta':
      if (!isArray(props.affectedPhases)) errors.push(`${prefix}.props.affectedPhases: required array`);
      if (!isArray(props.affectedSymbols)) errors.push(`${prefix}.props.affectedSymbols: required array`);
      if (!isArray(props.capViolations)) errors.push(`${prefix}.props.capViolations: required array`);
      break;

    case 'IntentTimeline':
      if (!isString(props.status)) errors.push(`${prefix}.props.status: required string`);
      break;

    case 'DecisionTrace':
      if (!isString(props.decisionId)) errors.push(`${prefix}.props.decisionId: required string`);
      if (!isString(props.model)) errors.push(`${prefix}.props.model: required string`);
      if (!isString(props.reasoning)) errors.push(`${prefix}.props.reasoning: required string`);
      if (typeof props.confidence !== 'number') errors.push(`${prefix}.props.confidence: required number`);
      if (!isArray(props.factors)) errors.push(`${prefix}.props.factors: required array`);
      break;

    case 'ArtifactLink':
      if (!isString(props.label)) errors.push(`${prefix}.props.label: required string`);
      if (!isString(props.href)) errors.push(`${prefix}.props.href: required string`);
      break;

    case 'PanelModule':
      if (!isString(props.title)) errors.push(`${prefix}.props.title: required string`);
      if (!isString(props.content)) errors.push(`${prefix}.props.content: required string`);
      break;

    case 'Text':
      if (!isString(props.content)) errors.push(`${prefix}.props.content: required string`);
      break;
  }

  // Reject unknown top-level keys on the component
  const allowedKeys = new Set(['type', 'props']);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${prefix}: unknown field "${key}"`);
    }
  }

  return errors;
}

function validateAction(raw: unknown, index: number): string[] {
  const errors: string[] = [];
  const prefix = `actions[${index}]`;

  if (!isObject(raw)) {
    errors.push(`${prefix}: must be an object`);
    return errors;
  }

  if (!isString(raw.label)) errors.push(`${prefix}.label: required string`);
  if (!isString(raw.danger) || !VALID_DANGER.has(raw.danger as string))
    errors.push(`${prefix}.danger: must be safe|moderate|critical`);

  if (!isObject(raw.intentDraft)) {
    errors.push(`${prefix}.intentDraft: required object`);
  } else {
    const draft = raw.intentDraft as Record<string, unknown>;
    if (!isString(draft.type)) errors.push(`${prefix}.intentDraft.type: required string`);
    if (!isString(draft.description)) errors.push(`${prefix}.intentDraft.description: required string`);
    if (!isObject(draft.params)) errors.push(`${prefix}.intentDraft.params: required object`);
    if (!isString(draft.dangerLevel) || !VALID_DANGER.has(draft.dangerLevel as string))
      errors.push(`${prefix}.intentDraft.dangerLevel: must be safe|moderate|critical`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export function validateA2UISpec(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { valid: false, errors: ['Root: must be an object'] };
  }

  // Version check
  if (raw.uiSpecVersion !== A2UI_SPEC_VERSION) {
    errors.push(`uiSpecVersion: must be "${A2UI_SPEC_VERSION}", got "${String(raw.uiSpecVersion)}"`);
  }

  // Model
  if (!isString(raw.model)) {
    errors.push('model: required string');
  }

  // Components
  if (!isArray(raw.components)) {
    errors.push('components: required array');
  } else {
    for (let i = 0; i < raw.components.length; i++) {
      errors.push(...validateComponent(raw.components[i], i));
    }
  }

  // Actions (optional)
  if (raw.actions !== undefined) {
    if (!isArray(raw.actions)) {
      errors.push('actions: must be an array');
    } else {
      for (let i = 0; i < raw.actions.length; i++) {
        errors.push(...validateAction(raw.actions[i], i));
      }
    }
  }

  // Layout (optional)
  if (raw.layout !== undefined) {
    if (!isString(raw.layout) || !VALID_LAYOUTS.has(raw.layout)) {
      errors.push('layout: must be "stack" or "grid-2"');
    }
  }

  // Reject unknown root keys
  const allowedRootKeys = new Set(['uiSpecVersion', 'model', 'components', 'actions', 'layout']);
  for (const key of Object.keys(raw)) {
    if (!allowedRootKeys.has(key)) {
      errors.push(`Root: unknown field "${key}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, spec: raw as unknown as A2UISpec };
}
