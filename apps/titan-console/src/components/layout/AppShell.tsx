/**
 * AppShell — Operator OS 3-Panel Layout
 *
 * Replaces AppLayout with:
 *  - Left Rail (Sidebar)
 *  - Center Workspace (Outlet)
 *  - Right Inspector Panel (entity-agnostic, resizable, collapsible)
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { InspectorPanel } from './InspectorPanel';
import { InspectorProvider } from '@/context/InspectorContext';
import { DensityProvider } from '@/context/DensityContext';
import { cn } from '@/lib/utils';

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <DensityProvider>
      <InspectorProvider>
        <div className="flex h-screen w-full bg-background">
          {/* Left Rail */}
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />

          {/* Main Area (TopBar + Center + Inspector) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar />

            <div className="flex flex-1 overflow-hidden">
              {/* Center Workspace */}
              <main className="flex-1 overflow-y-auto scrollbar-titan">
                <div className="px-6 py-4">
                  <Outlet />
                </div>
              </main>

              {/* Inspector Panel */}
              <InspectorPanel />
            </div>
          </div>
        </div>
      </InspectorProvider>
    </DensityProvider>
  );
}
