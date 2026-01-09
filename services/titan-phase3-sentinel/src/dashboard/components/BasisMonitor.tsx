
import React from 'react';
import { Box, Text } from 'ink';
import type { Signal } from '../../types/signals.js';

interface BasisMonitorProps {
  signals: Signal[];
}

export const BasisMonitor: React.FC<BasisMonitorProps> = ({ signals }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} flexGrow={1}>
      <Text bold color="yellow">Basis Monitor</Text>
      <Box flexDirection="row" borderStyle="single" borderColor="grey">
          <Box width="15%"><Text underline>Symbol</Text></Box>
          <Box width="15%"><Text underline>Basis</Text></Box>
          <Box width="15%"><Text underline>Z-Score</Text></Box>
          <Box width="15%"><Text underline>Action</Text></Box>
          <Box width="15%"><Text underline>Conf</Text></Box>
      </Box>
      {signals.map((sig, idx) => (
        <Box key={sig.symbol || idx} flexDirection="row">
           <Box width="15%"><Text>{sig.symbol}</Text></Box>
           <Box width="15%"><Text color={sig.basis < 0 ? 'red' : 'green'}>{sig.basis ? (sig.basis * 100).toFixed(3) : '0.000'}%</Text></Box>
           <Box width="15%"><Text>{sig.zScore ? sig.zScore.toFixed(2) : '0.00'}</Text></Box>
           <Box width="15%"><Text color={sig.action === 'EXPAND' ? 'green' : (sig.action === 'CONTRACT' ? 'red' : 'white')}>{sig.action}</Text></Box>
           <Box width="15%"><Text>{sig.confidence ? sig.confidence.toFixed(2) : '0.00'}</Text></Box>
        </Box>
      ))}
      {signals.length === 0 && <Text italic color="grey">No active signals monitored</Text>}
    </Box>
  );
};
