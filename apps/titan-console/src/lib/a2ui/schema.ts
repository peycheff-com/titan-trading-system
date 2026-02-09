/**
 * A2UI Spec Schema v1
 *
 * Versioned, declarative UI specification for agent → UI communication.
 * The assistant proposes UI specs. The app renders them deterministically
 * through canonical components.
 *
 * Strict typing: unknown component types are rejected at validation.
 */

import type { DangerLevel } from '@/lib/intentCompiler';

// ---------------------------------------------------------------------------
// Spec Version
// ---------------------------------------------------------------------------

export const A2UI_SPEC_VERSION = '1.0' as const;

// ---------------------------------------------------------------------------
// Component Specs — discriminated union by `type`
// ---------------------------------------------------------------------------

/** ActionCard — interactive confirmation card for proposed intents */
export interface A2UIActionCardSpec {
  type: 'ActionCard';
  props: {
    intentType: string;
    description: string;
    dangerLevel: DangerLevel;
    params: Record<string, unknown>;
  };
}

/** RiskDelta — risk impact preview block */
export interface A2UIRiskDeltaSpec {
  type: 'RiskDelta';
  props: {
    postureChange?: string;
    affectedPhases: string[];
    affectedSymbols: string[];
    throttleDelta?: number;
    capViolations: string[];
  };
}

/** IntentTimeline — lifecycle status of an operator intent */
export interface A2UIIntentTimelineSpec {
  type: 'IntentTimeline';
  props: {
    status: string;
    intentId?: string;
    timestamps?: Record<string, string>;
  };
}

/** DecisionTrace — detailed AI reasoning trace */
export interface A2UIDecisionTraceSpec {
  type: 'DecisionTrace';
  props: {
    decisionId: string;
    model: string;
    reasoning: string;
    confidence: number;
    factors: Array<{ name: string; weight: number; value: string }>;
  };
}

/** ArtifactLink — clickable link to a system artifact */
export interface A2UIArtifactLinkSpec {
  type: 'ArtifactLink';
  props: {
    label: string;
    href: string;
    artifactType: 'receipt' | 'log' | 'config' | 'report';
  };
}

/** PanelModule — card wrapper with title for arbitrary content */
export interface A2UIPanelModuleSpec {
  type: 'PanelModule';
  props: {
    title: string;
    content: string;
    variant?: 'default' | 'warning' | 'critical';
  };
}

/** Text — simple text block */
export interface A2UITextSpec {
  type: 'Text';
  props: {
    content: string;
  };
}

// ---------------------------------------------------------------------------
// Discriminated Union
// ---------------------------------------------------------------------------

export type A2UIComponent =
  | A2UIActionCardSpec
  | A2UIRiskDeltaSpec
  | A2UIIntentTimelineSpec
  | A2UIDecisionTraceSpec
  | A2UIArtifactLinkSpec
  | A2UIPanelModuleSpec
  | A2UITextSpec;

/** Valid component type names */
export const A2UI_COMPONENT_TYPES = [
  'ActionCard',
  'RiskDelta',
  'IntentTimeline',
  'DecisionTrace',
  'ArtifactLink',
  'PanelModule',
  'Text',
] as const;

export type A2UIComponentType = (typeof A2UI_COMPONENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Actions — proposed operator intents
// ---------------------------------------------------------------------------

export interface A2UIAction {
  /** Fully typed intent draft */
  intentDraft: {
    type: string;
    params: Record<string, unknown>;
    description: string;
    dangerLevel: DangerLevel;
  };
  /** Display label */
  label: string;
  /** Danger classification */
  danger: DangerLevel;
}

// ---------------------------------------------------------------------------
// Root Spec
// ---------------------------------------------------------------------------

export interface A2UISpec {
  /** Schema version — always '1.0' in v1 */
  uiSpecVersion: typeof A2UI_SPEC_VERSION;
  /** Model that generated this spec */
  model: string;
  /** Declarative component list */
  components: A2UIComponent[];
  /** Optional proposed actions */
  actions?: A2UIAction[];
  /** Layout mode for components */
  layout?: 'stack' | 'grid-2';
}
