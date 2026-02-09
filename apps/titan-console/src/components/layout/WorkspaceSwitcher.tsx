/**
 * WorkspaceSwitcher — TopBar Dropdown
 *
 * Shows the active workspace name + icon with a dropdown to switch.
 * Keyboard shortcut badges (⌘1–⌘7) shown alongside each workspace.
 */

import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export function WorkspaceSwitcher() {
  const { workspace, workspaces, switchWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const Icon = workspace.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          'text-foreground hover:bg-muted',
          open && 'bg-muted',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Switch workspace"
      >
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span>{workspace.name}</span>
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Workspaces"
          className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-popover p-1 shadow-lg animate-fade-in"
        >
          {workspaces.map((ws) => {
            const WIcon = ws.icon;
            const isActive = ws.id === workspace.id;
            return (
              <button
                key={ws.id}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  switchWorkspace(ws.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <WIcon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1 text-left font-medium">{ws.name}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xxs text-muted-foreground">
                  ⌘{ws.shortcutKey}
                </kbd>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
