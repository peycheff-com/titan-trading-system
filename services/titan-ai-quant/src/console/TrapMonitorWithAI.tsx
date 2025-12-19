/**
 * TrapMonitorWithAI Component
 * 
 * Enhanced TrapMonitor that integrates the AI Advisor panel and Chat Interface.
 * Adds keyboard binding 'A' to toggle the AI Advisor panel.
 * Adds keyboard binding 'Cmd+K' to open/close the Chat Interface.
 * Displays morning briefing on startup if available.
 * 
 * Requirements: 4.1, 4.2, 4.5, 5.1, 5.2, 5.3, 5.4, 6.4
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Insight, OptimizationProposal, Config, MorningBriefing } from '../types/index.js';
import { AIAdvisor } from './AIAdvisor.js';
import { ChatInterface } from './ChatInterface.js';
import { MorningBriefingDisplay } from './MorningBriefingDisplay.js';

/**
 * Tripwire data structure (from Phase 1)
 */
export interface Tripwire {
  symbol: string;
  triggerPrice: number;
  direction: 'LONG' | 'SHORT';
  trapType: 'LIQUIDATION' | 'DAILY_LEVEL' | 'BOLLINGER' | 'OI_WIPEOUT' | 'FUNDING_SQUEEZE' | 'BASIS_ARB' | 'ULTIMATE_BULGARIA';
  confidence: number;
  leverage: number;
  estimatedCascadeSize: number;
  activated: boolean;
  activatedAt?: number;
  currentPrice?: number;
  estimatedLeadTime?: number;
}

/**
 * Sensor status data
 */
export interface SensorStatus {
  binanceHealth: 'OK' | 'DEGRADED' | 'DOWN';
  binanceTickRate: number;
  bybitStatus: 'ARMED' | 'DEGRADED' | 'DOWN';
  bybitPing: number;
  slippage: number;
}

/**
 * Live feed event
 */
export interface LiveEvent {
  timestamp: number;
  type: 'TRAP_SPRUNG' | 'TRAP_SET' | 'EXECUTION_COMPLETE' | 'ERROR' | 'INFO';
  message: string;
}

/**
 * TrapMonitorWithAI props
 */
export interface TrapMonitorWithAIProps {
  /** Map of symbol to tripwires */
  trapMap: Map<string, Tripwire[]>;
  /** Sensor status data */
  sensorStatus: SensorStatus;
  /** Live feed events */
  liveFeed: LiveEvent[];
  /** Current equity */
  equity: number;
  /** Current P&L percentage */
  pnlPct: number;
  /** AI insights from strategic memory */
  insights: Insight[];
  /** Optimization proposals */
  proposals: OptimizationProposal[];
  /** Callback when user approves a proposal */
  onApproveProposal?: (proposalId: number) => void;
  /** Callback when user rejects a proposal */
  onRejectProposal?: (proposalId: number) => void;
  /** Callback when user quits */
  onQuit?: () => void;
  /** Callback when user toggles pause */
  onPause?: () => void;
  /** Callback when user opens config */
  onConfig?: () => void;
  /** Callback when /analyze command is executed in chat */
  onAnalyze?: () => Promise<string>;
  /** Callback when /optimize [symbol] command is executed in chat */
  onOptimize?: (symbol: string) => Promise<string>;
  /** Current config for chat status command */
  currentConfig?: Config;
  /** Current config version tag */
  configVersion?: string;
  /** Morning briefing to display on startup (Requirement 6.4) */
  morningBriefing?: MorningBriefing | null;
  /** Callback to load morning briefing (for lazy loading) */
  loadMorningBriefing?: () => MorningBriefing | null;
}

/**
 * Format trap type for display
 */
function formatTrapType(trapType: string): string {
  switch (trapType) {
    case 'LIQUIDATION': return 'LIQ_HUNT';
    case 'DAILY_LEVEL': return 'BREAKOUT';
    case 'BOLLINGER': return 'BREAKOUT';
    case 'OI_WIPEOUT': return 'OI_WIPEOUT';
    case 'FUNDING_SQUEEZE': return 'FUNDING_SQZ';
    case 'BASIS_ARB': return 'BASIS_ARB';
    case 'ULTIMATE_BULGARIA': return 'ULTIMATE';
    default: return trapType;
  }
}

/**
 * TrapTable Component
 */
