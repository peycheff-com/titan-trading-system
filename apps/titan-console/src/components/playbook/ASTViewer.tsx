import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Zap, Shield, Eye } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ASTViewerProps {
  ast: Record<string, unknown>;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

function JSONNode({ label, value, level = 0, danger = false }: { label: string; value: unknown; level?: number; danger?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const isObject = typeof value === 'object' && value !== null;
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div className="flex items-start gap-2 py-0.5 font-mono text-xs hover:bg-muted/30 rounded px-1" style={{ paddingLeft: `${level * 12}px` }}>
        <span className="text-muted-foreground">{label}:</span>
        <span className={cn(
          "break-all",
          typeof value === 'string' ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400",
          danger && "text-status-critical font-bold"
        )}>
          {JSON.stringify(value)}
        </span>
      </div>
    );
  }

  return (
    <div className="font-mono text-xs">
      <button 
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 py-0.5 w-full hover:bg-muted/30 rounded px-1 text-left",
          danger && "bg-status-critical/10 hover:bg-status-critical/20"
        )}
        style={{ paddingLeft: `${level * 12}px` }}
      >
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className={cn("font-semibold text-foreground", danger && "text-status-critical")}>{label}</span>
        <span className="text-muted-foreground text-xxs">
          {isArray ? `[${value.length}]` : `{...}`}
        </span>
      </button>
      
      {expanded && (
        <div className="border-l border-border/40 ml-1.5 pl-1">
          {Object.entries(value).map(([k, v]) => (
            <JSONNode key={k} label={k} value={v} level={level + 1} danger={danger || (k === 'dangerLevel' && v === 'critical')} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ASTViewer({ ast, readOnly = true }: ASTViewerProps) {
  const safetyScore = (typeof ast.safetyScore === 'number' ? ast.safetyScore : 100); // Mock score if not present
  const isSafe = safetyScore > 80;

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Automation Object (AST)</h3>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xxs font-medium uppercase border",
          isSafe ? "bg-status-healthy/10 text-status-healthy border-status-healthy/20" : "bg-status-critical/10 text-status-critical border-status-critical/20"
        )}>
          {isSafe ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          <span>Safety: {safetyScore}%</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-titan">
         {/* Metadata Section */}
         <div className="mb-4">
           <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Metadata</h4>
           <div className="space-y-1">
             <div className="flex items-center justify-between text-xs px-2 py-1 bg-muted/20 rounded">
               <span className="text-muted-foreground">ID</span>
               <span className="font-mono text-foreground">{String(ast.id || 'N/A')}</span>
             </div>
             <div className="flex items-center justify-between text-xs px-2 py-1 bg-muted/20 rounded">
               <span className="text-muted-foreground">Version</span>
               <span className="font-mono text-foreground">{String(ast.version || '1.0.0')}</span>
             </div>
           </div>
         </div>

         {/* Logic Tree */}
         <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Logic Tree</h4>
         <div className="bg-background rounded border border-border/50 p-2">
           {Object.entries(ast).filter(([k]) => !['id', 'version', 'safetyScore'].includes(k)).map(([key, value]) => (
             <JSONNode key={key} label={key} value={value} />
           ))}
         </div>
      </div>
      
      {/* Footer / Actions */}
      {!readOnly && (
        <div className="p-2 border-t border-border bg-muted/30 flex justify-end">
           <button className="flex items-center gap-1.5 text-xs text-primary hover:underline">
             <Eye className="h-3 w-3" />
             View Raw JSON
           </button>
        </div>
      )}
    </div>
  );
}
