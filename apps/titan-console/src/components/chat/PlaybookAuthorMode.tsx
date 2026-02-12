import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ASTViewer } from '@/components/playbook/ASTViewer';
import { SimulationPanel } from '@/components/playbook/SimulationPanel';
import { Bot, User, Send, ArrowLeft, Save, Split, Maximize2, Minimize2 } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Mock Data Generators (Stub for real backend)
// ---------------------------------------------------------------------------

const MOCK_AST_TEMPLATE = {
  id: "runbook-draft-1",
  version: "0.1.0",
  type: "automation_object",
  title: "Auto-Scale & Throttle",
  trigger: {
    type: "threshold_exceeded",
    metric: "latency_p99",
    value: 500,
    window: "1m"
  },
  actions: [
    {
      type: "scale_service",
      service: "scavenger",
      replicas: 10,
      strategy: "linear"
    },
    {
      type: "throttle_traffic",
      phase: "phase2",
      pct: 25,
      dangerLevel: "moderate"
    }
  ],
  safetyScore: 92
};

const MOCK_SIMULATION_RESULT = {
  passed: true,
  score: 95,
  steps: [
    { id: '1', action: 'CHECK_METRIC(latency_p99)', result: 'success' as const, output: 'Current: 520ms > Threshold: 500ms', timestamp: '10:00:01' },
    { id: '2', action: 'SCALE_SERVICE(scavenger)', result: 'success' as const, output: 'Scaled to 10 replicas', timestamp: '10:00:02' },
    { id: '3', action: 'THROTTLE(phase2)', result: 'success' as const, output: 'Throttled to 25%', timestamp: '10:00:03' },
    { id: '4', action: 'VERIFY_STABILITY', result: 'success' as const, output: 'Latency dropped to 120ms', timestamp: '10:00:15' }
  ],
  stateDiff: {
    before: { latency: 520, replicas: 4 },
    after: { latency: 120, replicas: 10 }
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlaybookAuthorMode({ onExit }: { onExit: () => void }) {
  // State
  const [messages, setMessages] = useState<{role: 'system' | 'user', content: string}[]>([
    { role: 'system', content: 'Playbook Construction Mode. Describe the automation logic you want to build.' }
  ]);
  const [input, setInput] = useState('');
  const [currentAST, setCurrentAST] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState<'ast' | 'simulation'>('ast');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<typeof MOCK_SIMULATION_RESULT | undefined>(undefined);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input on mount (accessibility: manual focus is preferred over autoFocus)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handlers
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setInput('');

    // Mock AI Processing
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'system', content: "Generating automation logic based on your description..." }]);
      
      // Update AST after a "delay"
      setTimeout(() => {
        setCurrentAST(MOCK_AST_TEMPLATE);
        setActiveTab('ast');
        setMessages(prev => [...prev, { role: 'system', content: "Draft compiled. Review the Logic Tree on the right." }]);
      }, 1500);
    }, 800);
  };

  const handleRunSimulation = async (time: string) => {
    setIsSimulating(true);
    // Mock simulation delay
    return new Promise<typeof MOCK_SIMULATION_RESULT>((resolve) => {
      setTimeout(() => {
        setIsSimulating(false);
        setSimulationResult(MOCK_SIMULATION_RESULT);
        resolve(MOCK_SIMULATION_RESULT);
      }, 2000);
    });
  };

  const handleSave = () => {
    toast.success("Playbook 'Auto-Scale & Throttle' registered successfully.");
    onExit();
  };

  return (
    <div className="flex h-full w-full bg-background relative">
      {/* Left Pane: Chat Interface */}
      <div className="flex-1 flex flex-col border-r border-border min-w-[320px]">
        {/* Header */}
        <div className="h-12 border-b border-border flex items-center px-4 justify-between bg-muted/20">
          <div className="flex items-center gap-2">
            <button onClick={onExit} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h2 className="font-semibold text-sm">Playbook Author</h2>
          </div>
          <div className="px-2 py-0.5 bg-primary/10 text-primary text-xxs font-medium rounded uppercase tracking-wider">
             Creator Mode
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
             <div key={idx} className={cn("flex gap-3 max-w-[90%]", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
                <div className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0",
                  msg.role === 'system' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {msg.role === 'system' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "rounded-lg p-3 text-sm",
                  msg.role === 'system' ? "bg-muted/50 text-foreground" : "bg-primary text-primary-foreground"
                )}>
                  {msg.content}
                </div>
             </div>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <form onSubmit={handleSend} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe automation logic (e.g. 'If latency > 500ms...')"
              className="w-full rounded-md border border-border bg-background pl-4 pr-10 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button 
              type="submit" 
              disabled={!input.trim()}
              className="absolute right-1.5 top-1.5 p-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* Right Pane: AST & Simulation */}
      <div className="flex-1 flex flex-col min-w-[320px] bg-card/50">
        {/* Tab Header */}
        <div className="h-12 border-b border-border flex items-center px-2 gap-2 bg-muted/20">
          <button 
            onClick={() => setActiveTab('ast')}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-2",
              activeTab === 'ast' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
            )}
          >
            <Split className="h-3.5 w-3.5" /> Logic Tree
          </button>
          <button 
             onClick={() => setActiveTab('simulation')}
             className={cn(
              "px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-2",
              activeTab === 'simulation' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-background/50"
            )}
            disabled={!currentAST}
          >
            <Maximize2 className="h-3.5 w-3.5" /> Simulation
          </button>
          
          <div className="ml-auto flex items-center gap-2">
             {currentAST && simulationResult?.passed && (
               <button 
                 onClick={handleSave}
                 className="flex items-center gap-1.5 bg-status-healthy text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-green-600 transition-colors shadow-sm"
               >
                 <Save className="h-3.5 w-3.5" /> Register Playbook
               </button>
             )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
           {activeTab === 'ast' && (
             currentAST ? <ASTViewer ast={currentAST} readOnly={false} /> : (
               <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border/50 rounded-lg">
                 <Bot className="h-8 w-8 mb-2 opacity-50" />
                 <p className="text-sm">Describe logic to generate AST</p>
               </div>
             )
           )}

           {activeTab === 'simulation' && currentAST && (
             <SimulationPanel 
               onRun={handleRunSimulation} 
               isSimulating={isSimulating} 
               result={simulationResult} 
             />
           )}
        </div>
      </div>
    </div>
  );
}
