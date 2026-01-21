import React from 'react';
import { Box, Text } from 'ink';
import type { HealthReport } from '../../types/portfolio.js';

interface InventoryPanelProps {
  health: HealthReport;
}

export const InventoryPanel: React.FC<InventoryPanelProps> = ({ health }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} flexGrow={1}>
      <Text bold color="magenta">
        Inventory Health
      </Text>
      <Box flexDirection="row" borderStyle="single" borderColor="grey">
        <Box width="20%">
          <Text underline>Symbol</Text>
        </Box>
        <Box width="20%">
          <Text underline>Type</Text>
        </Box>
        <Box width="20%">
          <Text underline>Size (USD)</Text>
        </Box>
        <Box width="20%">
          <Text underline>Basis</Text>
        </Box>
        <Box width="20%">
          <Text underline>PnL</Text>
        </Box>
      </Box>
      {health.positions.map((pos, idx) => (
        <Box key={pos.symbol || idx} flexDirection="row">
          <Box width="20%">
            <Text>{pos.symbol}</Text>
          </Box>
          <Box width="20%">
            <Text>{pos.type}</Text>
          </Box>
          <Box width="20%">
            <Text>${(pos.spotSize * pos.spotEntry).toFixed(0)}</Text>
          </Box>
          <Box width="20%">
            <Text>{(pos.currentBasis * 100).toFixed(3)}%</Text>
          </Box>
          <Box width="20%">
            <Text color={pos.unrealizedPnL >= 0 ? 'green' : 'red'}>
              ${pos.unrealizedPnL.toFixed(2)}
            </Text>
          </Box>
        </Box>
      ))}
      {health.positions.length === 0 && (
        <Text italic color="grey">
          No active positions
        </Text>
      )}
    </Box>
  );
};
