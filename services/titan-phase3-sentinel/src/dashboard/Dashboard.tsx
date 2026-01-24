import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { NavPanel } from './components/NavPanel.js';
import { BasisMonitor } from './components/BasisMonitor.js';
import { YieldPanel } from './components/YieldPanel.js';
import { InventoryPanel } from './components/InventoryPanel.js';
import type { HealthReport, PerformanceMetrics } from '../types/portfolio.js';
import type { Signal } from '../types/signals.js';
import { SentinelCore, SentinelState } from '../engine/SentinelCore.js';

interface DashboardProps {
  core: SentinelCore;
}

const INITIAL_HEALTH: HealthReport = {
  nav: 0,
  delta: 0,
  marginUtilization: 0,
  riskStatus: 'HEALTHY',
  positions: [],
  alerts: [],
};

const INITIAL_METRICS: PerformanceMetrics = {
  totalDeployed: 0,
  avgFundingAPY: 0,
  basisScalpingPnL24h: 0,
  totalYield24h: 0,
  sharpeRatio: 0,
  maxDrawdown: 0,
  winRate: 0,
  totalTrades: 0,
};

export const Dashboard: React.FC<DashboardProps> = ({ core }) => {
  const [health, setHealth] = useState<HealthReport>(INITIAL_HEALTH);
  const [metrics, setMetrics] = useState<PerformanceMetrics>(INITIAL_METRICS);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [prices, setPrices] = useState<{ spot: number; perp: number; basis: number }>({
    spot: 0,
    perp: 0,
    basis: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'monitor' | 'inventory' | 'logs'>('monitor');

  useInput((input, key) => {
    if (input === 'q') {
      core.emit('log', 'Shutting down UI...');
      // We don't exit process here, let the main loop handle it cleanup if needed
      // But usually React Ink exit closes the app
      process.exit(0);
    }
    if (key.tab) {
      setActiveTab((prev) => {
        if (prev === 'monitor') return 'inventory';
        if (prev === 'inventory') return 'logs';
        return 'monitor';
      });
    }
  });

  useEffect(() => {
    const onTick = (state: SentinelState) => {
      setHealth(state.health);
      setMetrics(state.metrics);
      setSignals(state.signals);
      setPrices(state.prices);
    };

    const onLog = (msg: string) => {
      setLogs((prev) => [msg, ...prev].slice(0, 10)); // Keep last 10 logs
    };

    const onError = (err: unknown) => {
      setLogs((prev) => [`ERROR: ${err}`, ...prev].slice(0, 10));
    };

    core.on('tick', onTick);
    core.on('log', onLog);
    core.on('error', onError);

    return () => {
      core.off('tick', onTick);
      core.off('log', onLog);
      core.off('error', onError);
    };
  }, [core]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          TITAN SENTINEL v3.0
        </Text>
        <Text> | </Text>
        <Text>Spot: {prices.spot.toFixed(2)}</Text>
        <Text> | </Text>
        <Text>Perp: {prices.perp.toFixed(2)}</Text>
        <Text> | </Text>
        <Text>Basis: {(prices.basis * 100).toFixed(4)}%</Text>
      </Box>

      {/* Top Row: Key Metrics */}
      <Box flexDirection="row" gap={1} marginTop={1}>
        <NavPanel health={health} />
        <YieldPanel metrics={metrics} />
      </Box>

      {/* Middle Row: Toggleable Main View */}
      <Box flexDirection="column" marginTop={1}>
        <Box marginBottom={1}>
          <Text color="grey" dimColor>
            TAB: {activeTab.toUpperCase()} | 'q' to quit
          </Text>
        </Box>

        {activeTab === 'monitor' && <BasisMonitor signals={signals} />}

        {activeTab === 'inventory' && <InventoryPanel health={health} />}

        {activeTab === 'logs' && (
          <Box flexDirection="column" borderStyle="single">
            {logs.map((log, i) => (
              <Text key={i} color={log.includes('ERROR') ? 'red' : 'white'}>
                {log}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
