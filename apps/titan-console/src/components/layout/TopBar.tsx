import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CommandPalette } from '@/components/titan/CommandPalette';
import { TruthStatusBar } from '@/components/titan/TruthStatusBar';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { useSafety } from '@/context/SafetyContext';
import { useDensity } from '@/context/DensityContext';
import { useAttention } from '@/context/AttentionContext';
import { Lock, Unlock, Shield, ShieldAlert, Bell, Maximize2, Minimize2, PanelRightOpen, PanelRightClose } from 'lucide-react';
// Mobile support
import { useScreenSize } from '@/hooks/use-media-query';
import { MobileNav } from './MobileNav';
import { useTitanWebSocket } from '@/context/WebSocketContext';
import { StatusDot } from '@/components/titan/StatusPill';
import { useInspector } from '@/context/InspectorContext';
import { ReplayControls } from '@/components/replay/ReplayControls';

type Environment = 'local' | 'testnet' | 'prod';

const envConfig = {
  local: { label: 'Local', color: 'bg-muted text-muted-foreground' },
  testnet: { label: 'Testnet', color: 'bg-phase-hunter/20 text-phase-hunter' },
  prod: { label: 'Production', color: 'bg-status-critical/20 text-status-critical' },
};

// Determine environment from VITE_APP_ENV or MODE or window location
function getInitialEnv(): Environment {
  const envVar = import.meta.env.VITE_APP_ENV as string;
  if (envVar === 'prod' || envVar === 'production') return 'prod';
  if (envVar === 'testnet') return 'testnet';
  if (envVar === 'local') return 'local';

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('ondigitalocean.app') && hostname.includes('production')) return 'prod';
    if (hostname.includes('ondigitalocean.app') && hostname.includes('testnet')) return 'testnet';
  }

  return import.meta.env.MODE === 'production' ? 'prod' : 'local';
}

/**
 * TopBar — Operator OS header
 *
 * No longer receives props — reads safety from SafetyContext,
 * density from DensityContext.
 */
export function TopBar() {
  const { isArmed, armConsole, disarmConsole } = useSafety();
  const { mode: densityMode, toggle: toggleDensity } = useDensity();
  const { unreadCount, setInboxOpen } = useAttention();
  const [environment] = useState<Environment>(getInitialEnv);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Mobile / Responsive hooks
  const { isMobile } = useScreenSize();
  const { status: wsStatus } = useTitanWebSocket();
  const { isOpen: inspectorOpen, toggle: toggleInspector } = useInspector();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const env = envConfig[environment];
  
  // Simplified Mobile Status
  const wsConnected = wsStatus === 'CONNECTED';
  const mobileHealth = wsConnected ? 'healthy' : 'critical';

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: Env pill + Workspace Switcher + Time */}
      <div className="flex items-center gap-3">
        {isMobile && <MobileNav />}
        
        {!isMobile && (
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xxs font-semibold uppercase tracking-wider',
              env.color,
            )}
          >
            {env.label}
          </span>
        )}

        <WorkspaceSwitcher />

        {!isMobile && (
          <span className="font-mono text-xs text-muted-foreground">
            {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
        )}
      </div>

      {/* Center: CommandPalette + Truth + Replay */}
      {!isMobile ? (
        <div className="flex flex-1 items-center justify-center gap-4 max-w-lg mx-4">
          <ReplayControls />
          <CommandPalette />
          <TruthStatusBar />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
            {/* Mobile Status Dots in Center */}
            {/* Mobile Replay Controls? Maybe specialized or hidden */}
            <div className="flex items-center gap-1.5">
                <StatusDot status={mobileHealth} size="sm" />
                <span className="text-xs font-bold text-foreground/80">TITAN</span>
            </div>
        </div>
      )}

      {/* Right: Posture chip + Density toggle + Notifications + Safety */}
      <div className="flex items-center gap-2">
        {/* Posture chip - Hide label on mobile */}
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xxs font-semibold uppercase tracking-wider',
            isArmed
              ? 'bg-status-critical/15 text-status-critical'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isArmed ? (
            <>
              <ShieldAlert className="h-3 w-3" />
              {!isMobile && "Armed"}
            </>
          ) : (
            <>
              <Shield className="h-3 w-3" />
              {!isMobile && "Disarmed"}
            </>
          )}
        </span>

        {/* Density toggle - Desktop Only */}
        {!isMobile && (
          <button
            onClick={toggleDensity}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={`Switch to ${densityMode === 'comfortable' ? 'compact' : 'comfortable'} mode (⌘.)`}
            aria-label="Toggle density"
          >
            {densityMode === 'comfortable' ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        )}

        {/* Notifications bell */}
        <button
          onClick={() => setInboxOpen(true)}
          className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Notifications"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-status-critical ring-2 ring-card" />
          )}
        </button>
        
        {/* Inspector Toggle - Mobile Only */}
        {isMobile && (
           <button
             onClick={toggleInspector}
             className={cn(
               "rounded-md p-1.5 transition-colors",
               inspectorOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
             )}
             aria-label="Toggle Inspector"
           >
             {inspectorOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
           </button>
        )}

        {/* Safety lock - Icon only on mobile */}
        <button
          onClick={() => (isArmed ? disarmConsole() : armConsole())}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            isArmed
              ? 'bg-status-critical/10 text-status-critical hover:bg-status-critical/20'
              : 'bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20',
            isMobile && 'px-2'
          )}
        >
          {isArmed ? (
            <>
              <Unlock className="h-3.5 w-3.5" />
              {!isMobile && <span>Disarm</span>}
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              {!isMobile && <span>Arm</span>}
            </>
          )}
        </button>
      </div>
    </header>
  );
}
