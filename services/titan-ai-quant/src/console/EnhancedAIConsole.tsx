/**
 * Enhanced AI Integration Console
 * 
 * Interactive console for monitoring and controlling the enhanced AI integration
 * including real-time optimization, predictive analytics, and adaptive risk management.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, Newline, Spacer } from 'ink';
import { EnhancedAIIntegration, AIIntegrationStatus, StrategySelection, AdaptiveRiskConfig } from '../ai/EnhancedAIIntegration';
import { MarketRegime } from '../ai/PredictiveAnalytics';

interface EnhancedAIConsoleProps {
  aiIntegration: EnhancedAIIntegration;
}

interface ConsoleState {
  status: AIIntegrationStatus | null;
  strategySelections: Map<string, StrategySelection>;
  riskConfig: AdaptiveRiskConfig | null;
  performanceHistory: Array<{ timestamp: number; score: number }>;
  isRunning: boolean;
  lastUpdate: number;
}

/**
 * Enhanced AI Integration Console Component
 */
export const EnhancedAIConsole: React.FC<EnhancedAIConsoleProps> = ({ aiIntegration }) => {
  const [state, setState] = useState<ConsoleState>({
    status: null,
    strategySelections: new Map(),
    riskConfig: null,
    performanceHistory: [],
    isRunning: false,
    lastUpdate: 0
  });

  useEffect(() => {
    // Update state periodically
    const updateInterval = setInterval(() => {
      const status = aiIntegration.getStatus();
      const strategySelections = aiIntegration.getCurrentStrategySelections();
      const riskConfig = aiIntegration.getCurrentRiskConfig();
      const performanceHistory = aiIntegration.getPerformanceHistory();

      setState({
        status,
        strategySelections,
        riskConfig,
        performanceHistory,
        isRunning: status.realTimeOptimizer.isRunning && status.predictiveAnalytics.isRunning,
        lastUpdate: Date.now()
      });
    }, 2000);

    // Listen for events
    const handleEvent = (eventName: string) => (data: any) => {
      // Update last update time when events occur
      setState(prev => ({ ...prev, lastUpdate: Date.now() }));
    };

    aiIntegration.on('parameterOptimized', handleEvent('parameterOptimized'));
    aiIntegration.on('regimeChanged', handleEvent('regimeChanged'));
    aiIntegration.on('strategySelectionUpdated', handleEvent('strategySelectionUpdated'));
    aiIntegration.on('riskAdjusted', handleEvent('riskAdjusted'));

    return () => {
      clearInterval(updateInterval);
      aiIntegration.removeAllListeners();
    };
  }, [aiIntegration]);

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getRegimeColor = (regime: MarketRegime): string => {
    switch (regime) {
      case 'bull_trending': return 'green';
      case 'bear_trending': return 'red';
      case 'high_volatility': return 'yellow';
      case 'risk_off': return 'red';
      case 'risk_on': return 'green';
      default: return 'white';
    }
  };

  const getRiskLevelColor = (level: string): string => {
    switch (level) {
      case 'low': return 'green';
      case 'medium': return 'yellow';
      case 'high': return 'red';
      case 'critical': return 'magenta';
      default: return 'white';
    }
  };

  if (!state.status) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">🔄 Loading Enhanced AI Integration...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box flexDirection="row" borderStyle="double" borderColor="cyan" padding={1}>
        <Text color="cyan" bold>🧠 Enhanced AI Integration Console</Text>
        <Spacer />
        <Text color={state.isRunning ? 'green' : 'red'}>
          {state.isRunning ? '🟢 ACTIVE' : '🔴 INACTIVE'}
        </Text>
      </Box>

      <Newline />

      {/* Status Overview */}
      <Box flexDirection="column" borderStyle="single" borderColor="blue" padding={1}>
        <Text color="blue" bold>📊 System Status</Text>
        <Newline />
        
        <Box flexDirection="row">
          <Box flexDirection="column" width="50%">
            <Text>Real-Time Optimizer:</Text>
            <Text color={state.status.realTimeOptimizer.isRunning ? 'green' : 'red'}>
              {state.status.realTimeOptimizer.isRunning ? '✅ Running' : '❌ Stopped'}
            </Text>
            <Text>Optimizations: {state.status.realTimeOptimizer.optimizationCount}</Text>
            <Text>Active A/B Tests: {state.status.realTimeOptimizer.activeABTests}</Text>
          </Box>
          
          <Box flexDirection="column" width="50%">
            <Text>Predictive Analytics:</Text>
            <Text color={state.status.predictiveAnalytics.isRunning ? 'green' : 'red'}>
              {state.status.predictiveAnalytics.isRunning ? '✅ Running' : '❌ Stopped'}
            </Text>
            <Text>Symbols Tracked: {state.status.predictiveAnalytics.symbolsTracked}</Text>
            <Text>ML Models Active: {state.status.predictiveAnalytics.modelsActive}</Text>
          </Box>
        </Box>

        <Newline />
        
        <Box flexDirection="row">
          <Text>Performance Score: </Text>
          <Text color={state.status.performanceScore > 70 ? 'green' : state.status.performanceScore > 40 ? 'yellow' : 'red'}>
            {state.status.performanceScore.toFixed(1)}/100
          </Text>
          <Spacer />
          <Text>Risk Level: </Text>
          <Text color={getRiskLevelColor(state.status.riskLevel)}>
            {state.status.riskLevel.toUpperCase()}
          </Text>
        </Box>
      </Box>

      <Newline />

      {/* Market Regimes */}
      <Box flexDirection="column" borderStyle="single" borderColor="yellow" padding={1}>
        <Text color="yellow" bold>🌍 Market Regimes</Text>
        <Newline />
        
        {Object.entries(state.status.currentRegimes).length > 0 ? (
          Object.entries(state.status.currentRegimes).map(([symbol, regime]) => (
            <Box key={symbol} flexDirection="row">
              <Text width={12}>{symbol}:</Text>
              <Text color={getRegimeColor(regime)}>{regime.replace('_', ' ').toUpperCase()}</Text>
            </Box>
          ))
        ) : (
          <Text color="gray">No regime data available</Text>
        )}
      </Box>

      <Newline />

      {/* Strategy Selections */}
      <Box flexDirection="column" borderStyle="single" borderColor="green" padding={1}>
        <Text color="green" bold>🎯 Active Strategies</Text>
        <Newline />
        
        {state.strategySelections.size > 0 ? (
          Array.from(state.strategySelections.entries()).map(([symbol, selection]) => (
            <Box key={symbol} flexDirection="column" marginBottom={1}>
              <Text color="cyan">{symbol} ({selection.regime.replace('_', ' ')}):</Text>
              {selection.selectedStrategies.map((strategy, index) => (
                <Box key={index} flexDirection="row" marginLeft={2}>
                  <Text width={20}>{strategy.strategy}:</Text>
                  <Text color="green">{formatPercentage(strategy.allocation)}</Text>
                  <Text color="gray"> (conf: {(strategy.confidence * 100).toFixed(0)}%)</Text>
                </Box>
              ))}
              {selection.disabledStrategies.length > 0 && (
                <Box flexDirection="column" marginLeft={2}>
                  <Text color="red">Disabled:</Text>
                  {selection.disabledStrategies.map((disabled, index) => (
                    <Text key={index} color="gray" marginLeft={2}>
                      {disabled.strategy}: {disabled.reasoning}
                    </Text>
                  ))}
                </Box>
              )}
            </Box>
          ))
        ) : (
          <Text color="gray">No strategy selections available</Text>
        )}
      </Box>

      <Newline />

      {/* Risk Configuration */}
      {state.riskConfig && (
        <>
          <Box flexDirection="column" borderStyle="single" borderColor="red" padding={1}>
            <Text color="red" bold>⚠️ Risk Management</Text>
            <Newline />
            
            <Box flexDirection="row">
              <Text>Risk Score: </Text>
              <Text color={state.riskConfig.riskScore > 75 ? 'red' : state.riskConfig.riskScore > 50 ? 'yellow' : 'green'}>
                {state.riskConfig.riskScore.toFixed(1)}/100
              </Text>
              <Spacer />
              <Text>Confidence: </Text>
              <Text color="cyan">{formatPercentage(state.riskConfig.confidence)}</Text>
            </Box>

            <Newline />

            <Text color="yellow">Recent Adjustments:</Text>
            {state.riskConfig.adjustments.slice(0, 3).map((adjustment, index) => (
              <Box key={index} flexDirection="column" marginLeft={2}>
                <Box flexDirection="row">
                  <Text color="red">{adjustment.trigger.replace('_', ' ')}:</Text>
                  <Text> {adjustment.currentRisk.toFixed(3)} → {adjustment.recommendedRisk.toFixed(3)}</Text>
                  <Text color="gray"> ({adjustment.urgency})</Text>
                </Box>
                <Text color="gray" marginLeft={2}>{adjustment.reasoning}</Text>
              </Box>
            ))}
          </Box>

          <Newline />
        </>
      )}

      {/* Performance History */}
      <Box flexDirection="column" borderStyle="single" borderColor="magenta" padding={1}>
        <Text color="magenta" bold>📈 Performance Trend</Text>
        <Newline />
        
        {state.performanceHistory.length > 0 ? (
          <Box flexDirection="row">
            {state.performanceHistory.slice(-10).map((point, index) => {
              const height = Math.floor(point.score / 10);
              const color = point.score > 70 ? 'green' : point.score > 40 ? 'yellow' : 'red';
              return (
                <Box key={index} flexDirection="column" marginRight={1}>
                  <Text color={color}>{'█'.repeat(Math.max(1, height))}</Text>
                  <Text color="gray">{point.score.toFixed(0)}</Text>
                </Box>
              );
            })}
          </Box>
        ) : (
          <Text color="gray">No performance history available</Text>
        )}
      </Box>

      <Newline />

      {/* Footer */}
      <Box flexDirection="row" borderStyle="single" borderColor="gray" padding={1}>
        <Text color="gray">Last Update: {formatTimestamp(state.lastUpdate)}</Text>
        <Spacer />
        <Text color="gray">Enhanced AI Integration v2.0</Text>
      </Box>
    </Box>
  );
};

export default EnhancedAIConsole;