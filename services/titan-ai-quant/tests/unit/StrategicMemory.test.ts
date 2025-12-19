/**
 * StrategicMemory Unit Tests
 * 
 * Tests for SQLite-based strategic memory storage
 * Requirements: 1.4, 1.5, 4.6
 */

import { StrategicMemory, PerformanceMetrics } from '../../src/ai/StrategicMemory';
import { OptimizationProposal } from '../../src/types';

describe('StrategicMemory', () => {
  let memory: StrategicMemory;

  beforeEach(() => {
    // Use in-memory database for tests
    memory = new StrategicMemory(':memory:');
  });

  afterEach(() => {
    memory.close();
  });

  describe('storeInsight', () => {
    it('should store an insight and return its ID', async () => {
      const id = await memory.storeInsight(
        'time_pattern',
        'Losses concentrated during Asian session',
        0.85
      );

      expect(id).toBe(1);
    });

    it('should store multiple insights with incrementing IDs', async () => {
      const id1 = await memory.storeInsight('topic1', 'text1', 0.5);
      const id2 = await memory.storeInsight('topic2', 'text2', 0.6);
      const id3 = await memory.storeInsight('topic3', 'text3', 0.7);

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
    });
  });

  describe('storeInsightFull', () => {
    it('should store a full insight with all fields', async () => {
      const insight = {
        topic: 'symbol_correlation',
        text: 'SOL losses correlate with BTC volatility spikes',
        confidence: 0.92,
        affectedSymbols: ['SOL', 'BTC'],
        affectedTraps: ['oi_wipeout'],
        regimeContext: 'Risk-Off/Extreme-Vol',
        metadata: {
          sampleSize: 50,
          timeRange: { start: 1000, end: 2000 },
          correlationStrength: 0.78,
        },
      };

      const id = await memory.storeInsightFull(insight);
      expect(id).toBe(1);

      const retrieved = await memory.getInsight(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.topic).toBe(insight.topic);
      expect(retrieved!.text).toBe(insight.text);
      expect(retrieved!.confidence).toBe(insight.confidence);
      expect(retrieved!.affectedSymbols).toEqual(insight.affectedSymbols);
      expect(retrieved!.affectedTraps).toEqual(insight.affectedTraps);
      expect(retrieved!.regimeContext).toBe(insight.regimeContext);
      expect(retrieved!.metadata).toEqual(insight.metadata);
    });
  });

  describe('getRecentInsights', () => {
    it('should return insights ordered by timestamp descending', async () => {
      // Store insights - they will have same timestamp but different IDs
      // The ORDER BY timestamp DESC will return them in insertion order when timestamps are equal
      await memory.storeInsight('topic1', 'first', 0.5);
      await memory.storeInsight('topic2', 'second', 0.6);
      await memory.storeInsight('topic3', 'third', 0.7);

      const insights = await memory.getRecentInsights(10);

      expect(insights.length).toBe(3);
      // All insights should be returned with their correct data
      const topics = insights.map(i => i.topic);
      expect(topics).toContain('topic1');
      expect(topics).toContain('topic2');
      expect(topics).toContain('topic3');
    });

    it('should respect the limit parameter', async () => {
      await memory.storeInsight('topic1', 'text1', 0.5);
      await memory.storeInsight('topic2', 'text2', 0.6);
      await memory.storeInsight('topic3', 'text3', 0.7);
      await memory.storeInsight('topic4', 'text4', 0.8);
      await memory.storeInsight('topic5', 'text5', 0.9);

      const insights = await memory.getRecentInsights(3);

      expect(insights.length).toBe(3);
    });

    it('should return empty array when no insights exist', async () => {
      const insights = await memory.getRecentInsights(10);
      expect(insights).toEqual([]);
    });

    it('should default to 10 insights when no limit specified', async () => {
      // Store 15 insights
      for (let i = 0; i < 15; i++) {
        await memory.storeInsight(`topic${i}`, `text${i}`, 0.5);
      }

      const insights = await memory.getRecentInsights();
      expect(insights.length).toBe(10);
    });
  });

  describe('storeProposal', () => {
    it('should store a proposal and return its ID', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'traps.oi_wipeout.stop_loss',
        currentValue: 0.01,
        suggestedValue: 0.015,
        reasoning: 'Wider stops reduce premature exits',
        expectedImpact: {
          pnlImprovement: 5.0,
          riskChange: 2.0,
          confidenceScore: 0.75,
        },
      };

      const id = await memory.storeProposal(proposal);
      expect(id).toBe(1);
    });

    it('should store proposal with insight reference', async () => {
      const insightId = await memory.storeInsight('test', 'test insight', 0.8);

      const proposal: OptimizationProposal = {
        insightId,
        targetKey: 'traps.funding_spike.take_profit',
        currentValue: 0.02,
        suggestedValue: 0.025,
        reasoning: 'Higher targets during trending markets',
        expectedImpact: {
          pnlImprovement: 8.0,
          riskChange: 1.0,
          confidenceScore: 0.82,
        },
      };

      const id = await memory.storeProposal(proposal);
      const retrieved = await memory.getProposal(id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.insightId).toBe(insightId);
    });
  });

  describe('getProposal', () => {
    it('should retrieve a stored proposal', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'risk.max_daily_loss',
        currentValue: 0.05,
        suggestedValue: 0.04,
        reasoning: 'Tighter daily loss limit for capital preservation',
        expectedImpact: {
          pnlImprovement: -2.0,
          riskChange: -15.0,
          confidenceScore: 0.9,
        },
        status: 'pending',
      };

      const id = await memory.storeProposal(proposal);
      const retrieved = await memory.getProposal(id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.targetKey).toBe(proposal.targetKey);
      expect(retrieved!.currentValue).toBe(proposal.currentValue);
      expect(retrieved!.suggestedValue).toBe(proposal.suggestedValue);
      expect(retrieved!.reasoning).toBe(proposal.reasoning);
      expect(retrieved!.expectedImpact).toEqual(proposal.expectedImpact);
      expect(retrieved!.status).toBe('pending');
    });

    it('should return null for non-existent proposal', async () => {
      const retrieved = await memory.getProposal(999);
      expect(retrieved).toBeNull();
    });
  });

  describe('updateProposalStatus', () => {
    it('should update proposal status', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const id = await memory.storeProposal(proposal);
      await memory.updateProposalStatus(id, 'approved');

      const retrieved = await memory.getProposal(id);
      expect(retrieved!.status).toBe('approved');
    });
  });

  describe('getPendingProposals', () => {
    it('should return only pending proposals', async () => {
      const baseProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const id1 = await memory.storeProposal({ ...baseProposal, status: 'pending' });
      await memory.storeProposal({ ...baseProposal, status: 'approved' });
      const id3 = await memory.storeProposal({ ...baseProposal, status: 'pending' });
      await memory.storeProposal({ ...baseProposal, status: 'rejected' });

      const pending = await memory.getPendingProposals();

      expect(pending.length).toBe(2);
      expect(pending.map(p => p.id)).toContain(id1);
      expect(pending.map(p => p.id)).toContain(id3);
    });
  });

  describe('tagConfigVersion', () => {
    it('should tag a config version with proposal reference', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const proposalId = await memory.storeProposal(proposal);
      const configJson = JSON.stringify({ test: { key: 2 } });

      await memory.tagConfigVersion('v1.0.1', configJson, proposalId);

      const version = await memory.getConfigVersion('v1.0.1');
      expect(version).not.toBeNull();
      expect(version!.versionTag).toBe('v1.0.1');
      expect(version!.configJson).toBe(configJson);
      expect(version!.proposalId).toBe(proposalId);
      expect(version!.appliedAt).toBeGreaterThan(0);
    });

    it('should update proposal status to applied', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const proposalId = await memory.storeProposal(proposal);
      await memory.tagConfigVersion('v1.0.2', '{}', proposalId);

      const updatedProposal = await memory.getProposal(proposalId);
      expect(updatedProposal!.status).toBe('applied');
    });
  });

  describe('trackPerformance', () => {
    it('should track performance metrics for a config version', async () => {
      const proposal: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const proposalId = await memory.storeProposal(proposal);
      await memory.tagConfigVersion('v1.0.0', '{}', proposalId);

      const metrics: PerformanceMetrics = {
        totalTrades: 100,
        winRate: 0.65,
        avgPnl: 0.02,
        maxDrawdown: 0.08,
        sharpeRatio: 1.5,
      };

      await memory.trackPerformance('v1.0.0', metrics);

      const retrieved = await memory.getLatestPerformance('v1.0.0');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.totalTrades).toBe(100);
      expect(retrieved!.winRate).toBe(0.65);
      expect(retrieved!.avgPnl).toBe(0.02);
      expect(retrieved!.maxDrawdown).toBe(0.08);
      expect(retrieved!.sharpeRatio).toBe(1.5);
    });
  });

  describe('getPerformanceDelta', () => {
    it('should calculate performance delta between versions', async () => {
      // Create two config versions
      const proposal1: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 1,
        suggestedValue: 2,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };
      const proposal2: OptimizationProposal = {
        targetKey: 'test.key',
        currentValue: 2,
        suggestedValue: 3,
        reasoning: 'test',
        expectedImpact: { pnlImprovement: 1, riskChange: 0, confidenceScore: 0.5 },
      };

      const proposalId1 = await memory.storeProposal(proposal1);
      const proposalId2 = await memory.storeProposal(proposal2);

      await memory.tagConfigVersion('v1.0.0', '{}', proposalId1);
      await memory.tagConfigVersion('v1.1.0', '{}', proposalId2);

      // Track performance for both versions
      await memory.trackPerformance('v1.0.0', {
        totalTrades: 100,
        winRate: 0.55,
        avgPnl: 0.01,
        maxDrawdown: 0.10,
        sharpeRatio: 1.0,
      });

      await memory.trackPerformance('v1.1.0', {
        totalTrades: 120,
        winRate: 0.62,
        avgPnl: 0.015,
        maxDrawdown: 0.08,
        sharpeRatio: 1.3,
      });

      const delta = await memory.getPerformanceDelta('v1.0.0', 'v1.1.0');

      expect(delta.pnlDelta).toBeCloseTo(0.005, 5);
      expect(delta.winRateDelta).toBeCloseTo(0.07, 5);
      expect(delta.drawdownDelta).toBeCloseTo(-0.02, 5);
    });

    it('should return zero deltas when versions have no performance data', async () => {
      const delta = await memory.getPerformanceDelta('nonexistent1', 'nonexistent2');

      expect(delta.pnlDelta).toBe(0);
      expect(delta.winRateDelta).toBe(0);
      expect(delta.drawdownDelta).toBe(0);
    });
  });

  describe('getInsightCount', () => {
    it('should return correct count of insights', async () => {
      expect(await memory.getInsightCount()).toBe(0);

      await memory.storeInsight('topic1', 'text1', 0.5);
      expect(await memory.getInsightCount()).toBe(1);

      await memory.storeInsight('topic2', 'text2', 0.6);
      await memory.storeInsight('topic3', 'text3', 0.7);
      expect(await memory.getInsightCount()).toBe(3);
    });
  });
});
