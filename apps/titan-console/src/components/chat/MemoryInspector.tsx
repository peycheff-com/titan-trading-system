import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Brain, Pin, Trash2, Eye, Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryChunk {
  id: string;
  type: 'system' | 'pinned' | 'working';
  content: string;
  timestamp: string;
  tokens: number;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Mock Data (SOTA: Fetch from /operator/memory)
// ---------------------------------------------------------------------------

const MOCK_MEMORY: MemoryChunk[] = [
  {
    id: 'sys-001',
    type: 'system',
    content: 'You are Titan Operator OS. You prioritize safety and stability. Do not hallucinate.',
    timestamp: new Date().toISOString(),
    tokens: 45,
    metadata: { version: 'v2.0.4' },
  },
  {
    id: 'pin-001',
    type: 'pinned',
    content: 'CRITICAL: Phase 1 is in maintenance mode until 14:00 UTC.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    tokens: 22,
  },
  {
    id: 'work-001',
    type: 'working',
    content: 'User: Analysis on Ph2 latency?',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    tokens: 12,
  },
  {
    id: 'work-002',
    type: 'working',
    content: 'Assistant: [ActionCard: Throttle Phase 2]',
    timestamp: new Date(Date.now() - 290000).toISOString(),
    tokens: 35,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryInspector() {
  const [memory, setMemory] = useState<MemoryChunk[]>(MOCK_MEMORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleDelete = (id: string, type: string) => {
    if (type === 'system') return;
    setMemory((prev) => prev.filter((m) => m.id !== id));
    toast.success('Memory chunk pruned');
    if (selectedId === id) setSelectedId(null);
  };

  const handleClearWorking = () => {
    setMemory((prev) => prev.filter((m) => m.type !== 'working'));
    toast.success('Working memory cleared');
  };

  const totalTokens = memory.reduce((acc, m) => acc + m.tokens, 0);
  const contextLimit = 128000;
  const usagePct = (totalTokens / contextLimit) * 100;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header / Stats */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Context Memory</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title={`${totalTokens} / ${contextLimit} tokens`}>
             <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
               <div 
                 className={cn("h-full transition-all", usagePct > 80 ? "bg-status-critical" : "bg-status-healthy")} 
                 style={{ width: `${Math.max(usagePct, 5)}%` }} 
               />
             </div>
             <span className="font-mono">{Math.round(usagePct)}%</span>
          </div>
          <button 
            onClick={handleClearWorking}
            className="flex items-center gap-1 hover:text-status-critical transition-colors"
            title="Clear Working Memory"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Memory Stack */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* System Prompt (Locked) */}
        <section className="space-y-2">
          <h3 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> System Prompt
          </h3>
          {memory.filter(m => m.type === 'system').map(chunk => (
            <MemoryCard key={chunk.id} chunk={chunk} onDelete={handleDelete} />
          ))}
        </section>

        {/* Pinned Context */}
        <section className="space-y-2">
          <h3 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Pin className="h-3 w-3" /> Pinned Context
          </h3>
           {memory.filter(m => m.type === 'pinned').map(chunk => (
            <MemoryCard key={chunk.id} chunk={chunk} onDelete={handleDelete} />
          ))}
          {memory.filter(m => m.type === 'pinned').length === 0 && (
            <div className="text-xs text-muted-foreground italic px-2">No pinned context.</div>
          )}
        </section>

        {/* Working Memory */}
        <section className="space-y-2">
          <h3 className="text-xxs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="h-3 w-3" /> Working Memory
          </h3>
           {memory.filter(m => m.type === 'working').map(chunk => (
            <MemoryCard key={chunk.id} chunk={chunk} onDelete={handleDelete} />
          ))}
           {memory.filter(m => m.type === 'working').length === 0 && (
            <div className="text-xs text-muted-foreground italic px-2">Working memory empty.</div>
          )}
        </section>

      </div>
    </div>
  );
}

function MemoryCard({ chunk, onDelete }: { chunk: MemoryChunk; onDelete: (id: string, type: string) => void }) {
  const isSystem = chunk.type === 'system';

  return (
    <div className={cn(
      "group relative rounded-lg border p-3 text-xs transition-colors hover:bg-muted/30",
      isSystem ? "border-primary/20 bg-primary/5" : "border-border bg-card"
    )}>
      
      {/* Access Controls */}
      {!isSystem && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button 
            onClick={() => onDelete(chunk.id, chunk.type)}
            className="p-1 rounded hover:bg-background text-muted-foreground hover:text-status-critical"
            title="Prune memory"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="pr-6">
        <p className="font-mono text-foreground/90 whitespace-pre-wrap break-all line-clamp-3">
          {chunk.content}
        </p>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
        <span>{chunk.tokens} toks</span>
        <span>•</span>
        <time>{new Date(chunk.timestamp).toLocaleTimeString()}</time>
        {chunk.metadata?.version && (
           <>
             <span>•</span>
             <span className="text-primary">{chunk.metadata.version}</span>
           </>
        )}
      </div>
    
    </div>
  );
}
