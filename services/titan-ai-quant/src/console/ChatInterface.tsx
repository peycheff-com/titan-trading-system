/**
 * ChatInterface Component
 *
 * Modal chat interface for interactive AI queries via Cmd+K.
 * Supports commands: /analyze, /optimize [symbol], /insights, /status
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Insight, OptimizationProposal, Config } from '../types/index.js';
import {
  TitanError,
  ErrorCode,
  getUserFriendlyMessage,
  classifyError,
} from '../utils/ErrorHandler.js';

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/**
 * Command types supported by the chat interface
 */
export type ChatCommand =
  | { type: 'analyze' }
  | { type: 'optimize'; symbol: string }
  | { type: 'insights' }
  | { type: 'status' }
  | { type: 'help' }
  | { type: 'unknown'; raw: string };

/**
 * Chat interface props
 */
export interface ChatInterfaceProps {
  /** Whether the chat modal is visible */
  visible: boolean;
  /** Callback to close the chat */
  onClose: () => void;
  /** Callback when /analyze command is executed */
  onAnalyze?: () => Promise<string>;
  /** Callback when /optimize [symbol] command is executed */
  onOptimize?: (symbol: string) => Promise<string>;
  /** Recent insights for /insights command */
  insights?: Insight[];
  /** Pending proposals for /status command */
  proposals?: OptimizationProposal[];
  /** Current config for /status command */
  currentConfig?: Config;
  /** Current config version tag */
  configVersion?: string;
  /** Whether AI is currently processing */
  isProcessing?: boolean;
}

/**
 * Parse a command string into a ChatCommand object
 *
 * Requirement 5.3: Parse /optimize [symbol] command and extract symbol
 */
export function parseCommand(input: string): ChatCommand {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return { type: 'unknown', raw: trimmed };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();

  switch (command) {
    case 'analyze':
      return { type: 'analyze' };

    case 'optimize': {
      const symbol = parts[1]?.toUpperCase();
      if (!symbol) {
        return { type: 'unknown', raw: trimmed };
      }
      return { type: 'optimize', symbol };
    }

    case 'insights':
      return { type: 'insights' };

    case 'status':
      return { type: 'status' };

    case 'help':
    case '?':
      return { type: 'help' };

    default:
      return { type: 'unknown', raw: trimmed };
  }
}

/**
 * Extract symbol from /optimize command
 *
 * Property 12: Command Symbol Extraction
 * Validates: Requirements 5.3
 */
export function extractSymbolFromOptimizeCommand(command: string): string | null {
  const parsed = parseCommand(command);
  if (parsed.type === 'optimize') {
    return parsed.symbol;
  }
  return null;
}

/**
 * Format insights for display
 */
function formatInsights(insights: Insight[]): string {
  if (insights.length === 0) {
    return 'No insights available. Run /analyze to generate insights.';
  }

  return insights
    .slice(0, 5)
    .map((insight, idx) => {
      const confidence = (insight.confidence * 100).toFixed(0);
      const symbols = insight.affectedSymbols?.join(', ') || 'N/A';
      return `${idx + 1}. [${confidence}%] ${insight.topic}\n   ${insight.text}\n   Symbols: ${symbols}`;
    })
    .join('\n\n');
}

/**
 * Format status for display
 */
