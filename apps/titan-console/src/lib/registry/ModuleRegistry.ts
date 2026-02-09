import { 
  type ModuleRegistry as IModuleRegistry, 
  type PanelDefinition, 
  type InspectorViewDefinition, 
  type IntentDefinition,
  type InspectorEntity,
  type OperatorModule 
} from './types';

/**
 * ---------------------------------------------------------------------------
 * Titan Module Registry
 * 
 * Singleton service for managing extension points.
 * ---------------------------------------------------------------------------
 */
export class TitanModuleRegistry implements IModuleRegistry {
  private panels = new Map<string, PanelDefinition>();
  private inspectorViews = new Set<InspectorViewDefinition>();
  private intents = new Map<string, IntentDefinition>();
  private modules = new Map<string, OperatorModule>();

  /**
   * Register a top-level module (pack)
   */
  registerModule(module: OperatorModule) {
    if (this.modules.has(module.id)) {
      console.warn(`[Registry] Module ${module.id} already registered. Overwriting.`);
    }
    this.modules.set(module.id, module);
    console.log(`[Registry] Registering module: ${module.name} (${module.version})`);
    module.register(this);
  }

  /**
   * Register a workspace panel
   */
  registerPanel(def: PanelDefinition) {
    if (this.panels.has(def.id)) {
      console.warn(`[Registry] Panel ${def.id} already exists. Overwriting.`);
    }
    this.panels.set(def.id, def);
  }

  /**
   * Register an inspector view
   */
  registerInspectorView(def: InspectorViewDefinition) {
    this.inspectorViews.add(def);
  }

  /**
   * Register an intent definition
   */
  registerIntent(def: IntentDefinition) {
    this.intents.set(def.type, def);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  getAllPanels(): PanelDefinition[] {
    return Array.from(this.panels.values());
  }

  getPanel(id: string): PanelDefinition | undefined {
    return this.panels.get(id);
  }

  getInspectorViewsFor(entity: InspectorEntity): InspectorViewDefinition[] {
    return Array.from(this.inspectorViews)
      .filter(v => v.matches(entity))
      .sort((a, b) => b.priority - a.priority);
  }

  getIntent(type: string): IntentDefinition | undefined {
    return this.intents.get(type);
  }
}

// Singleton instance
export const registry = new TitanModuleRegistry();
