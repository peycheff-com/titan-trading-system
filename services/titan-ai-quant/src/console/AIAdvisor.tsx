/**
 * AIAdvisor Component
 *
 * Displays AI insights and optimization proposals in the console UI.
 * Shows recent insights (top 3) and pending proposals with approval/rejection controls.
 *
 * Requirements: 4.1, 4.2, 4.5
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Insight, OptimizationProposal } from '../types/index.js';
import { ProposalCard } from './ProposalCard.js';

export interface AIAdvisorProps {
  /** Whether the panel is visible */
  visible: boolean;
  /** Recent insights from strategic memory */
  insights: Insight[];
  /** Pending optimization proposals */
  pendingProposals: OptimizationProposal[];
  /** Callback when user approves a proposal */
  onApprove?: (proposalId: number) => void;
  /** Callback when user rejects a proposal */
  onReject?: (proposalId: number) => void;
}

/**
 * Format confidence score for display
 */
function formatConfidence(confidence: number): string {
  return `${(confidence * 100).toFixed(0)}%`;
}

/**
 * Get color based on confidence level
 */
function getConfidenceColor(confidence: number): 'green' | 'yellow' | 'red' {
  if (confidence >= 0.7) return 'green';
  if (confidence >= 0.5) return 'yellow';
  return 'red';
}

/**
 * InsightItem Component
 * Displays a single insight with topic, text, and confidence
 */
function InsightItem({ insight, index }: { insight: Insight; index: number }): React.ReactElement {
  const confidenceColor = getConfidenceColor(insight.confidence);

  return (
    <Box flexDirection="column" marginTop={index > 0 ? 1 : 0}>
      <Box>
        <Text color="cyan">• </Text>
        <Text bold>{insight.topic}</Text>
        <Text dimColor> (</Text>
        <Text color={confidenceColor}>{formatConfidence(insight.confidence)}</Text>
        <Text dimColor>)</Text>
      </Box>
      <Box marginLeft={2}>
        <Text wrap="wrap">{insight.text}</Text>
      </Box>
      {insight.affectedSymbols && insight.affectedSymbols.length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>Symbols: </Text>
          <Text>{insight.affectedSymbols.join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * AIAdvisor Component
 *
 * Requirement 4.1: Display proposals in console UI with diff view
 * Requirement 4.2: Show old vs new values, projected PnL improvement, and risk impact
 * Requirement 4.5: Display proposals in AI Advisor panel accessible via toggle key
 */
export function AIAdvisor({
  visible,
  insights,
  pendingProposals,
  onApprove,
  onReject,
}: AIAdvisorProps): React.ReactElement | null {
  // Don't render if not visible
  if (!visible) {
    return null;
  }

  // Get top 3 insights
  const topInsights = insights.slice(0, 3);

  // Get first pending proposal (for focused approval workflow)
  const currentProposal = pendingProposals.find((p) => p.status === 'pending');

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          🤖 AI Advisor
        </Text>
        <Text dimColor>[A] Toggle Panel</Text>
      </Box>

      {/* Recent Insights Section */}
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="single" borderColor="blue" padding={1}>
          <Text bold color="blue">
            💡 Recent Insights
          </Text>
        </Box>

        {topInsights.length > 0 ? (
          <Box flexDirection="column" marginTop={1} marginLeft={1}>
            {topInsights.map((insight, idx) => (
              <InsightItem key={insight.id || idx} insight={insight} index={idx} />
            ))}
          </Box>
        ) : (
          <Box marginTop={1} marginLeft={1}>
            <Text dimColor>No insights available. Run /analyze to generate insights.</Text>
          </Box>
        )}
      </Box>

      {/* Pending Proposals Section */}
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="single" borderColor="yellow" padding={1}>
          <Text bold color="yellow">
            ⚡ Pending Optimizations (
            {pendingProposals.filter((p) => p.status === 'pending').length})
          </Text>
        </Box>

        {currentProposal ? (
          <Box marginTop={1}>
            <ProposalCard
              proposal={currentProposal}
              onApprove={onApprove}
              onReject={onReject}
              showControls={true}
            />
          </Box>
        ) : (
          <Box marginTop={1} marginLeft={1}>
            <Text dimColor>No pending proposals. Run /optimize to generate proposals.</Text>
          </Box>
        )}

        {/* Show count of additional pending proposals */}
        {pendingProposals.filter((p) => p.status === 'pending').length > 1 && (
          <Box marginTop={1} marginLeft={1}>
            <Text dimColor>
              +{pendingProposals.filter((p) => p.status === 'pending').length - 1} more pending
              proposals
            </Text>
          </Box>
        )}
      </Box>

      {/* Quick Stats */}
      <Box flexDirection="column" marginTop={1}>
        <Box borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="gray">
            📊 Quick Stats
          </Text>
        </Box>
        <Box marginTop={1} marginLeft={1} flexDirection="column">
          <Box>
            <Text dimColor>Total Insights: </Text>
            <Text>{insights.length}</Text>
          </Box>
          <Box>
            <Text dimColor>Pending Proposals: </Text>
            <Text color="yellow">
              {pendingProposals.filter((p) => p.status === 'pending').length}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Applied Proposals: </Text>
            <Text color="green">
              {pendingProposals.filter((p) => p.status === 'applied').length}
            </Text>
          </Box>
          <Box>
            <Text dimColor>Rejected Proposals: </Text>
            <Text color="red">
              {pendingProposals.filter((p) => p.status === 'rejected').length}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Help */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text dimColor>
          Commands: [ENTER] Approve | [ESC] Reject | [A] Close Panel | [Cmd+K] Chat
        </Text>
      </Box>
    </Box>
  );
}

export default AIAdvisor;
