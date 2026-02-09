import { createContext, useContext, type ReactNode } from 'react';
import { registry, TitanModuleRegistry } from '@/lib/registry/ModuleRegistry';

const ModuleRegistryContext = createContext<TitanModuleRegistry>(registry);

export function ModuleRegistryProvider({ 
  children, 
  value = registry 
}: { 
  children: ReactNode; 
  value?: TitanModuleRegistry;
}) {
  return (
    <ModuleRegistryContext.Provider value={value}>
      {children}
    </ModuleRegistryContext.Provider>
  );
}

export function useModuleRegistry() {
  const context = useContext(ModuleRegistryContext);
  if (!context) {
    throw new Error('useModuleRegistry must be used within a ModuleRegistryProvider');
  }
  return context;
}
