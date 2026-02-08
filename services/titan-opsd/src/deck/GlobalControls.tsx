/**
 * GlobalControls — ARM/DISARM toggle and Mode selector
 *
 * Provides the primary system posture controls with
 * confirmation guards and reason prompts.
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { OperatorState } from '@titan/shared';

interface GlobalControlsProps {
  state: OperatorState;
  onSubmit: (type: string, params: Record<string, unknown>, reason: string) => void;
}

type Mode = 'paper' | 'live-limited' | 'live-full';
const MODES: Mode[] = ['paper', 'live-limited', 'live-full'];

type Prompt = null | 'arm_confirm' | 'disarm_confirm' | 'mode_select' | 'override_risk_confirm';

export const GlobalControls: React.FC<GlobalControlsProps> = ({ state, onSubmit }) => {
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [modeIdx, setModeIdx] = useState(() => {
    const idx = MODES.indexOf(state.mode as Mode);
    return idx >= 0 ? idx : 0;
  });

  useInput((input, key) => {
    // No prompt active — show shortcuts
    if (!prompt) {
      if (input === 'a') {
        if (state.posture === 'armed') {
          setPrompt('disarm_confirm');
        } else {
          setPrompt('arm_confirm');
        }
      }
      if (input === 'm') {
        setPrompt('mode_select');
      }
      if (input === 'o') {
        setPrompt('override_risk_confirm');
      }
      return;
    }

    // ARM/DISARM confirmation
    if (prompt === 'arm_confirm') {
      if (input === 'y') {
        onSubmit('ARM', {}, 'Operator armed system via Control Deck');
        setPrompt(null);
      } else {
        setPrompt(null);
      }
      return;
    }

    if (prompt === 'disarm_confirm') {
      if (input === 'y') {
        onSubmit('DISARM', {}, 'Operator disarmed system via Control Deck');
        setPrompt(null);
      } else {
        setPrompt(null);
      }
      return;
    }

    // Mode selection
    if (prompt === 'mode_select') {
      if (key.upArrow) setModeIdx((p) => Math.max(0, p - 1));
      if (key.downArrow) setModeIdx((p) => Math.min(MODES.length - 1, p + 1));
      if (key.return) {
        const selected = MODES[modeIdx];
        if (selected !== state.mode) {
          onSubmit('SET_MODE', { mode: selected }, `Mode changed to ${selected} via Control Deck`);
        }
        setPrompt(null);
      }
      if (key.escape || input === 'q') {
        setPrompt(null);
      }
      return;
    }

    // Override risk confirmation
    if (prompt === 'override_risk_confirm') {
      if (input === 'y') {
        onSubmit(
          'OVERRIDE_RISK',
          { duration_seconds: 300 },
          'Temporary risk override (5min) via Control Deck',
        );
        setPrompt(null);
      } else {
        setPrompt(null);
      }
      return;
    }
  });

  const postureColor = state.posture === 'armed' ? 'green' : state.posture === 'halted' ? 'red' : 'yellow';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" padding={1}>
      <Text bold color="green">⚡ GLOBAL CONTROLS</Text>

      {/* Current state display */}
      <Box marginTop={1} gap={3}>
        <Box flexDirection="column">
          <Text dimColor>Posture</Text>
          <Text bold color={postureColor}>
            {state.posture === 'armed' ? '🟢 ARMED' : state.posture === 'halted' ? '🔴 HALTED' : '🟡 DISARMED'}
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text dimColor>Mode</Text>
          <Text bold color="white">{state.mode}</Text>
        </Box>
        <Box flexDirection="column">
          <Text dimColor>Confidence</Text>
          <Text bold color={state.truth_confidence === 'high' ? 'green' : state.truth_confidence === 'degraded' ? 'yellow' : 'red'}>
            {state.truth_confidence}
          </Text>
        </Box>
      </Box>

      {/* Shortcuts */}
      {!prompt && (
        <Box marginTop={1}>
          <Text dimColor>
            [a] {state.posture === 'armed' ? 'Disarm' : 'Arm'} System   [m] Change Mode   [o] Override Risk
          </Text>
        </Box>
      )}

      {/* ARM confirmation prompt */}
      {prompt === 'arm_confirm' && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            ⚠ ARM system? This enables live trading. [y/n]
          </Text>
        </Box>
      )}

      {/* DISARM confirmation prompt */}
      {prompt === 'disarm_confirm' && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" padding={1}>
          <Text color="yellow" bold>
            ⚠ DISARM system? This stops all trading. [y/n]
          </Text>
        </Box>
      )}

      {/* Mode selector */}
      {prompt === 'mode_select' && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="blue" padding={1}>
          <Text bold color="blue">Select Mode (↑/↓ then Enter):</Text>
          {MODES.map((m, i) => (
            <Box key={m} gap={1}>
              <Text color={i === modeIdx ? 'cyan' : 'grey'}>
                {i === modeIdx ? '▸' : ' '} {m}
              </Text>
              {m === state.mode && <Text dimColor>(current)</Text>}
            </Box>
          ))}
        </Box>
      )}

      {/* Override risk confirmation */}
      {prompt === 'override_risk_confirm' && (
        <Box marginTop={1} borderStyle="round" borderColor="red" padding={1}>
          <Text color="red" bold>
            🚨 OVERRIDE RISK for 5 minutes? This requires approval. [y/n]
          </Text>
        </Box>
      )}
    </Box>
  );
};

export default GlobalControls;
