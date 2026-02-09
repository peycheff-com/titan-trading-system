/**
 * WorkspaceLayout — Center Workspace Region
 *
 * Renders the active workspace's tabs and content area.
 * Replaces the simple <Outlet /> in AppShell with:
 *  - Tab bar (compact, TradingView-style)
 *  - Active tab content (lazy-loaded widget)
 *  - Optional bottom panel (resizable)
 *
 * Uses Radix Tabs for accessibility and keyboard support.
 */

import { Suspense, useMemo } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useModuleRegistry } from '@/context/ModuleRegistryContext';
import { ResizablePane } from './ResizablePane';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useScreenSize } from '@/hooks/use-media-query';

// ---------------------------------------------------------------------------
// Loading fallback
// ---------------------------------------------------------------------------

function WidgetFallback() {
  return (
    <div className="flex h-48 items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ... imports
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

// ... (WidgetFallback stays the same)

export function WorkspaceLayout() {
  const { workspace, activeTab, switchTab, bottomPanelOpen } = useWorkspace();
  const { isMobile } = useScreenSize();
  const registry = useModuleRegistry();

  // Resolve tab widgets
  const tabs = useMemo(
    () =>
      workspace.tabs
        .map((id) => {
          const panel = registry.getPanel(id);
          return panel ? { id, ...panel, name: panel.title } : null; // Map title to name for compatibility
        })
        .filter(Boolean) as Array<{ id: string; name: string; icon: LucideIcon; component: ComponentType<unknown> }>,
    [workspace.tabs, registry],
  );

  // Resolve bottom panel widgets
  const bottomWidgets = useMemo(
    () =>
      (workspace.bottomPanels ?? [])
        .map((id) => {
          const panel = registry.getPanel(id);
          return panel ? { id, ...panel, name: panel.title } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; icon: LucideIcon; component: ComponentType<unknown> }>,
    [workspace.bottomPanels, registry],
  );

  const hasBottom = bottomWidgets.length > 0;

  // Render bottom panel content
  const bottomContent = hasBottom ? (
    <div className="h-full border-t border-border bg-card">
      <div className="flex h-8 items-center border-b border-border px-3">
        {bottomWidgets.map((bw) => {
          const BIcon = bw.icon;
          return (
            <span
              key={bw.id}
              className="flex items-center gap-1.5 text-xxs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              <BIcon className="h-3 w-3" />
              {bw.name}
            </span>
          );
        })}
      </div>
      <div className="overflow-y-auto scrollbar-titan p-3" style={{ height: 'calc(100% - 2rem)' }}>
        {bottomWidgets.map((bw) => {
          const Component = bw.component;
          return (
            <Suspense key={bw.id} fallback={<WidgetFallback />}>
              <ErrorBoundary name={bw.name}>
                <Component />
              </ErrorBoundary>
            </Suspense>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={switchTab}
      className="flex flex-1 flex-col overflow-hidden"
    >
      {/* Tab bar */}
      <Tabs.List
        className="flex h-9 items-center gap-0 border-b border-border bg-card px-1 shrink-0"
        aria-label="Workspace tabs"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Tabs.Trigger
              key={tab.id}
              value={tab.id}
              className={cn(
                'group relative flex items-center gap-1.5 px-3 h-full text-xs font-medium transition-colors',
                'text-muted-foreground hover:text-foreground',
                'data-[state=active]:text-foreground',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-[-2px]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.name}</span>
              {/* Active indicator bar */}
              <span
                className={cn(
                  'absolute bottom-0 left-1 right-1 h-0.5 rounded-full transition-colors',
                  'bg-transparent group-data-[state=active]:bg-primary',
                )}
              />
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePane
          storageKey={`titan-bottom-${workspace.id}`}
          bottomVisible={!isMobile && hasBottom && bottomPanelOpen}
          bottom={bottomContent}
          top={
            <div className="px-6 py-4">
              {tabs.map((tab) => {
                const Component = tab.component;
                return (
                  <Tabs.Content
                    key={tab.id}
                    value={tab.id}
                    forceMount={tab.id === activeTab ? true : undefined}
                    className={cn(
                      tab.id !== activeTab && 'hidden',
                    )}
                  >
                    <Suspense fallback={<WidgetFallback />}>
                      <ErrorBoundary name={tab.name}>
                        <Component />
                      </ErrorBoundary>
                    </Suspense>
                  </Tabs.Content>
                );
              })}
            </div>
          }
        />
      </div>
    </Tabs.Root>
  );
}