function formatStatus(proposals: OptimizationProposal[], configVersion?: string): string {
  const pending = proposals.filter((p) => p.status === 'pending').length;
  const applied = proposals.filter((p) => p.status === 'applied').length;
  const rejected = proposals.filter((p) => p.status === 'rejected').length;

  return `📊 System Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Config Version: ${configVersion || 'Unknown'}
Pending Proposals: ${pending}
Applied Proposals: ${applied}
Rejected Proposals: ${rejected}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/**
 * Get help text
 */
function getHelpText(): string {
  return `📖 Available Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/analyze        - Analyze last 24h of trades
/optimize SOL   - Generate optimization for symbol
/insights       - Show recent insights
/status         - Show system status
/help           - Show this help message
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Press Cmd+K or ESC to close chat`;
}

/**
 * MessageList Component
 * Displays chat message history
 */
function MessageList({ messages }: { messages: ChatMessage[] }): React.ReactElement {
  const recentMessages = messages.slice(-10);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {recentMessages.map((msg, idx) => {
        // eslint-disable-next-line functional/no-let
        let prefix = '';
        // eslint-disable-next-line functional/no-let
        let color: 'cyan' | 'green' | 'yellow' | 'white' = 'white';

        switch (msg.role) {
          case 'user':
            prefix = '> ';
            color = 'cyan';
            break;
          case 'assistant':
            prefix = '🤖 ';
            color = 'green';
            break;
          case 'system':
            prefix = '⚙️ ';
            color = 'yellow';
            break;
        }

        return (
          <Box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
            <Text color={color} wrap="wrap">
              {prefix}
              {msg.content}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * ChatInterface Component
 *
 * Requirement 5.1: Display modal accepting text commands
 * Requirement 5.2: Run analysis on /analyze command
 * Requirement 5.3: Run optimization on /optimize [symbol] command
 * Requirement 5.4: Display streaming text from Gemini API
 */
export function ChatInterface({
  visible,
  onClose,
  onAnalyze,
  onOptimize,
  insights = [],
  proposals = [],
  configVersion,
  isProcessing = false,
}: ChatInterfaceProps): React.ReactElement | null {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: 'AI Chat ready. Type /help for available commands.',
      timestamp: Date.now(),
    },
  ]);
  const [processing, setProcessing] = useState(false);

  // Add a message to the chat
  const addMessage = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages((prev) => [...prev, { role, content, timestamp: Date.now() }]);
  }, []);

  // Handle command execution
  const handleCommand = useCallback(
    async (commandStr: string) => {
      if (!commandStr.trim()) return;

      // Add user message
      addMessage('user', commandStr);
      setInput('');

      const command = parseCommand(commandStr);

      try {
        switch (command.type) {
          case 'analyze': {
            if (!onAnalyze) {
              addMessage('system', 'Analysis not available. TitanAnalyst not configured.');
              return;
            }
            setProcessing(true);
            addMessage('system', 'Analyzing last 24 hours of trades...');
            const result = await onAnalyze();
            addMessage('assistant', result);
            break;
          }

          case 'optimize': {
            if (!onOptimize) {
              addMessage('system', 'Optimization not available. TitanAnalyst not configured.');
              return;
            }
            // Validate symbol format (basic validation)
            const validSymbolPattern = /^[A-Z]{2,10}$/;
            if (!validSymbolPattern.test(command.symbol)) {
              addMessage(
                'system',
                getUserFriendlyMessage(ErrorCode.INVALID_SYMBOL, command.symbol),
              );
              return;
            }
            setProcessing(true);
            addMessage('system', `Generating optimization for ${command.symbol}...`);
            const result = await onOptimize(command.symbol);
            addMessage('assistant', result);
            break;
          }

          case 'insights': {
            const formatted = formatInsights(insights);
            addMessage('assistant', formatted);
            break;
          }

          case 'status': {
            const formatted = formatStatus(proposals, configVersion);
            addMessage('assistant', formatted);
            break;
          }

          case 'help': {
            addMessage('assistant', getHelpText());
            break;
          }

          case 'unknown': {
            if (command.raw.startsWith('/')) {
              addMessage('system', getUserFriendlyMessage(ErrorCode.UNKNOWN_COMMAND, command.raw));
            } else {
              // Treat as free-form query (future enhancement)
              addMessage('system', getUserFriendlyMessage(ErrorCode.MALFORMED_INPUT));
            }
            break;
          }
        }
      } catch (error) {
        // Classify and display user-friendly error message
        const titanError = error instanceof TitanError ? error : classifyError(error);
        const userMessage = getUserFriendlyMessage(titanError.code, titanError.message);
        addMessage('system', `⚠️ ${userMessage}`);

        // Add retry suggestion for retryable errors
        if (titanError.isRetryable) {
          addMessage('system', '💡 This error may be temporary. Please try again in a moment.');
        }
      } finally {
        setProcessing(false);
      }
    },
    [onAnalyze, onOptimize, insights, proposals, configVersion, addMessage],
  );

  // Handle keyboard input
  useInput(
    (inputChar: string, key: { escape: boolean; meta?: boolean }) => {
      // Close on ESC or Cmd+K
      if (key.escape || (key.meta && inputChar.toLowerCase() === 'k')) {
        onClose();
        return;
      }
    },
    { isActive: visible },
  );

  // Don't render if not visible
  if (!visible) {
    return null;
  }

  const isCurrentlyProcessing = processing || isProcessing;

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width="100%">
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color="magenta">
          🤖 AI Chat
        </Text>
        <Text dimColor>[Cmd+K] or [ESC] to close</Text>
      </Box>

      {/* Message History */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        padding={1}
        height={15}
        overflowY="hidden"
      >
        <MessageList messages={messages} />

        {/* Processing indicator */}
        {isCurrentlyProcessing && (
          <Box marginTop={1}>
            <Text color="yellow">⏳ Processing...</Text>
          </Box>
        )}
      </Box>

      {/* Input Area */}
      <Box marginTop={1} borderStyle="single" borderColor="cyan" padding={1}>
        <Text color="cyan">&gt; </Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleCommand}
          placeholder="Type /analyze, /optimize [symbol], /insights, /status, or /help"
        />
      </Box>

      {/* Quick Commands */}
      <Box marginTop={1}>
        <Text dimColor>Quick: /analyze | /optimize SOL | /insights | /status | /help</Text>
      </Box>
    </Box>
  );
}

export default ChatInterface;
