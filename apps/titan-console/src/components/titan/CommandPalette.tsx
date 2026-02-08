import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Search, Shield, ShieldOff, Gauge, RefreshCcw, XCircle, AlertTriangle } from 'lucide-react';
import { NAV_GROUPS } from '@/config/navigation';
import { compileNLToIntent } from '@/lib/intentCompiler';
import { useSafety } from '@/context/SafetyContext';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Action commands shown in ⌘K alongside navigation
// ---------------------------------------------------------------------------

interface ActionCommand {
  name: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  danger: 'safe' | 'moderate' | 'critical';
  execute: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { armConsole, disarmConsole, isArmed, toggleArmed } = useSafety();

  // Build action commands
  const actionCommands: ActionCommand[] = [
    {
      name: 'Arm System',
      keywords: 'arm enable danger',
      icon: Shield,
      danger: 'moderate',
      execute: () => {
        armConsole();
        toast.warning('Console armed — dangerous controls active');
      },
    },
    {
      name: 'Disarm System',
      keywords: 'disarm disable safe',
      icon: ShieldOff,
      danger: 'safe',
      execute: () => {
        disarmConsole();
        toast.info('Console disarmed');
      },
    },
    {
      name: 'Throttle Phase…',
      keywords: 'throttle phase scavenger hunter sentinel',
      icon: Gauge,
      danger: 'moderate',
      execute: () => {
        navigate('/');
        toast.info('Use chat: "throttle scavenger 50%"');
      },
    },
    {
      name: 'Run Reconciliation',
      keywords: 'reconcile reconciliation check',
      icon: RefreshCcw,
      danger: 'safe',
      execute: () => {
        toast.info('Reconciliation command sent to chat');
        navigate('/');
      },
    },
    {
      name: 'Flatten All (DANGER)',
      keywords: 'flatten close all positions emergency',
      icon: XCircle,
      danger: 'critical',
      execute: () => {
        if (!isArmed) {
          toast.error('Console must be Armed to execute FLATTEN. Arm first.');
          return;
        }
        navigate('/');
        toast.warning('Use chat to confirm: "flatten all"');
      },
    },
    {
      name: 'Override Risk (DANGER)',
      keywords: 'override risk limit parameter',
      icon: AlertTriangle,
      danger: 'critical',
      execute: () => {
        if (!isArmed) {
          toast.error('Console must be Armed for risk overrides.');
          return;
        }
        navigate('/');
        toast.warning('Use chat: "override risk <key> <value>"');
      },
    },
  ];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const handleAction = (cmd: ActionCommand) => {
    cmd.execute();
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-xxs text-muted-foreground sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, commands, actions..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Action commands */}
          <CommandGroup heading="Actions">
            {actionCommands.map((cmd) => (
              <CommandItem
                key={cmd.name}
                value={`${cmd.name} ${cmd.keywords}`}
                onSelect={() => handleAction(cmd)}
                className="flex items-center gap-2"
              >
                <cmd.icon className={`h-4 w-4 ${
                  cmd.danger === 'critical'
                    ? 'text-status-critical'
                    : cmd.danger === 'moderate'
                      ? 'text-status-degraded'
                      : 'text-muted-foreground'
                }`} />
                <span>{cmd.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Navigation */}
          {NAV_GROUPS.map((navGroup, index) => (
            <div key={navGroup.group}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={navGroup.group}>
                {navGroup.items
                  .filter((item) => item.searchable !== false)
                  .map((route) => (
                    <CommandItem
                      key={route.path}
                      value={route.name}
                      onSelect={() => handleSelect(route.path)}
                      className="flex items-center gap-2"
                    >
                      <route.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{route.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
