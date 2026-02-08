/**
 * RecoveryControls — Reconciliation, breaker status, truth confidence
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { OperatorState } from '@titan/shared';

interface RecoveryControlsProps {
  state: OperatorState;
  onSubmit: (type: string, params: Record<string, unknown>, reason: string) => void;
}

export const RecoveryControls: React.FC<RecoveryControlsProps> = ({ state, onSubmit }) => {
  const [confirmRecon, setConfirmRecon] = useState(false);

  useInput((input) => {
    if (confirmRecon) {
      if (input === 'y') {
        onSubmit('RUN_RECONCILE', {}, 'Manual reconciliation via Control Deck');
        setConfirmRecon(false);
      } else {
        setConfirmRecon(false);
      }
      return;
    }

    if (input === 'r') {
      setConfirmRecon(true);
    }
  });

  const breakerColor = state.breaker !== 'closed' ? 'red' : 'green';
  const confidenceColor =
    state.truth_confidence === 'high' ? 'green' :
    state.truth_confidence === 'degraded' ? 'yellow' : 'red';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="magenta" padding={1}>
      <Text bold color="magenta">🔧 RECOVERY CONTROLS</Text>

      <Box marginTop={1} gap={3}>
        {/* Circuit Breaker */}
        <Box flexDirection="column">
          <Text dimColor>Circuit Breaker</Text>
          <Text bold color={breakerColor}>
            {state.breaker !== 'closed' ? `🔴 ${state.breaker.toUpperCase()}` : '🟢 CLOSED'}
          </Text>
          {state.breaker !== 'closed' && (
            <Text dimColor>State: {state.breaker}</Text>
          )}
        </Box>

        {/* Truth Confidence */}
        <Box flexDirection="column">
          <Text dimColor>Truth Confidence</Text>
          <Text bold color={confidenceColor}>
            {state.truth_confidence}
          </Text>
        </Box>

        {/* Active Incidents */}
        <Box flexDirection="column">
          <Text dimColor>Active Incidents</Text>
          <Text bold color={state.active_incidents > 0 ? 'red' : 'green'}>
            {state.active_incidents}
          </Text>
        </Box>
      </Box>

      {/* Actions */}
      {!confirmRecon && (
        <Box marginTop={1}>
          <Text dimColor>[r] Run Reconciliation</Text>
        </Box>
      )}

      {confirmRecon && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            ⚠ Run full system reconciliation? This may take a moment. [y/n]
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default RecoveryControls;
