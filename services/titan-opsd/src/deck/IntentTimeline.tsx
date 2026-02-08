/**
 * IntentTimeline — Color-coded list of recent intents
 */
import React from 'react';
import { Box, Text } from 'ink';

interface IntentEntry {
  id: string;
  type: string;
  status: string;
  operator_id: string;
  reason: string;
  submitted_at: string;
  resolved_at?: string;
  receipt?: {
    effect?: string;
    error?: string;
  };
}

interface IntentTimelineProps {
  intents: IntentEntry[];
  total: number;
  selectedIdx: number;
}

const statusColor = (status: string): string => {
  switch (status) {
    case 'VERIFIED':
      return 'green';
    case 'EXECUTING':
    case 'ACCEPTED':
      return 'yellow';
    case 'FAILED':
      return 'red';
    case 'UNVERIFIED':
      return 'grey';
    default:
      return 'white';
  }
};

const statusIcon = (status: string): string => {
  switch (status) {
    case 'VERIFIED':
      return '✓';
    case 'EXECUTING':
      return '⟳';
    case 'ACCEPTED':
      return '→';
    case 'FAILED':
      return '✗';
    case 'UNVERIFIED':
      return '?';
    default:
      return ' ';
  }
};

export const IntentTimeline: React.FC<IntentTimelineProps> = ({
  intents,
  total,
  selectedIdx,
}) => {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">📋 INTENT TIMELINE</Text>
        <Text dimColor>({intents.length} of {total}) | ↑/↓ select, Enter for detail</Text>
      </Box>

      {/* Header row */}
      <Box marginTop={1}>
        <Text bold color="white">
          {'  '}{' '}
          {'STATUS'.padEnd(12)}
          {'TYPE'.padEnd(16)}
          {'OPERATOR'.padEnd(14)}
          {'TIME'.padEnd(22)}
          {'EFFECT'}
        </Text>
      </Box>

      {/* Intent rows */}
      {intents.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No intents submitted yet.</Text>
        </Box>
      ) : (
        intents.map((intent, idx) => {
          const isSelected = idx === selectedIdx;
          const color = statusColor(intent.status);
          const icon = statusIcon(intent.status);
          const time = new Date(intent.submitted_at).toLocaleTimeString();
          const effect = intent.receipt?.effect ?? intent.receipt?.error ?? '';

          return (
            <Box key={intent.id}>
              <Text color={isSelected ? 'cyan' : 'grey'}>
                {isSelected ? '▸' : ' '}{' '}
              </Text>
              <Text color={color}>
                {icon} {intent.status.padEnd(11)}
              </Text>
              <Text color="white">
                {intent.type.padEnd(16)}
              </Text>
              <Text dimColor>
                {intent.operator_id.padEnd(14)}
              </Text>
              <Text dimColor>
                {time.padEnd(22)}
              </Text>
              <Text color={intent.receipt?.error ? 'red' : 'grey'}>
                {effect.slice(0, 30)}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
};

export default IntentTimeline;
