
import React from 'react';
import { Box, Text } from 'ink';
import type { HealthReport } from '../../types/portfolio.js';

interface NavPanelProps {
  health: HealthReport;
}

export const NavPanel: React.FC<NavPanelProps> = ({ health }) => {
  const deltaColor = Math.abs(health.delta) > 5000 ? 'red' : 'green';
  const utilColor = health.marginUtilization > 0.5 ? 'red' : (health.marginUtilization > 0.3 ? 'yellow' : 'green');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Text bold color="cyan">Portfolio Health</Text>
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="column">
            <Text>NAV:</Text>
            <Text bold color="green">${health.nav.toFixed(2)}</Text>
        </Box>
        <Box flexDirection="column">
            <Text>Delta:</Text>
            <Text bold color={deltaColor}>${health.delta.toFixed(2)}</Text>
        </Box>
        <Box flexDirection="column">
            <Text>Margin Util:</Text>
            <Text bold color={utilColor}>{(health.marginUtilization * 100).toFixed(1)}%</Text>
        </Box>
        <Box flexDirection="column">
            <Text>Status:</Text>
            <Text bold color={health.riskStatus === 'HEALTHY' ? 'green' : 'red'}>{health.riskStatus}</Text>
        </Box>
      </Box>
    </Box>
  );
};
