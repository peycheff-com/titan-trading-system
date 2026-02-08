import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/titan/StatusPill';
import { NAV_GROUPS } from '@/config/navigation';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { Zap, ChevronLeft, ChevronRight } from 'lucide-react';

const phaseColors = {
  scavenger: 'text-phase-scavenger',
  hunter: 'text-phase-hunter',
  sentinel: 'text-phase-sentinel',
} as const;

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Derive health status from WS connection.
 * In a future PR this will read per-service health from the WS stream;
 * for now it reflects overall connection status.
 */
function useServiceHealth() {
  const { status } = useTitanWebSocket();
  const connected = status === 'CONNECTED';
  return {
    brain: { status: connected ? 'healthy' : 'critical' },
    execution: { status: connected ? 'healthy' : 'critical' },
    marketWs: { status: connected ? 'healthy' : 'critical' },
  } as const;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const systemHealth = useServiceHealth();

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-200',
        collapsed ? 'w-14' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground">TITAN</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className={cn(
            'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed && 'mx-auto',
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Health indicators — driven by WS connection */}
      <div className={cn('border-b border-border px-3 py-2', collapsed && 'px-2')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <StatusDot status={systemHealth.brain.status} size="sm" />
            <StatusDot status={systemHealth.execution.status} size="sm" />
            <StatusDot status={systemHealth.marketWs.status} size="sm" />
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xxs">
              <StatusDot status={systemHealth.brain.status} size="xs" />
              <span className="text-muted-foreground">Brain</span>
            </div>
            <div className="flex items-center gap-2 text-xxs">
              <StatusDot status={systemHealth.execution.status} size="xs" />
              <span className="text-muted-foreground">Execution</span>
            </div>
            <div className="flex items-center gap-2 text-xxs">
              <StatusDot status={systemHealth.marketWs.status} size="xs" />
              <span className="text-muted-foreground">Market WS</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation — from shared config */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-titan">
        {NAV_GROUPS.map((group) => (
          <div key={group.group} className="mb-4">
            {!collapsed && (
              <h3 className="mb-1 px-2 text-xxs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.group}
              </h3>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;

                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                      title={collapsed ? item.name : undefined}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 flex-shrink-0',
                          item.phase && !isActive && phaseColors[item.phase],
                        )}
                      />
                      {!collapsed && <span>{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
