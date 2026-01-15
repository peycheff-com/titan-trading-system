/**
 * TrapMonitor Console Dashboard
 * 
 * Ink + React terminal UI for the Titan Phase 1 Scavenger (Predestination Engine).
 * 
 * Displays:
 * - Header with phase, equity, and P&L
 * - Keyboard shortcuts bar
 * - Active tripwires table (top 20)
 * - Sensor status (Binance/Bybit health)
 * - Live feed (last 5 events)
 * 
 * Requirements: 8.1-8.7 (Trap Monitor Dashboard)
 */

import React from 'react';
import { Box, Text } from 'ink';

import { Tripwire, SensorStatus, LiveEvent } from '../types/index.js';

/**
 * TrapMonitor props
 */
export interface TrapMonitorProps {
  trapMap: Map<string, Tripwire[]>;
  sensorStatus: SensorStatus;
  liveFeed: LiveEvent[];
  equity: number;
  pnlPct: number;
}

/**
 * Main TrapMonitor Dashboard Component
 * 
 * Requirement 8.1: Display header with phase identifier, current equity, and profit percentage
 */
export function TrapMonitor({ trapMap, sensorStatus, liveFeed, equity, pnlPct }: TrapMonitorProps) {
  return (
    <Box flexDirection="column">
      {/* Header - Requirement 8.1 */}
      <Box borderStyle="double" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          🕸️  TITAN PREDESTINATION | 💰 ${equity.toFixed(2)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
        </Text>
      </Box>
      
      {/* Keyboard Shortcuts Bar */}
      <Box marginTop={1}>
        <Text dimColor>[F1] CONFIG  [SPACE] PAUSE  [Q] QUIT</Text>
      </Box>
      
      {/* Active Tripwires Table - Requirements 8.2-8.5 */}
      <Box marginTop={1} borderStyle="single" borderColor="green" padding={1}>
        <Text bold color="green">🎯 ACTIVE TRIPWIRES (Waiting for victims...)</Text>
        <TrapTable trapMap={trapMap} />
      </Box>
      
      {/* Sensor Status - Requirement 8.6 */}
      <Box marginTop={1} borderStyle="single" borderColor="yellow" padding={1}>
        <Text bold color="yellow">📡 SENSOR STATUS</Text>
        <SensorStatusDisplay data={sensorStatus} />
      </Box>
      
      {/* Live Feed - Requirement 8.7 */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text bold color="gray">📝 LIVE FEED</Text>
        <LiveFeed events={liveFeed} />
      </Box>
    </Box>
  );
}

/**
 * TrapTable Component
 * 
 * Requirement 8.2: Display columns for symbol, current price, trigger price, trap type, and lead time
 * Requirement 8.3: Show visual indicator for trap type (BREAKOUT, LIQ_HUNT, BREAKDOWN, etc.)
 * Requirement 8.4: Show distance percentage between current price and trigger price
 * Requirement 8.5: Color code by proximity (red < 0.5%, yellow < 2%)
 */
function TrapTable({ trapMap }: { trapMap: Map<string, Tripwire[]> }) {
  // Flatten all traps from the map
  const allTraps: Array<{ symbol: string; trap: Tripwire }> = [];
  
  trapMap.forEach((trapList, symbol) => {
    trapList.forEach(trap => {
      allTraps.push({ symbol, trap });
    });
  });
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Header Row */}
      <Box>
        <Text bold color="white">
          {'COIN'.padEnd(12)}
          {'CURR PRICE'.padEnd(14)}
          {'TRIGGER'.padEnd(14)}
          {'TYPE'.padEnd(18)}
          {'LEAD TIME'.padEnd(12)}
        </Text>
      </Box>
      
      {/* Data Rows */}
      {allTraps.length > 0 ? (
        allTraps.map(({ symbol, trap }, idx) => {
          const currentPrice = trap.currentPrice || trap.triggerPrice;
          const proximity = ((trap.triggerPrice - currentPrice) / currentPrice) * 100;
          const absProximity = Math.abs(proximity);
          
          // Color code by proximity - Requirement 8.5
          let proximityColor: 'red' | 'yellow' | 'white' = 'white';
          if (absProximity < 0.5) {
            proximityColor = 'red';  // Very close!
          } else if (absProximity < 2.0) {
            proximityColor = 'yellow';  // Getting close
          }
          
          // Format trap type display - Requirement 8.3
          const trapTypeDisplay = formatTrapType(trap.trapType);
          
          // Format lead time - Requirement 8.2
          const leadTimeDisplay = trap.estimatedLeadTime 
            ? `~${trap.estimatedLeadTime}ms`
            : 'N/A';
          
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
 * Format trap type for display
 * Requirement 8.3: Show visual indicator for trap types
 */
function formatTrapType(trapType: string): string {
  switch (trapType) {
    case 'LIQUIDATION':
      return 'LIQ_HUNT';
    case 'DAILY_LEVEL':
      return 'BREAKOUT';
    case 'BOLLINGER':
      return 'BREAKOUT';
    case 'OI_WIPEOUT':
      return 'OI_WIPEOUT';
    case 'FUNDING_SQUEEZE':
      return 'FUNDING_SQZ';
    case 'BASIS_ARB':
      return 'BASIS_ARB';
    case 'ULTIMATE_BULGARIA':
      return 'ULTIMATE';
    case 'PREDICTION_SPIKE':
      return 'PRED_SPIKE';
    default:
      return trapType;
  }
}

/**
 * SensorStatusDisplay Component
 * 
 * Requirement 8.6: Show Binance stream health, Bybit connection status, and estimated slippage percentage
 */
function SensorStatusDisplay({ data }: { data: SensorStatus }) {
  // Determine health color
  const binanceColor = data.binanceHealth === 'OK' ? 'green' : data.binanceHealth === 'DEGRADED' ? 'yellow' : 'red';
  const bybitColor = data.bybitStatus === 'ARMED' ? 'green' : data.bybitStatus === 'DEGRADED' ? 'yellow' : 'red';
  const slippageColor = data.slippage < 0.1 ? 'green' : data.slippage < 0.3 ? 'yellow' : 'red';
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {/* Binance Stream Health */}
      <Box>
        <Text>Binance Stream: </Text>
        <Text bold color={binanceColor}>
          {data.binanceHealth}
        </Text>
        <Text> ({data.binanceTickRate.toLocaleString()} ticks/sec)</Text>
      </Box>
      
      {/* Bybit Connection Status */}
      <Box marginTop={1}>
        <Text>Bybit Connection: </Text>
        <Text bold color={bybitColor}>
          {data.bybitStatus}
        </Text>
        <Text> (Ping: {data.bybitPing}ms)</Text>
      </Box>
      
      {/* Estimated Slippage */}
      <Box marginTop={1}>
        <Text>Estimated Slippage: </Text>
        <Text color={slippageColor}>
          {data.slippage.toFixed(2)}%
        </Text>
      </Box>
    </Box>
  );
}

/**
 * LiveFeed Component
 * 
 * Requirement 8.7: Show last 5 events with timestamp, symbol, event type, and execution result
 * 
 * Auto-scroll behavior: Ink automatically re-renders when the events array changes,
 * and by using slice(-5), we always show the most recent 5 events, effectively
 * providing auto-scroll functionality as new events are added.
 */
function LiveFeed({ events }: { events: LiveEvent[] }) {
  // Get last 5 events - this provides auto-scroll as new events are added
  const recentEvents = events.slice(-5);
  
  return (
    <Box flexDirection="column" marginTop={1}>
      {recentEvents.length > 0 ? (
        recentEvents.map((event, idx) => {
          // Color code by event type
          let eventColor: 'green' | 'red' | 'yellow' | 'white' = 'white';
          switch (event.type) {
            case 'TRAP_SPRUNG':
              eventColor = 'green';
              break;
            case 'ERROR':
              eventColor = 'red';
              break;
            case 'TRAP_SET':
              eventColor = 'yellow';
              break;
            default:
              eventColor = 'white';
          }
          
          // Format timestamp
          const timestamp = new Date(event.timestamp).toLocaleTimeString();
          
          return (
            <Box key={idx}>
              <Text dimColor>[{timestamp}] </Text>
              <Text color={eventColor}>
                {event.message}
              </Text>
            </Box>
          );
        })
      ) : (
        <Box>
          <Text dimColor>No events yet...</Text>
        </Box>
      )}
    </Box>
  );
}

export default TrapMonitor;