function TrapTable({ trapMap }: { trapMap: Map<string, Tripwire[]> }): React.ReactElement {
  const allTraps: Array<{ symbol: string; trap: Tripwire }> = [];
  
  trapMap.forEach((trapList, symbol) => {
    trapList.forEach(trap => {
      allTraps.push({ symbol, trap });
    });
  });
  
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="white">
          {'COIN'.padEnd(12)}
          {'CURR PRICE'.padEnd(14)}
          {'TRIGGER'.padEnd(14)}
          {'TYPE'.padEnd(18)}
          {'LEAD TIME'.padEnd(12)}
        </Text>
      </Box>
      
      {allTraps.length > 0 ? (
        allTraps.slice(0, 10).map(({ symbol, trap }, idx) => {
          const currentPrice = trap.currentPrice || trap.triggerPrice;
          const proximity = ((trap.triggerPrice - currentPrice) / currentPrice) * 100;
          const absProximity = Math.abs(proximity);
          
          let proximityColor: 'red' | 'yellow' | 'white' = 'white';
          if (absProximity < 0.5) proximityColor = 'red';
          else if (absProximity < 2.0) proximityColor = 'yellow';
          
          const trapTypeDisplay = formatTrapType(trap.trapType);
          const leadTimeDisplay = trap.estimatedLeadTime ? `~${trap.estimatedLeadTime}ms` : 'N/A';
          
          return (
            <Box key={`${symbol}-${idx}`}>
              <Text color={proximityColor}>
                {symbol.padEnd(12)}
                {currentPrice.toFixed(2).padEnd(14)}
                {trap.triggerPrice.toFixed(2).padEnd(14)}
                {trapTypeDisplay.padEnd(18)}
                {leadTimeDisplay.padEnd(12)}
              </Text>
            </Box>
          );
        })
      ) : (
        <Box marginTop={1}>
          <Text dimColor>No traps set. Calculating...</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * SensorStatusDisplay Component
 */
function SensorStatusDisplay({ data }: { data: SensorStatus }): React.ReactElement {
  const binanceColor = data.binanceHealth === 'OK' ? 'green' : data.binanceHealth === 'DEGRADED' ? 'yellow' : 'red';
  const bybitColor = data.bybitStatus === 'ARMED' ? 'green' : data.bybitStatus === 'DEGRADED' ? 'yellow' : 'red';
  const slippageColor = data.slippage < 0.1 ? 'green' : data.slippage < 0.3 ? 'yellow' : 'red';
  
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text>Binance: </Text>
        <Text bold color={binanceColor}>{data.binanceHealth}</Text>
        <Text dimColor> ({data.binanceTickRate.toLocaleString()} t/s)</Text>
      </Box>
      <Box>
        <Text>Bybit: </Text>
        <Text bold color={bybitColor}>{data.bybitStatus}</Text>
        <Text dimColor> ({data.bybitPing}ms)</Text>
      </Box>
      <Box>
        <Text>Slippage: </Text>
        <Text color={slippageColor}>{data.slippage.toFixed(2)}%</Text>
      </Box>
    </Box>
  );
}

/**
 * LiveFeed Component
 */
function LiveFeed({ events }: { events: LiveEvent[] }): React.ReactElement {
  const recentEvents = events.slice(-5);
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {recentEvents.length > 0 ? (
        recentEvents.map((event, idx) => {
          let eventColor: 'green' | 'red' | 'yellow' | 'white' = 'white';
          switch (event.type) {
            case 'TRAP_SPRUNG': eventColor = 'green'; break;
            case 'ERROR': eventColor = 'red'; break;
            case 'TRAP_SET': eventColor = 'yellow'; break;
          }
          
          const timestamp = new Date(event.timestamp).toLocaleTimeString();
          
          return (
            <Box key={idx}>
              <Text dimColor>[{timestamp}] </Text>
              <Text color={eventColor}>{event.message}</Text>
            </Box>
          );
        })
      ) : (
        <Box><Text dimColor>No events yet...</Text></Box>
      )}
    </Box>
  );
}

/**
 * TrapMonitorWithAI Component
 * 
 * Main dashboard with integrated AI Advisor panel and Chat Interface.
 * 
 * Keyboard bindings:
 * - A: Toggle AI Advisor panel
 * - Cmd+K: Open/close Chat Interface
 * - ENTER: Approve current proposal (when AI panel visible)
 * - ESC: Reject current proposal (when AI panel visible) / Close chat
 * - F1: Open config
 * - SPACE: Pause
 * - Q: Quit
 */
export function TrapMonitorWithAI({
  trapMap,
  sensorStatus,
  liveFeed,
  equity,
  pnlPct,
  insights,
  proposals,
  onApproveProposal,
  onRejectProposal,
  onQuit,
  onPause,
  onConfig,
  onAnalyze,
  onOptimize,
  currentConfig,
  configVersion,
  morningBriefing: initialBriefing,
  loadMorningBriefing
}: TrapMonitorWithAIProps): React.ReactElement {
  const [showAIAdvisor, setShowAIAdvisor] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [briefing, setBriefing] = useState<MorningBriefing | null>(initialBriefing ?? null);
  
  // Load morning briefing on startup (Requirement 6.4)
  useEffect(() => {
    if (initialBriefing) {
      setBriefing(initialBriefing);
      setShowBriefing(true);
    } else if (loadMorningBriefing) {
      const loaded = loadMorningBriefing();
      if (loaded) {
        setBriefing(loaded);
        setShowBriefing(true);
      }
    }
  }, []);
  
  // Get pending proposals
  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const currentProposal = pendingProposals[0];
  
  // Handle keyboard input
  useInput((input: string, key: { return: boolean; escape: boolean; f1?: boolean; meta?: boolean }) => {
    // Cmd+K to toggle Chat Interface (Requirement 5.1)
    if (key.meta && input.toLowerCase() === 'k') {
      setShowChat((prev: boolean) => !prev);
      return;
    }
    
    // If chat is open, let it handle its own input
    if (showChat) {
      return;
    }
    
    // Dismiss morning briefing with 'D' key (Requirement 6.4)
    if (input.toLowerCase() === 'd' && showBriefing) {
      setShowBriefing(false);
      return;
    }
    
    // Toggle AI Advisor with 'A' key
    if (input.toLowerCase() === 'a') {
      setShowAIAdvisor((prev: boolean) => !prev);
      return;
    }
    
    // Handle proposal approval/rejection when AI panel is visible
    if (showAIAdvisor && currentProposal?.id !== undefined) {
      if (key.return) {
        onApproveProposal?.(currentProposal.id);
        return;
      }
      if (key.escape) {
        onRejectProposal?.(currentProposal.id);
        return;
      }
    }
    
    // Other keyboard shortcuts
    if (input.toLowerCase() === 'q') {
      onQuit?.();
      return;
    }
    if (input === ' ') {
      onPause?.();
      return;
    }
    if (key.f1) {
      onConfig?.();
      return;
    }
  });
  
  return (
    <Box flexDirection="column">
      {/* Chat Interface Modal (Requirement 5.1) */}
      {showChat && (
        <ChatInterface
          visible={showChat}
          onClose={() => setShowChat(false)}
          onAnalyze={onAnalyze}
          onOptimize={onOptimize}
          insights={insights}
          proposals={proposals}
          currentConfig={currentConfig}
          configVersion={configVersion}
        />
      )}
      
      {/* Main Dashboard (hidden when chat is open) */}
      {!showChat && (
        <>
          {/* Morning Briefing Display (Requirement 6.4) */}
          {briefing && (
            <MorningBriefingDisplay
              briefing={briefing}
              visible={showBriefing}
              onDismiss={() => setShowBriefing(false)}
            />
          )}
          
          {/* Header */}
          <Box borderStyle="double" borderColor="cyan" padding={1}>
            <Text bold color="cyan">
              🕸️  TITAN PREDESTINATION | 💰 ${equity.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
            </Text>
            {pendingProposals.length > 0 && (
              <Text color="yellow"> | 🤖 {pendingProposals.length} pending</Text>
            )}
          </Box>
          
          {/* Keyboard Shortcuts Bar */}
          <Box marginTop={1}>
            <Text dimColor>
              [F1] CONFIG  [SPACE] PAUSE  [Q] QUIT  
              <Text color={showAIAdvisor ? 'cyan' : undefined}>[A] AI ADVISOR</Text>
              {'  '}
              <Text color="magenta">[Cmd+K] CHAT</Text>
              {showBriefing && (
                <>{'  '}<Text color="yellow">[D] DISMISS BRIEFING</Text></>
              )}
            </Text>
          </Box>
          
          {/* Main Content Area */}
          <Box marginTop={1} flexDirection="row">
            {/* Left Panel - Trap Monitor */}
            <Box flexDirection="column" flexGrow={1} marginRight={showAIAdvisor ? 1 : 0}>
              {/* Active Tripwires Table */}
              <Box borderStyle="single" borderColor="green" padding={1} flexDirection="column">
                <Text bold color="green">🎯 ACTIVE TRIPWIRES</Text>
                <TrapTable trapMap={trapMap} />
              </Box>
              
              {/* Sensor Status */}
              <Box marginTop={1} borderStyle="single" borderColor="yellow" padding={1} flexDirection="column">
                <Text bold color="yellow">📡 SENSORS</Text>
                <SensorStatusDisplay data={sensorStatus} />
              </Box>
              
              {/* Live Feed */}
              <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1} flexDirection="column">
                <Text bold color="gray">📝 LIVE FEED</Text>
                <LiveFeed events={liveFeed} />
              </Box>
            </Box>
            
            {/* Right Panel - AI Advisor (when visible) */}
            {showAIAdvisor && (
              <Box width={50}>
                <AIAdvisor
                  visible={showAIAdvisor}
                  insights={insights}
                  pendingProposals={proposals}
                  onApprove={onApproveProposal}
                  onReject={onRejectProposal}
                />
              </Box>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

export default TrapMonitorWithAI;
