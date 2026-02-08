/**
 * ChatTranscript
 *
 * Operator chat center pane. Replaces CopilotKit sidebar.
 *
 * Features:
 * - Message history with operator/system messages
 * - NL input → intentCompiler → ActionCard confirmation flow
 * - Inline ActionCards for pending intents
 * - Auto-scroll on new messages
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { compileNLToIntent, type CompiledIntent } from '@/lib/intentCompiler';
import { useOperatorIntents } from '@/hooks/useOperatorIntents';
import { ActionCard } from './ActionCard';
import { IntentTimeline } from './IntentTimeline';
import { Send, Bot, User, AlertCircle } from 'lucide-react';
import type { IntentStatus } from '@/hooks/useOperatorIntents';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'operator' | 'system';
  content: string;
  timestamp: Date;
  intent?: CompiledIntent;
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
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { submitIntent } = useOperatorIntents();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
    ]);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput('');

      // Add operator message
      addMessage({ role: 'operator', content: text });

      // Try to compile as intent
      const result = compileNLToIntent(text, 'operator');

      if (result.matched && result.intent) {
        // Add system message with ActionCard
        addMessage({
          role: 'system',
          content: `Compiled intent: **${result.intent.type}**`,
          intent: result.intent,
        });
      } else if (result.matched && result.error) {
        // RBAC rejection
        addMessage({
          role: 'system',
          content: result.error,
          error: result.error,
        });
      } else {
        // Unrecognized command
        addMessage({
          role: 'system',
          content: `Unknown command: "${text}". Try "arm", "disarm", "throttle scavenger 50%", "flatten all", or use ⌘K.`,
        });
      }
    },
    [input, addMessage],
  );

  const handleApprove = useCallback(
    async (intent: CompiledIntent) => {
      const record = await submitIntent({
        type: intent.type,
        params: intent.params,
        reason: intent.description,
        operator_id: 'console-operator',
      });

      if (record) {
        addMessage({
          role: 'system',
          content: `✅ Intent ${intent.type} submitted successfully.`,
          intentStatus: 'ACCEPTED',
        });
        toast.success(`${intent.type} submitted`);
      } else {
        addMessage({
          role: 'system',
          content: `⚠️ Failed to submit ${intent.type}. See logs.`,
          intentStatus: 'FAILED',
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
        intentStatus: 'REJECTED',
      });
    },
    [addMessage],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 scrollbar-titan">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                  msg.role === 'operator' ? 'bg-primary/10' : 'bg-muted',
                )}
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
                  <span className="text-xxs text-muted-foreground/60 font-mono">
                    {msg.timestamp.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </span>
                </div>

                {/* Text content */}
                {msg.error ? (
                  <div className="flex items-center gap-2 text-xs text-status-critical">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{msg.content}</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/80">{msg.content}</p>
                )}

                {/* ActionCard for compiled intents */}
                {msg.intent && !msg.intentStatus && (
                  <ActionCard
                    intent={msg.intent}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                )}

                {/* IntentTimeline for resolved intents */}
                {msg.intentStatus && (
                  <IntentTimeline
                    currentStatus={msg.intentStatus}
                    className="mt-2"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-card p-3">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command… (arm, disarm, throttle scavenger 50%, flatten all)"
            className={cn(
              'flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground',
              'placeholder:text-muted-foreground/50',
              'focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30',
            )}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              'bg-primary/10 text-primary hover:bg-primary/20',
              'disabled:cursor-not-allowed disabled:opacity-30',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
