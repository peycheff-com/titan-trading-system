/**
 * ControlDeck — Root Ink Component
 *
 * The operator's command center terminal UI.
 * Polls Brain /operator/state, provides tab navigation,
 * and delegates to control/timeline sub-components.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { BrainApiClient, type IntentQueryResult } from '../api/BrainApiClient.js';
import type { OperatorState, OperatorIntentType } from '@titan/shared';
import { GlobalControls } from './GlobalControls.js';
import { PhaseControls } from './PhaseControls.js';
import { RecoveryControls } from './RecoveryControls.js';
import { IntentTimeline } from './IntentTimeline.js';
import { ReceiptDetail } from './ReceiptDetail.js';

type Tab = 'controls' | 'timeline' | 'detail';

interface ControlDeckProps {
  api: BrainApiClient;
  operatorId: string;
  pollIntervalMs?: number;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  api,
  operatorId,
  pollIntervalMs = 2000,
}) => {
  const { exit } = useApp();
  const [tab, setTab] = useState<Tab>('controls');
  const [state, setState] = useState<OperatorState | null>(null);
  const [intents, setIntents] = useState<IntentQueryResult>({ intents: [], total: 0 });
  const [selectedIntentIdx, setSelectedIntentIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [controlSection, setControlSection] = useState<'global' | 'phase' | 'recovery'>('global');
  const [lastAction, setLastAction] = useState<string | null>(null);

  // Poll state + intents
  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const [s, i] = await Promise.all([
          api.getState(),
          api.getIntents({ limit: 20 }),
        ]);
        if (active) {
          setState(s);
          setIntents(i);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    };

    poll();
    const interval = setInterval(poll, pollIntervalMs);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [api, pollIntervalMs]);

  // Submit intent helper
  const submitIntent = useCallback(
    async (
      type: string,
      params: Record<string, unknown>,
      reason: string,
    ) => {
      try {
        setLastAction(`Submitting ${type}...`);
        const result = await api.submitIntent(
          type as OperatorIntentType,
          params,
          reason,
          operatorId,
          state?.state_hash,
        );
        if (result.status === 'ACCEPTED') {
          setLastAction(`✓ ${type} accepted`);
        } else if (result.status === 'IDEMPOTENT_HIT') {
          setLastAction(`↻ ${type} idempotent hit`);
        } else {
          setLastAction(`✗ ${type} rejected: ${result.error}`);
        }
      } catch (e) {
        setLastAction(`✗ ${type} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [api, operatorId, state?.state_hash],
  );

  // Keyboard navigation
  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    if (key.tab) {
      setTab((prev) => {
        if (prev === 'controls') return 'timeline';
        if (prev === 'timeline') return 'detail';
        return 'controls';
      });
      return;
    }

    // Within controls tab, switch sections with 1/2/3
    if (tab === 'controls') {
      if (input === '1') setControlSection('global');
      if (input === '2') setControlSection('phase');
      if (input === '3') setControlSection('recovery');
    }

    // Timeline navigation
    if (tab === 'timeline') {
      if (key.upArrow) setSelectedIntentIdx((p) => Math.max(0, p - 1));
      if (key.downArrow) setSelectedIntentIdx((p) => Math.min(intents.intents.length - 1, p + 1));
      if (key.return) {
        setTab('detail');
      }
    }
  });

  // Posture color
  const postureColor = !state
    ? 'grey'
    : state.posture === 'armed'
      ? 'green'
      : state.posture === 'halted'
        ? 'red'
        : 'yellow';

  const breakerColor = !state
    ? 'grey'
    : state.breaker !== 'closed'
      ? 'red'
      : 'green';

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          ⚙ TITAN CONTROL DECK
        </Text>
        <Box gap={2}>
          <Text>
            Mode: <Text bold color="white">{state?.mode ?? '...'}</Text>
          </Text>
          <Text>
            Posture: <Text bold color={postureColor}>{state?.posture ?? '...'}</Text>
          </Text>
          <Text>
            Breaker: <Text bold color={breakerColor}>{state?.breaker !== 'closed' ? state?.breaker?.toUpperCase() : 'OK'}</Text>
          </Text>
          <Text dimColor>
            Hash: {state?.state_hash?.slice(0, 8) ?? '--------'}
          </Text>
          {(state?.pending_approvals ?? 0) > 0 && (
            <Text color="yellow" bold>
              ⏳ {state?.pending_approvals} pending
            </Text>
          )}
        </Box>
      </Box>

      {/* Error banner */}
      {error && (
        <Box marginTop={1} paddingX={1}>
          <Text color="red" bold>⚠ {error}</Text>
        </Box>
      )}

      {/* Last action feedback */}
      {lastAction && (
        <Box marginTop={1} paddingX={1}>
          <Text color="yellow">{lastAction}</Text>
        </Box>
      )}

      {/* Tab bar */}
      <Box marginTop={1} gap={2}>
        <Text color={tab === 'controls' ? 'cyan' : 'grey'} bold={tab === 'controls'}>
          [1-3] Controls
        </Text>
        <Text color={tab === 'timeline' ? 'cyan' : 'grey'} bold={tab === 'timeline'}>
          Timeline
        </Text>
        <Text color={tab === 'detail' ? 'cyan' : 'grey'} bold={tab === 'detail'}>
          Detail
        </Text>
        <Text dimColor>| TAB cycle | q quit</Text>
      </Box>

      {/* Tab content */}
      <Box marginTop={1}>
        {tab === 'controls' && state && (
          <Box flexDirection="column" width="100%">
            {controlSection === 'global' && (
              <GlobalControls
                state={state}
                onSubmit={submitIntent}
              />
            )}
            {controlSection === 'phase' && (
              <PhaseControls
                state={state}
                onSubmit={submitIntent}
              />
            )}
            {controlSection === 'recovery' && (
              <RecoveryControls
                state={state}
                onSubmit={submitIntent}
              />
            )}
          </Box>
        )}

        {tab === 'timeline' && (
          <IntentTimeline
            intents={intents.intents}
            total={intents.total}
            selectedIdx={selectedIntentIdx}
          />
        )}

        {tab === 'detail' && (
          <ReceiptDetail
            intent={intents.intents[selectedIntentIdx] ?? null}
          />
        )}
      </Box>
    </Box>
  );
};

export default ControlDeck;
