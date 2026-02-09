import type { OperatorModule, ModuleRegistry } from '@/lib/registry/types';
import { WIDGETS } from '@/config/widgets';

/**
 * Core Module
 * 
 * Bootstraps the legacy widgets into the new Registry system.
 * This allows us to maintain backward compatibility while we migrate.
 */
export class CoreModule implements OperatorModule {
  id = 'core';
  version = '1.0.0';
  name = 'Core System';

  register(registry: ModuleRegistry) {
    console.log('[CoreModule] Registering legacy widgets...');
    
    Object.entries(WIDGETS).forEach(([id, def]) => {
      registry.registerPanel({
        id,
        title: def.name,
        icon: def.icon,
        component: def.component,
        defaultLocation: 'main',
      });
    });

    console.log(`[CoreModule] Registered ${Object.keys(WIDGETS).length} panels.`);
  }
}
