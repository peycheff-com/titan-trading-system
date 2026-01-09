
import React from 'react';
import { Box, Text } from 'ink';
import type { PerformanceMetrics } from '../../types/portfolio.js';

interface YieldPanelProps {
  metrics: PerformanceMetrics;
}

export const YieldPanel: React.FC<YieldPanelProps> = ({ metrics }) => {
    return (
        <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
            <Text bold color="green">Yield Performance</Text>
            <Box flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between">
                    <Text>24h Yield:</Text>
                    <Text color={metrics.totalYield24h >= 0 ? 'green' : 'red'}>${metrics.totalYield24h.toFixed(2)}</Text>
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                    <Text>Basis PnL:</Text>
                    <Text>${metrics.basisScalpingPnL24h.toFixed(2)}</Text>
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                    <Text>Win Rate:</Text>
                    <Text>{(metrics.winRate * 100).toFixed(1)}%</Text>
                </Box>
                 <Box flexDirection="row" justifyContent="space-between">
                    <Text>Trades:</Text>
                    <Text>{metrics.totalTrades}</Text>
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                    <Text>Sharpe:</Text>
                    <Text>{metrics.sharpeRatio.toFixed(2)}</Text>
                </Box>
                <Box flexDirection="row" justifyContent="space-between">
                    <Text>Max DD:</Text>
                    <Text color="red">{(metrics.maxDrawdown * 100).toFixed(2)}%</Text>
                </Box>
            </Box>
        </Box>
    );
};
