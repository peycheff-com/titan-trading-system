/**
 * ProposalCard Component
 * 
 * Displays an optimization proposal with diff view showing old vs new values,
 * projected PnL improvement, and risk impact.
 * 
 * Requirements: 4.1, 4.2
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { OptimizationProposal } from '../types/index.js';

export interface ProposalCardProps {
  proposal: OptimizationProposal;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  showControls?: boolean;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    // Format percentages nicely
    if (value < 1 && value > 0) {
      return `${(value * 100).toFixed(2)}%`;
    }
    return value.toFixed(4);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null || value === undefined) {
    return 'N/A';
  }
  return String(value);
}

/**
 * ProposalCard Component
 * 
 * Requirement 4.1: Display proposal in console UI with diff view
 * Requirement 4.2: Show old vs new values, projected PnL improvement, and risk impact
 */
export function ProposalCard({ 
  proposal, 
  onApprove, 
  onReject, 
  showControls = true 
}: ProposalCardProps): React.ReactElement {
  const { targetKey, currentValue, suggestedValue, reasoning, expectedImpact, status } = proposal;
  
  // Determine status color
  let statusColor: 'yellow' | 'green' | 'red' | 'gray' = 'yellow';
  if (status === 'approved' || status === 'applied') {
    statusColor = 'green';
  } else if (status === 'rejected') {
    statusColor = 'red';
  } else if (status === 'pending') {
    statusColor = 'yellow';
  }
  
  // Determine impact colors
  const pnlColor = expectedImpact.pnlImprovement >= 0 ? 'green' : 'red';
  const riskColor = expectedImpact.riskChange <= 0 ? 'green' : 
                    expectedImpact.riskChange <= 5 ? 'yellow' : 'red';
  const confidenceColor = expectedImpact.confidenceScore >= 0.7 ? 'green' :
                          expectedImpact.confidenceScore >= 0.5 ? 'yellow' : 'red';

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      {/* Header with status */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">📊 Optimization Proposal</Text>
        {status && (
          <Text color={statusColor}>[{status.toUpperCase()}]</Text>
        )}
      </Box>
      
      {/* Target key */}
      <Box marginTop={1}>
        <Text dimColor>Parameter: </Text>
        <Text bold color="white">{targetKey}</Text>
      </Box>
      
      {/* Diff view - old vs new */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Value Change:</Text>
        <Box marginLeft={2}>
          <Text color="red">- {formatValue(currentValue)}</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color="green">+ {formatValue(suggestedValue)}</Text>
        </Box>
      </Box>
      
      {/* Reasoning */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Reasoning:</Text>
        <Box marginLeft={2}>
          <Text wrap="wrap">{reasoning}</Text>
        </Box>
      </Box>
      
      {/* Expected Impact */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Expected Impact:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Box>
            <Text>PnL: </Text>
            <Text color={pnlColor}>
              {expectedImpact.pnlImprovement >= 0 ? '+' : ''}
              {expectedImpact.pnlImprovement.toFixed(1)}%
            </Text>
          </Box>
          <Box>
            <Text>Risk: </Text>
            <Text color={riskColor}>
              {expectedImpact.riskChange >= 0 ? '+' : ''}
              {expectedImpact.riskChange.toFixed(1)}%
            </Text>
          </Box>
          <Box>
            <Text>Confidence: </Text>
            <Text color={confidenceColor}>
              {(expectedImpact.confidenceScore * 100).toFixed(0)}%
            </Text>
          </Box>
        </Box>
      </Box>
      
      {/* Validation Report Summary (if available) */}
      {proposal.validationReport && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Backtest Results:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Box>
              <Text>Baseline PnL: </Text>
              <Text>{proposal.validationReport.baselineMetrics.totalPnL.toFixed(2)}</Text>
            </Box>
            <Box>
              <Text>Proposed PnL: </Text>
              <Text color={proposal.validationReport.deltas.pnlDelta >= 0 ? 'green' : 'red'}>
                {proposal.validationReport.proposedMetrics.totalPnL.toFixed(2)}
              </Text>
              <Text dimColor> ({proposal.validationReport.deltas.pnlDeltaPercent >= 0 ? '+' : ''}
                {proposal.validationReport.deltas.pnlDeltaPercent.toFixed(1)}%)</Text>
            </Box>
            <Box>
              <Text>Recommendation: </Text>
              <Text color={proposal.validationReport.recommendation === 'approve' ? 'green' : 
                          proposal.validationReport.recommendation === 'reject' ? 'red' : 'yellow'}>
                {proposal.validationReport.recommendation.toUpperCase()}
              </Text>
            </Box>
          </Box>
        </Box>
      )}
      
      {/* Controls */}
      {showControls && status === 'pending' && (
        <Box marginTop={1} borderStyle="single" borderColor="yellow" padding={1}>
          <Text color="yellow">[ENTER] Apply  [ESC] Reject</Text>
        </Box>
      )}
    </Box>
  );
}

export default ProposalCard;
