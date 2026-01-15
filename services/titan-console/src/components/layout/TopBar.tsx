import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CommandPalette } from '@/components/titan/CommandPalette';
import { Lock, Unlock, Wifi, WifiOff, Clock } from 'lucide-react';

type Environment = 'local' | 'testnet' | 'prod';

const envConfig = {
  local: { label: 'Local', color: 'bg-muted text-muted-foreground' },
  testnet: { label: 'Testnet', color: 'bg-phase-hunter/20 text-phase-hunter' },
  prod: { label: 'Production', color: 'bg-status-critical/20 text-status-critical' },
};

interface TopBarProps {
  safetyLocked: boolean;
  onSafetyToggle: () => void;
}

export function TopBar({ safetyLocked, onSafetyToggle }: TopBarProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [clockSynced, setClockSynced] = useState(true);
  
  // Determine environment from VITE_APP_ENV or MODE or window location
  const getInitialEnv = (): Environment => {
    const envVar = import.meta.env.VITE_APP_ENV as string;
    if (envVar === 'prod' || envVar === 'production') return 'prod';
    if (envVar === 'testnet') return 'testnet';
    if (envVar === 'local') return 'local';
    
    // Check hostname for production indicators
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname.includes('railway.app') && hostname.includes('production')) return 'prod';
      if (hostname.includes('railway.app') && hostname.includes('testnet')) return 'testnet';
    }

    return import.meta.env.MODE === 'production' ? 'prod' : 'local';
  };

  const [environment] = useState<Environment>(getInitialEnv);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const env = envConfig[environment];

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      {/* Left section */}
      <div className="flex items-center gap-3">
        {/* Environment pill */}
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xxs font-semibold uppercase tracking-wider',
            env.color
          )}
        >
          {env.label}
        </span>

        {/* Clock sync indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {clockSynced ? (
            <Wifi className="h-3.5 w-3.5 text-status-healthy" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-status-critical" />
          )}
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono text-muted-foreground">
            {currentTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
        </div>
      </div>

      {/* Center - Command Palette */}
      <div className="flex-1 flex justify-center max-w-md mx-4">
        <CommandPalette />
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Safety Lock */}
        <button
          onClick={onSafetyToggle}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            safetyLocked
              ? 'bg-status-critical/10 text-status-critical hover:bg-status-critical/20'
              : 'bg-status-healthy/10 text-status-healthy hover:bg-status-healthy/20'
          )}
        >
          {safetyLocked ? (
            <>
              <Lock className="h-3.5 w-3.5" />
              <span>Locked</span>
            </>
          ) : (
            <>
              <Unlock className="h-3.5 w-3.5" />
              <span>Unlocked</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
