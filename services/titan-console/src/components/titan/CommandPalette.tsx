import { useEffect, useState } from 'react';
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
import {
  LayoutDashboard,
  Radio,
  Bug,
  Target,
  Shield,
  Brain,
  Cpu,
  Zap,
  BookOpen,
  Bell,
  Server,
  Search,
} from 'lucide-react';

const routes = [
  { name: 'Overview', path: '/', icon: LayoutDashboard, group: 'Command' },
  { name: 'Live Ops', path: '/live', icon: Radio, group: 'Command' },
  { name: 'Scavenger Phase', path: '/phases/scavenger', icon: Bug, group: 'Strategy Phases' },
  { name: 'Hunter Phase', path: '/phases/hunter', icon: Target, group: 'Strategy Phases' },
  { name: 'Sentinel Phase', path: '/phases/sentinel', icon: Shield, group: 'Strategy Phases' },
  { name: 'Brain', path: '/brain', icon: Brain, group: 'Organs' },
  { name: 'AI Quant', path: '/ai-quant', icon: Cpu, group: 'Organs' },
  { name: 'Execution', path: '/execution', icon: Zap, group: 'Organs' },
  { name: 'Journal & Forensics', path: '/journal', icon: BookOpen, group: 'Ops' },
  { name: 'Alerts & Incidents', path: '/alerts', icon: Bell, group: 'Ops' },
  { name: 'Infra / DR', path: '/infra', icon: Server, group: 'Ops' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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

  const groups = routes.reduce(
    (acc, route) => {
       
      if (!acc[route.group]) acc[route.group] = [];
       
      acc[route.group].push(route);
      return acc;
    },
    {} as Record<string, typeof routes>,
  );

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
        <CommandInput placeholder="Search pages, commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {Object.entries(groups).map(([group, items], index) => (
            <div key={group}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((route) => (
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
