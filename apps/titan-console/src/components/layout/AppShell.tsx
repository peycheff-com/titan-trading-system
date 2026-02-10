/**
 * AppShell — Operator OS 3-Panel Layout
 *
 * Top-level authenticated layout:
 *  - Left Rail (Sidebar) — nav, health dots
 *  - Center Workspace (WorkspaceLayout) — tabbed, with optional bottom panel
 *  - Right Inspector Panel — entity-agnostic, resizable, collapsible
 *
 * Provider stack (outer → inner):
 *  WorkspaceProvider → DensityProvider → InspectorProvider
 */

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { AttentionBanner } from '@/components/titan/AttentionBanner';
import { NotificationInbox } from '@/components/titan/NotificationInbox';
import { IncidentTimeline } from '@/components/replay/IncidentTimeline';
import { ReplayOverlay } from '@/components/replay/ReplayOverlay';
import { InspectorPanel } from './InspectorPanel';
import { WorkspaceLayout } from './WorkspaceLayout';
import { InspectorProvider, useInspector } from '@/context/InspectorContext';
import { DensityProvider } from '@/context/DensityContext';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import { useScreenSize } from '@/hooks/use-media-query';
import { Sheet, SheetContent } from '@/components/ui/sheet';

function AppShellContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isMobile } = useScreenSize();
  const { isOpen, setOpen } = useInspector();

  return (
    <div className="flex h-screen w-full bg-background">
      {/* Left Rail - Desktop Only */}
      {!isMobile && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Main Area (TopBar + Center + Inspector) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AttentionBanner />
        <TopBar />

        <div className="flex flex-1 overflow-hidden">
          {/* Center Workspace — tabbed layout engine */}
          <WorkspaceLayout />

          {/* Inspector Panel - Desktop Only (In-flow) */}
          {!isMobile && <InspectorPanel />}
        </div>
      </div>

      {/* Inspector Panel - Mobile Only (Sheet) */}
      {isMobile && (
        <Sheet open={isOpen} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0 gap-0">
             <InspectorPanel />
          </SheetContent>
        </Sheet>
      )}
      
      {/* Global Inbox Drawer */}
      <NotificationInbox />

      {/* Time Travel Timeline Overlay */}
      <IncidentTimeline />
      
      {/* Visual Filter for Replay Mode */}
      <ReplayOverlay />
    </div>
  );
}

export function AppShell() {
  return (
    <WorkspaceProvider>
      <DensityProvider>
        <InspectorProvider>
          <AppShellContent />
        </InspectorProvider>
      </DensityProvider>
    </WorkspaceProvider>
  );
}
