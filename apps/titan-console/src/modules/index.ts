import { registry } from '@/lib/registry/ModuleRegistry';
import { CoreModule } from './CoreModule';

// Initialize core modules
const modules = [
  new CoreModule(),
];

console.log('[App] Initializing modules...');
modules.forEach(m => registry.registerModule(m));

export { registry };
