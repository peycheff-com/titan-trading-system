import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [safetyLocked, setSafetyLocked] = useState(true);

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          safetyLocked={safetyLocked}
          onSafetyToggle={() => setSafetyLocked(!safetyLocked)}
        />
        <main className="flex-1 overflow-y-auto scrollbar-titan">
          <div className="container py-6">
            <Outlet context={{ safetyLocked }} />
          </div>
        </main>
      </div>
    </div>
  );
}
