/**
 * ChatTranscript
 *
 * Operator chat center pane. Backend-authoritative: intent status comes
 * from SSE stream, never from local assumptions.
 *
 * Integrates useIntentStream for live status updates.
 * Tracks operator state_hash for OCC and passes to ActionCard.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { compileNLToIntent, type CompiledIntent } from '@/lib/intentCompiler';
import {
  useOperatorIntents,
  useIntentStream,
  type IntentStatus,
  type IntentUpdateEvent,
} from '@/hooks/useOperatorIntents';
import { ActionCard } from './ActionCard';
import { IntentTimeline } from './IntentTimeline';
import { A2UIRenderer } from './A2UIRenderer';
import { MultimodalInput } from './MultimodalInput';
import { PlaybookAuthorMode } from './PlaybookAuthorMode';
import type { A2UISpec } from '@/lib/a2ui/schema';
import { Bot, User, AlertCircle, Wifi, WifiOff, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { useInspector } from '@/context/InspectorContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'operator' | 'system';
  content: string;
  timestamp: Date;
  intent?: CompiledIntent;
  /** A2UI spec payload — when present, renders declarative components */
  uiSpec?: A2UISpec;
  /** Backend intent ID (set after submission) */
  intentId?: string;
  /** Status from SSE stream — never set locally except on submission ack */
  intentStatus?: IntentStatus;
  error?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatTranscript() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Titan Operator Console online. Type a command or use ⌘K.',
      timestamp: new Date(),
    },
  ]);
  const [isAuthorMode, setIsAuthorMode] = useState(false);

  const stateHashRef = useRef<string | undefined>();
  const [stateHash, setStateHash] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { submitIntent, getOperatorState } = useOperatorIntents();
  const { inspect } = useInspector();

  // Sync ref to avoid stale closure in callbacks
  useEffect(() => {
    stateHashRef.current = stateHash;
  }, [stateHash]);

  // Fetch operator state for OCC hash
  const refreshState = useCallback(async () => {
    const state = await getOperatorState();
    if (state?.state_hash) {
      setStateHash(state.state_hash);
    }
  }, [getOperatorState]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // SSE stream: update intent statuses in real-time
  const handleStreamUpdate = useCallback((event: IntentUpdateEvent) => {
    const { intent_id, status } = event;

    // Update any messages that reference this intent
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.intentId === intent_id) {
          return { ...msg, intentStatus: status };
        }
        return msg;
      }),
    );

    // Refresh state hash on any mutation (debounced via AbortController in refreshState)
    refreshState();
  }, [refreshState]);

  const { connected: streamConnected } = useIntentStream(handleStreamUpdate);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // Only auto-scroll if user is near the bottom (within 200px)
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [messages]);



  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMsg = { ...msg, id: crypto.randomUUID(), timestamp: new Date() };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg.id;
  }, []);

  const handleMultimodalSend = useCallback(
    async (text: string, attachments: any[]) => {
      // 1. Display Operator Message with attachments
      const displayContent = [
        text,
        ...attachments.map(a => `[Attached ${a.type}: ${a.file.name}]`)
      ].filter(Boolean).join('\n');
      
      addMessage({ role: 'operator', content: displayContent });

      // 2. Mock Analysis for attached files (SOTA: Multimodal Service)
      if (attachments.length > 0) {
        // Mocking the backend response for a screenshot analysis
        await new Promise(r => setTimeout(r, 1000));
        
        const isScan = attachments.some(a => a.file.name.includes('screenshot') || a.file.name.includes('log'));
        if (isScan) {
          addMessage({ 
            role: 'system', 
            content: "🔍 Analyzed attachment. Detected high latency on **Phase 2**." 
          });
          
          // Propose an intent based on "analysis"
          const intent = {
            id: crypto.randomUUID(),
            type: 'THROTTLE_PHASE',
            params: { phase: 'phase2', pct: 50 },
            description: 'Throttle Phase 2 to 50% due to latency spike detected in logs.',
            dangerLevel: 'moderate',
            version: 1,
            title: 'Throttle Phase 2'
          };
           
          // @ts-ignore
          addMessage({
            role: 'system',
            content: `Proposed Action: **Throttle Phase 2**`,
            // @ts-ignore
            intent,
          });
          return;
        }
      }

      // 3. Normal Text Intent Compilation
      if (!text) return;

      // Special Commands
      if (text.trim() === '/author') {
         setIsAuthorMode(true);
         return;
      }
      
      const result = compileNLToIntent(text, 'operator');

      if (result.matched && result.intent) {
        addMessage({
          role: 'system',
          content: `Compiled intent: **${result.intent.type}**`,
          intent: result.intent,
        });
      } else if (result.matched && result.error) {
        addMessage({
          role: 'system',
          content: result.error,
          error: result.error,
        });
      } else {
        addMessage({
          role: 'system',
          content: `Unknown command: "${text}". Try "arm", "disarm", "throttle scavenger 50%", "flatten all", or use ⌘K.`,
        });
      }
    },
    [addMessage],
  );

  const handleApprove = useCallback(
    async (intent: CompiledIntent) => {
      // Read from ref to avoid stale closure
      const currentHash = stateHashRef.current;

      const record = await submitIntent({
        type: intent.type,
        params: intent.params,
        reason: intent.description,
        operator_id: 'console-operator',
        state_hash: currentHash,
      });

      if (record) {
        // Track the backend intent ID so SSE updates can find this message
        setMessages((prev) =>
          prev.map((msg) =>
            msg.intent?.id === intent.id
              ? { ...msg, intentId: record.id, intentStatus: 'ACCEPTED' as IntentStatus }
              : msg,
          ),
        );
        addMessage({
          role: 'system',
          content: `✅ Intent ${intent.type} submitted — tracking via SSE.`,
          intentId: record.id,
          intentStatus: 'ACCEPTED' as IntentStatus,
        });
        toast.success(`${intent.type} submitted`);
      } else {
        addMessage({
          role: 'system',
          content: `⚠️ Failed to submit ${intent.type}. See logs.`,
          error: 'Submission failed',
        });
        toast.error(`Failed to submit ${intent.type}`);
      }
    },
    [submitIntent, addMessage],
  );

  const handleReject = useCallback(
    (intent: CompiledIntent) => {
      addMessage({
        role: 'system',
        content: `Cancelled ${intent.type}.`,
      });
    },
    [addMessage],
  );

  return (
    <div className="flex h-full flex-col relative" role="main" aria-label="Operator Chat">
      {isAuthorMode ? (
        <div className="absolute inset-0 z-50 bg-background">
          <PlaybookAuthorMode onExit={() => setIsAuthorMode(false)} />
        </div>
      ) : (
        <>
      {/* SSE connection indicator */}
      <div className="flex items-center justify-end px-4 py-1 border-b border-border/50" role="status" aria-live="polite">
        <div className="flex items-center gap-1.5 text-xxs">
          {streamConnected ? (
            <>
              <Wifi className="h-3 w-3 text-status-healthy" aria-hidden="true" />
              <span className="text-status-healthy">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-status-degraded" aria-hidden="true" />
              <span className="text-status-degraded">Reconnecting…</span>
            </>
          )}
        </div>
        <div className="mx-auto" /> {/* Spacer */}
        <button
          onClick={() => inspect({ type: 'memory', id: 'global-memory', title: 'Context Memory', data: {} })}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-muted/50 text-xxs text-muted-foreground hover:text-foreground transition-colors"
          title="Inspect Context Memory"
        >
          <Brain className="h-3 w-3" />
          <span>Memory</span>
        </button>
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 scrollbar-titan" role="log" aria-label="Chat messages">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                  msg.role === 'operator' ? 'bg-primary/10' : 'bg-muted',
                )}
                aria-hidden="true"
              >
                {msg.role === 'operator' ? (
                  <User className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {msg.role === 'operator' ? 'Operator' : 'Titan'}
                  </span>
                  <time className="text-xxs text-muted-foreground/60 font-mono" dateTime={msg.timestamp.toISOString()}>
                    {msg.timestamp.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </time>
                </div>

                {/* Text content */}
                {msg.error ? (
                  <div className="flex items-center gap-2 text-xs text-status-critical" role="alert">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{msg.content}</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/80">{msg.content}</p>
                )}

                {/* A2UI Spec — declarative component rendering */}
                {msg.uiSpec && (
                  <div className="mt-2">
                    <A2UIRenderer spec={msg.uiSpec} />
                  </div>
                )}

                {/* ActionCard for compiled intents (not yet decided) — legacy fallback */}
                {msg.intent && !msg.intentStatus && !msg.uiSpec && (
                  <ActionCard
                    intent={msg.intent}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    stateHash={stateHash}
                  />
                )}

                {/* IntentTimeline for intents with status (from SSE stream) */}
                {msg.intentStatus && (
                  <button
                    type="button"
                    className="mt-2 w-full text-left hover:bg-muted/30 rounded-md transition-colors cursor-pointer"
                    onClick={() => msg.intentId && inspect({
                      type: 'intent',
                      id: msg.intentId,
                      title: `${msg.intent?.type ?? 'Intent'} — ${msg.intentStatus}`,
                      data: {
                        status: msg.intentStatus,
                        type: msg.intent?.type,
                        params: msg.intent?.params,
                        intentId: msg.intentId,
                      },
                    })}
                    aria-label={`Inspect intent ${msg.intentId ?? ''}`}
                  >
                    <IntentTimeline
                      currentStatus={msg.intentStatus}
                      intentId={msg.intentId}
                    />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Multimodal Input */}
      <div className="border-t border-border bg-card p-3">
        <div className="mx-auto max-w-2xl">
           <MultimodalInput onSend={handleMultimodalSend} />
        </div>
      </div>
      </>
      )}
    </div>
  );
}
