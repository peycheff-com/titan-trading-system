/**
 * ReceiptDetail — Detailed view for a selected intent's receipt
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
    prior_state?: Record<string, unknown>;
    new_state?: Record<string, unknown>;
    verification?: string;
    error?: string;
  };
}

interface ReceiptDetailProps {
  intent: IntentEntry | null;
}

function formatObj(obj: Record<string, unknown> | undefined): string {
  if (!obj) return '—';
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
}

export const ReceiptDetail: React.FC<ReceiptDetailProps> = ({ intent }) => {
  if (!intent) {
    return (
      <Box borderStyle="single" borderColor="grey" padding={1}>
        <Text dimColor>No intent selected. Go to Timeline tab and select one.</Text>
      </Box>
    );
  }

  const receipt = intent.receipt;
  const statusColor =
    intent.status === 'VERIFIED' ? 'green' :
    intent.status === 'FAILED' ? 'red' :
    intent.status === 'UNVERIFIED' ? 'grey' : 'yellow';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="white" padding={1}>
      <Text bold color="white">📄 INTENT DETAIL</Text>

      {/* Core fields */}
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text dimColor>ID:</Text>
          <Text>{intent.id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Type:</Text>
          <Text bold>{intent.type}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Status:</Text>
          <Text bold color={statusColor}>{intent.status}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Operator:</Text>
          <Text>{intent.operator_id}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Reason:</Text>
          <Text>{intent.reason}</Text>
        </Box>
        <Box gap={1}>
          <Text dimColor>Submitted:</Text>
          <Text>{new Date(intent.submitted_at).toLocaleString()}</Text>
        </Box>
        {intent.resolved_at && (
          <Box gap={1}>
            <Text dimColor>Resolved:</Text>
            <Text>{new Date(intent.resolved_at).toLocaleString()}</Text>
          </Box>
        )}
      </Box>

      {/* Receipt section */}
      {receipt && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="grey" padding={1}>
          <Text bold color="grey">Receipt</Text>

          {receipt.effect && (
            <Box gap={1}>
              <Text dimColor>Effect:</Text>
              <Text color="green">{receipt.effect}</Text>
            </Box>
          )}

          {receipt.prior_state && (
            <Box gap={1}>
              <Text dimColor>Before:</Text>
              <Text>{formatObj(receipt.prior_state)}</Text>
            </Box>
          )}

          {receipt.new_state && (
            <Box gap={1}>
              <Text dimColor>After:</Text>
              <Text color="cyan">{formatObj(receipt.new_state)}</Text>
            </Box>
          )}

          {receipt.verification && (
            <Box gap={1}>
              <Text dimColor>Verification:</Text>
              <Text color={receipt.verification === 'passed' ? 'green' : 'yellow'}>
                {receipt.verification}
              </Text>
            </Box>
          )}

          {receipt.error && (
            <Box gap={1}>
              <Text dimColor>Error:</Text>
              <Text color="red">{receipt.error}</Text>
            </Box>
          )}
        </Box>
      )}

      {!receipt && (
        <Box marginTop={1}>
          <Text dimColor>No receipt yet — intent may still be executing.</Text>
        </Box>
      )}
    </Box>
  );
};

export default ReceiptDetail;
