/**
 * PhaseControls — Phase status display and throttle actions
 *
 * Shows Phase 1/2/3 health indicators and provides
 * THROTTLE_PHASE action per phase.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { OperatorState } from '@titan/shared';

interface PhaseControlsProps {
  state: OperatorState;
  onSubmit: (type: string, params: Record<string, unknown>, reason: string) => void;
}

const PHASE_KEYS = ['phase1', 'phase2', 'phase3'] as const;

const statusColor = (status: string): string => {
  switch (status) {
    case 'active':
    case 'running':
      return 'green';
    case 'throttled':
    case 'paused':
      return 'yellow';
    case 'stopped':
    case 'error':
      return 'red';
    default:
      return 'grey';
  }
};

export const PhaseControls: React.FC<PhaseControlsProps> = ({ state, onSubmit }) => {
  const [selectedPhase, setSelectedPhase] = useState(0);
  const [confirmThrottle, setConfirmThrottle] = useState(false);

  useInput((input, key) => {
    if (confirmThrottle) {
      if (input === 'y') {
        const phaseKey = PHASE_KEYS[selectedPhase];
        const phase = state.phases[phaseKey];
        const action = phase.status === 'throttled' ? 'resume' : 'throttle';
        onSubmit(
          'THROTTLE_PHASE',
          { phase_id: phaseKey, action },
          `${action} ${phase.name} via Control Deck`,
        );
        setConfirmThrottle(false);
      } else {
        setConfirmThrottle(false);
      }
      return;
    }

    if (key.upArrow) setSelectedPhase((p) => Math.max(0, p - 1));
    if (key.downArrow) setSelectedPhase((p) => Math.min(PHASE_KEYS.length - 1, p + 1));
    if (input === 't' || key.return) {
      setConfirmThrottle(true);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" padding={1}>
      <Text bold color="blue">📊 PHASE CONTROLS</Text>

      <Box marginTop={1} flexDirection="column">
        {PHASE_KEYS.map((key, idx) => {
          const phase = state.phases[key];
          const isSelected = idx === selectedPhase;
          const color = statusColor(phase.status);

          return (
            <Box key={key} gap={2}>
              <Text color={isSelected ? 'cyan' : 'grey'}>
                {isSelected ? '▸' : ' '}
              </Text>
              <Text bold color={color}>
                {phase.name.padEnd(12)}
              </Text>
              <Text color={color}>
                {phase.status.toUpperCase().padEnd(12)}
              </Text>
              <Text dimColor>
                Throttle: {phase.throttle_pct}%
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Shortcuts */}
      {!confirmThrottle && (
        <Box marginTop={1}>
          <Text dimColor>[↑/↓] Select   [t] Toggle Throttle</Text>
        </Box>
      )}

      {/* Confirmation */}
      {confirmThrottle && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            ⚠ {state.phases[PHASE_KEYS[selectedPhase]].status === 'throttled' ? 'Resume' : 'Throttle'}{' '}
            {state.phases[PHASE_KEYS[selectedPhase]].name}? [y/n]
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default PhaseControls;
