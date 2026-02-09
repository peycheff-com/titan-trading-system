import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NAV_GROUPS } from "@/config/navigation";
import { useWorkspace } from "@/context/WorkspaceContext";
import { WORKSPACES } from "@/config/workspaces";
import { cn } from "@/lib/utils";
import { Menu, Zap } from "lucide-react";
import { useState } from "react";

const phaseColors = {
  scavenger: 'text-phase-scavenger',
  hunter: 'text-phase-hunter',
  sentinel: 'text-phase-sentinel',
} as const;

function pathToWorkspaceTab(path: string): { workspaceId: string; tabId: string } | null {
  // Build a reverse map from path → widget ID → workspace
  const pathToWidgetId: Record<string, string> = {
    '/': 'chatops',
    '/overview': 'overview',
    '/live': 'live',
    '/trade': 'trade',
    '/risk': 'risk',
    '/phases/scavenger': 'scavenger',
    '/phases/hunter': 'hunter',
    '/phases/sentinel': 'sentinel',
    '/brain': 'brain',
    '/ai-quant': 'ai-quant',
    '/execution': 'execution',
    '/decision-log': 'decision-log',
    '/journal': 'journal',
    '/history': 'history',
    '/alerts': 'alerts',
    '/infra': 'infra',
    '/powerlaw': 'powerlaw',
    '/config': 'config',
    '/venues': 'venues',
    '/credentials': 'credentials',
    '/identity': 'identity',
    '/settings': 'settings',
  };

  const tabId = pathToWidgetId[path];
  if (!tabId) return null;

  // Find workspace that contains this tab
  for (const ws of WORKSPACES) {
    if (ws.tabs.includes(tabId)) {
      return { workspaceId: ws.id, tabId };
    }
  }
  return null;
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { workspace, activeTab, switchWorkspace, switchTab } = useWorkspace();

  const handleNavClick = (path: string) => {
    const target = pathToWorkspaceTab(path);
    if (!target) return;
    
    if (target.workspaceId !== workspace.id) {
      switchWorkspace(target.workspaceId);
    }
    switchTab(target.tabId);
    setOpen(false);
  };

  const isItemActive = (path: string): boolean => {
    const target = pathToWorkspaceTab(path);
    if (!target) return false;
    return target.workspaceId === workspace.id && target.tabId === activeTab;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[80vw] sm:w-[350px] p-0">
        <SheetHeader className="h-14 flex flex-row items-center border-b border-border px-4 space-y-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <SheetTitle className="text-base font-semibold">TITAN OS</SheetTitle>
          </div>
        </SheetHeader>
        
        <ScrollArea className="h-[calc(100vh-3.5rem)]">
          <div className="flex flex-col gap-6 p-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.group}>
                <h4 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </h4>
                <div className="grid grid-cols-1 gap-1">
                  {group.items.map((item) => {
                    const isActive = isItemActive(item.path);
                    const Icon = item.icon;
                    
                    return (
                      <Button
                        key={item.path}
                        variant={isActive ? "secondary" : "ghost"}
                        className={cn(
                          "w-full justify-start gap-3",
                          isActive && "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                        onClick={() => handleNavClick(item.path)}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            item.phase && !isActive && phaseColors[item.phase]
                          )}
                        />
                        {item.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
