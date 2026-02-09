import type { ComponentType, LazyExoticComponent } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * ---------------------------------------------------------------------------
 * Core Module Definition
 * ---------------------------------------------------------------------------
 */
export interface OperatorModule {
  id: string;
  version: string;
  /** Human-readable name for the module */
  name: string;
  /** Invoked on app boot to register capabilities */
  register: (registry: ModuleRegistry) => void;
}

/**
 * ---------------------------------------------------------------------------
 * Registry Interface (for decoupling)
 * ---------------------------------------------------------------------------
 */
export interface ModuleRegistry {
  registerPanel(def: PanelDefinition): void;
  registerInspectorView(def: InspectorViewDefinition): void;
  registerIntent(def: IntentDefinition): void;
}

/**
 * ---------------------------------------------------------------------------
 * Panel Contract (Workspace Tabs)
 * ---------------------------------------------------------------------------
 */
export interface PanelDefinition {
  /** Unique ID (e.g., 'options-chain') */
  id: string;
  /** Display title */
  title: string;
  /** Icon for the tab */
  icon: LucideIcon;
  /** The React component to render. MUST be lazy loaded. */
  component: LazyExoticComponent<ComponentType<unknown>>;
  /** Optional metadata for layout persistence */
  defaultLocation?: 'main' | 'bottom';
}

/**
 * ---------------------------------------------------------------------------
 * Inspector View Contract (Context Panel)
 * ---------------------------------------------------------------------------
 */
export interface InspectorEntity {
  type: string;
  id: string;
  title?: string;
  data?: Record<string, unknown>;
}

export interface InspectorViewProps {
  entity: InspectorEntity;
}

export interface InspectorViewDefinition {
  id: string;
  /** Function to determine if this view handles the selected entity */
  matches: (entity: InspectorEntity) => boolean;
  /** The component to render in the inspector */
  component: ComponentType<InspectorViewProps>;
  /** Sort order (higher = top of inspector) */
  priority: number;
}

/**
 * ---------------------------------------------------------------------------
 * Intent Contract (Action Cards)
 * ---------------------------------------------------------------------------
 */
// Re-using exiting types or defining new compatible ones
export interface CompiledIntent {
  type: string;
  dangerLevel: 'safe' | 'moderate' | 'critical';
  params: Record<string, unknown>;
  description: string;
}

export interface IntentRendererProps {
  intent: CompiledIntent;
  onApprove: () => void;
  onReject: () => void;
  isExecuting: boolean;
}

export interface IntentDefinition {
  /** The intent type this definition handles (e.g., 'FLATTEN_POSITIONS') */
  type: string;
  /** Custom card renderer. If omitted, uses default ActionCard with description */
  renderer?: ComponentType<IntentRendererProps>;
}
