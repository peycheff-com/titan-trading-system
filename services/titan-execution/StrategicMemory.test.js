/**
 * Strategic Memory Tests
 * 
 * Tests for insight storage, context retrieval, duplicate detection,
 * performance tracking, and archival functionality.
 * 
 * Requirements: System Integration 44.1-44.7
 */

import { jest, describe, test, expect, beforeEach } from '@jest/globals';
import StrategicMemory from './StrategicMemory.js';

// Mock database manager
function createMockDatabaseManager() {
  const data = {
    strategic_insights: [],
    strategic_insights_archive: [],
    system_events: [],
    trade_history: []
  };
  
  let idCounter = 1;
  
  return {
    data,
    
    async run(sql, params = []) {
      // Handle INSERT
      if (sql.includes('INSERT INTO strategic_insights_archive')) {
        // Archive operation - copy matching records
        const cutoff = params[0];
        const toArchive = data.strategic_insights.filter(r => r.created_at < cutoff);
        toArchive.forEach(r => {
          data.strategic_insights_archive.push({
            ...r,
            archived_at: new Date().toISOString()
          });
        });
        return { changes: toArchive.length };
      }
      
      if (sql.includes('INSERT INTO strategic_insights')) {
        const record = {
          id: idCounter++,
          insight_type: params[0],
          topic: params[1],
          insight_text: params[2],
          confidence_score: params[3],
          old_config: params[4],
          new_config: params[5],
          projected_pnl_improvement: params[6],
          risk_impact: params[7],
          content_hash: params[8],
          expires_at: params[9],
          created_at: new Date().toISOString(),
          reviewed: 0,
          applied_to_config: 0
        };
        data.strategic_insights.push(record);
        return { lastID: record.id };
      }
      
      if (sql.includes('INSERT INTO system_events')) {
        const record = {
          id: idCounter++,
          event_type: params[0],
          severity: params[1],
          service: params[2],
          message: params[3],
          context: params[4],
          created_at: new Date().toISOString()
        };
        data.system_events.push(record);
        return { lastID: record.id };
      }
      
      // Handle DELETE
      if (sql.includes('DELETE FROM strategic_insights')) {
        const cutoff = params[0];
        const before = data.strategic_insights.length;
        data.strategic_insights = data.strategic_insights.filter(r => r.created_at >= cutoff);
        return { changes: before - data.strategic_insights.length };
      }
      
      // Handle UPDATE
      if (sql.includes('UPDATE strategic_insights')) {
        const id = params[params.length - 1];
        const record = data.strategic_insights.find(r => r.id === id);
        if (record) {
          if (sql.includes('approved =') && sql.includes('rejection_reason')) {
            // reviewProposal: params = [approved (0 or 1), rejection_reason, id]
            record.reviewed = 1;
            record.reviewed_at = new Date().toISOString();
            record.approved = params[0];
            record.rejection_reason = params[1];
          } else if (sql.includes('applied_to_config')) {
            record.applied_to_config = 1;
            record.applied_at = new Date().toISOString();
          } else if (sql.includes('performance_delta')) {
            record.performance_delta = params[0];
            record.performance_measured_at = new Date().toISOString();
          } else if (sql.includes('reviewed =')) {
            // markBriefingRead: just reviewed
            record.reviewed = 1;
            record.reviewed_at = new Date().toISOString();
          }
        }
        return { changes: record ? 1 : 0 };
      }
      
      return { changes: 0 };
    },
    
    async get(sql, params = []) {
      // Statistics - check for the specific aggregation query (must be before COUNT(*))
      if (sql.includes('total_insights') && sql.includes('total_proposals')) {
        const insights = data.strategic_insights;
        return {
          total_insights: insights.length,
          total_proposals: insights.filter(r => r.insight_type === 'proposal').length,
          applied_proposals: insights.filter(r => r.applied_to_config === 1).length,
          approved_proposals: insights.filter(r => r.approved === 1).length,
          rejected_proposals: insights.filter(r => r.approved === 0 && r.reviewed === 1).length,
          avg_performance_delta: null
        };
      }
      
      // Count query (simple count)
      if (sql.includes('COUNT(*)') && !sql.includes('total_proposals')) {
        if (sql.includes('strategic_insights')) {
          return { count: data.strategic_insights.length };
        }
      }
      
      // Duplicate check
      if (sql.includes('content_hash')) {
        const hash = params[0];
        const cutoff = params[1];
        const found = data.strategic_insights.find(r => 
          r.content_hash === hash && r.created_at >= cutoff
        );
        return found || null;
      }
      
      // Get by ID
      if (sql.includes('WHERE id = ?')) {
        const id = params[0];
        return data.strategic_insights.find(r => r.id === id) || null;
      }
      
      // Unread briefing
      if (sql.includes('insight_type = \'briefing\'')) {
        return data.strategic_insights.find(r => 
          r.insight_type === 'briefing' && r.reviewed === 0
        ) || null;
      }
      
      // Trade history stats
      if (sql.includes('SUM(realized_pnl)')) {
        return {
          total_pnl: 100,
          trade_count: 5,
          win_rate: 0.6
        };
      }
      
      return null;
    },
    
    async all(sql, params = []) {
      // Recent context
      if (sql.includes('ORDER BY created_at DESC')) {
        const limit = params[0] || 10;
        return data.strategic_insights
          .filter(r => ['observation', 'pattern', 'proposal'].includes(r.insight_type))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, limit);
      }
      
      // Pending proposals
      if (sql.includes('insight_type = \'proposal\'') && sql.includes('reviewed = 0')) {
        return data.strategic_insights
          .filter(r => r.insight_type === 'proposal' && r.reviewed === 0)
          .sort((a, b) => b.confidence_score - a.confidence_score);
      }
      
      return [];
    }
  };
}

describe('StrategicMemory', () => {
  let strategicMemory;
  let mockDb;
  
  beforeEach(() => {
    strategicMemory = new StrategicMemory({
      maxRecords: 100,
      archiveAfterDays: 90,
      duplicateWindowDays: 30,
      performanceTrackingDays: 7,
      contextLimit: 10
    });
    
    mockDb = createMockDatabaseManager();
    strategicMemory.initialize({ databaseManager: mockDb });
  });
  
  describe('Insight Storage', () => {
    test('should store a new insight', async () => {
      const insight = {
        type: 'observation',
        topic: 'Market volatility increase',
        text: 'Observed 50% increase in ATR over past 24 hours',
        confidence: 0.8
      };
      
      const result = await strategicMemory.storeInsight(insight);
      
      expect(result.stored).toBe(true);
      expect(result.id).toBeDefined();
      expect(mockDb.data.strategic_insights.length).toBe(1);
      expect(mockDb.data.strategic_insights[0].topic).toBe('Market volatility increase');
    });
    
    test('should store a proposal with config changes', async () => {
      const insight = {
        type: 'proposal',
        topic: 'Reduce leverage in high volatility',
        text: 'Recommend reducing max leverage from 20x to 15x',
        confidence: 0.75,
        oldConfig: { maxLeverage: 20 },
        newConfig: { maxLeverage: 15 },
        projectedImprovement: 5.2,
        riskImpact: 'Reduced drawdown by 3%'
      };
      
      const result = await strategicMemory.storeInsight(insight);
      
      expect(result.stored).toBe(true);
      const stored = mockDb.data.strategic_insights[0];
      expect(stored.insight_type).toBe('proposal');
      expect(stored.old_config).toBe(JSON.stringify({ maxLeverage: 20 }));
      expect(stored.new_config).toBe(JSON.stringify({ maxLeverage: 15 }));
    });
    
    test('should reject duplicate insights', async () => {
      const insight = {
        type: 'proposal',
        topic: 'Reduce leverage',
        newConfig: { maxLeverage: 15 }
      };
      
      // Store first time
      await strategicMemory.storeInsight(insight);
      
      // Try to store again
      const result = await strategicMemory.storeInsight(insight);
      
      expect(result.stored).toBe(false);
      expect(result.reason).toBe('duplicate');
      expect(mockDb.data.strategic_insights.length).toBe(1);
    });
    
    test('should throw error if database not available', async () => {
      const noDbMemory = new StrategicMemory();
      
      await expect(noDbMemory.storeInsight({ topic: 'test' }))
        .rejects.toThrow('Database not available');
    });
  });
  
  describe('Context Retrieval', () => {
    test('should retrieve recent insights for context', async () => {
      // Store multiple insights
      await strategicMemory.storeInsight({ type: 'observation', topic: 'Insight 1', text: 'Text 1', confidence: 0.5 });
      await strategicMemory.storeInsight({ type: 'pattern', topic: 'Insight 2', text: 'Text 2', confidence: 0.6 });
      await strategicMemory.storeInsight({ type: 'proposal', topic: 'Insight 3', text: 'Text 3', confidence: 0.7, newConfig: {} });
      
      const context = await strategicMemory.getRecentContext(10);
      
      expect(context.length).toBe(3);
      expect(context[0]).toHaveProperty('id');
      expect(context[0]).toHaveProperty('type');
      expect(context[0]).toHaveProperty('topic');
      expect(context[0]).toHaveProperty('text');
      expect(context[0]).toHaveProperty('confidence');
    });
    
    test('should respect context limit', async () => {
      // Store more insights than limit
      for (let i = 0; i < 15; i++) {
        // Clear duplicate detection by using unique topics
        await strategicMemory.storeInsight({ 
          type: 'observation', 
          topic: `Insight ${i}`, 
          text: `Text ${i}`,
          confidence: 0.5,
          newConfig: { value: i }
        });
      }
      
      const context = await strategicMemory.getRecentContext(5);
      
      expect(context.length).toBeLessThanOrEqual(5);
    });
    
    test('should return empty array if no database', async () => {
      const noDbMemory = new StrategicMemory();
      const context = await noDbMemory.getRecentContext();
      expect(context).toEqual([]);
    });
  });
  
  describe('Duplicate Detection', () => {
    test('should detect duplicate by content hash', async () => {
      const insight = {
        type: 'proposal',
        topic: 'Same proposal',
        newConfig: { leverage: 10 }
      };
      
      await strategicMemory.storeInsight(insight);
      
      // Check duplicate
      const hash = strategicMemory.hashContent(insight);
      const isDuplicate = await strategicMemory.checkDuplicate(hash);
      
      expect(isDuplicate).toBe(true);
    });
    
    test('should not detect duplicate for different content', async () => {
      const insight1 = {
        type: 'proposal',
        topic: 'Proposal 1',
        newConfig: { leverage: 10 }
      };
      
      const insight2 = {
        type: 'proposal',
        topic: 'Proposal 2',
        newConfig: { leverage: 15 }
      };
      
      await strategicMemory.storeInsight(insight1);
      
      const hash2 = strategicMemory.hashContent(insight2);
      const isDuplicate = await strategicMemory.checkDuplicate(hash2);
      
      expect(isDuplicate).toBe(false);
    });
    
    test('should generate consistent content hash', () => {
      const insight = {
        topic: 'Test topic',
        newConfig: { value: 123 }
      };
      
      const hash1 = strategicMemory.hashContent(insight);
      const hash2 = strategicMemory.hashContent(insight);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
    });
  });
  
  describe('Performance Tracking', () => {
    test('should mark proposal as applied', async () => {
      // Store a proposal
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test proposal',
        text: 'Description',
        confidence: 0.8,
        newConfig: { test: true }
      });
      
      // Mark as applied
      await strategicMemory.markAsApplied(result.id);
      
      const record = mockDb.data.strategic_insights[0];
      expect(record.applied_to_config).toBe(1);
      expect(record.applied_at).toBeDefined();
    });
    
    test('should track performance after application', async () => {
      // Store and apply a proposal
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test proposal',
        text: 'Description',
        confidence: 0.8,
        newConfig: { test: true }
      });
      
      await strategicMemory.markAsApplied(result.id);
      
      // Manually trigger performance tracking (normally scheduled)
      await strategicMemory.trackPerformance(result.id);
      
      const record = mockDb.data.strategic_insights[0];
      expect(record.performance_delta).toBeDefined();
      expect(record.performance_measured_at).toBeDefined();
    });
    
    test('should emit performanceTracked event', async () => {
      const eventPromise = new Promise(resolve => {
        strategicMemory.on('performanceTracked', resolve);
      });
      
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test',
        text: 'Desc',
        confidence: 0.5,
        newConfig: {}
      });
      
      await strategicMemory.markAsApplied(result.id);
      await strategicMemory.trackPerformance(result.id);
      
      const event = await eventPromise;
      expect(event.proposalId).toBe(result.id);
      expect(event.performanceDelta).toBeDefined();
    });
  });
  
  describe('Archival', () => {
    test('should archive old records when threshold exceeded', async () => {
      // Create memory with low threshold
      const archiveMemory = new StrategicMemory({
        maxRecords: 5,
        archiveAfterDays: 0 // Archive immediately for testing
      });
      
      const archiveDb = createMockDatabaseManager();
      archiveMemory.initialize({ databaseManager: archiveDb });
      
      // Add records with old dates
      for (let i = 0; i < 10; i++) {
        const oldDate = new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString();
        archiveDb.data.strategic_insights.push({
          id: i + 1,
          insight_type: 'observation',
          topic: `Old insight ${i}`,
          insight_text: 'Text',
          confidence_score: 0.5,
          created_at: oldDate,
          reviewed: 0
        });
      }
      
      // Trigger archival check
      await archiveMemory.checkArchivalNeeded();
      
      // Should have archived some records
      expect(archiveDb.data.strategic_insights_archive.length).toBeGreaterThan(0);
    });
    
    test('should not archive if below threshold', async () => {
      // Add only a few records
      await strategicMemory.storeInsight({ type: 'observation', topic: 'Test 1', text: 'Text', confidence: 0.5 });
      await strategicMemory.storeInsight({ type: 'observation', topic: 'Test 2', text: 'Text', confidence: 0.5, newConfig: {} });
      
      await strategicMemory.checkArchivalNeeded();
      
      // Should not have archived anything
      expect(mockDb.data.strategic_insights_archive.length).toBe(0);
    });
    
    test('should emit recordsArchived event', async () => {
      const archiveMemory = new StrategicMemory({
        maxRecords: 2,
        archiveAfterDays: 0
      });
      
      const archiveDb = createMockDatabaseManager();
      archiveMemory.initialize({ databaseManager: archiveDb });
      
      // Add old records
      for (let i = 0; i < 5; i++) {
        archiveDb.data.strategic_insights.push({
          id: i + 1,
          insight_type: 'observation',
          topic: `Insight ${i}`,
          insight_text: 'Text',
          confidence_score: 0.5,
          created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
          reviewed: 0
        });
      }
      
      const eventPromise = new Promise(resolve => {
        archiveMemory.on('recordsArchived', resolve);
      });
      
      await archiveMemory.archiveOldRecords();
      
      const event = await eventPromise;
      expect(event.count).toBeGreaterThan(0);
    });
  });
  
  describe('Proposal Management', () => {
    test('should get pending proposals', async () => {
      await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Proposal 1',
        text: 'Description 1',
        confidence: 0.8,
        newConfig: { a: 1 }
      });
      
      await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Proposal 2',
        text: 'Description 2',
        confidence: 0.9,
        newConfig: { b: 2 }
      });
      
      const pending = await strategicMemory.getPendingProposals();
      
      expect(pending.length).toBe(2);
      // Should be sorted by confidence (highest first)
      expect(pending[0].confidence).toBeGreaterThanOrEqual(pending[1].confidence);
    });
    
    test('should review and approve proposal', async () => {
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test proposal',
        text: 'Description',
        confidence: 0.8,
        newConfig: { test: true }
      });
      
      await strategicMemory.reviewProposal(result.id, true);
      
      const record = mockDb.data.strategic_insights[0];
      expect(record.reviewed).toBe(1);
      expect(record.approved).toBe(1);
    });
    
    test('should review and reject proposal with reason', async () => {
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test proposal',
        text: 'Description',
        confidence: 0.8,
        newConfig: { test: true }
      });
      
      await strategicMemory.reviewProposal(result.id, false, 'Too risky');
      
      const record = mockDb.data.strategic_insights[0];
      expect(record.reviewed).toBe(1);
      expect(record.approved).toBe(0);
      expect(record.rejection_reason).toBe('Too risky');
    });
  });
  
  describe('Morning Briefing', () => {
    test('should get unread briefing', async () => {
      // Add a briefing
      mockDb.data.strategic_insights.push({
        id: 1,
        insight_type: 'briefing',
        topic: 'Morning Briefing',
        insight_text: JSON.stringify({ summary: 'Test briefing content' }),
        confidence_score: 1.0,
        created_at: new Date().toISOString(),
        reviewed: 0
      });
      
      const briefing = await strategicMemory.getUnreadBriefing();
      
      expect(briefing).not.toBeNull();
      expect(briefing.topic).toBe('Morning Briefing');
      expect(briefing.content.summary).toBe('Test briefing content');
    });
    
    test('should return null if no unread briefing', async () => {
      const briefing = await strategicMemory.getUnreadBriefing();
      expect(briefing).toBeNull();
    });
    
    test('should mark briefing as read', async () => {
      mockDb.data.strategic_insights.push({
        id: 1,
        insight_type: 'briefing',
        topic: 'Morning Briefing',
        insight_text: JSON.stringify({ summary: 'Content' }),
        confidence_score: 1.0,
        created_at: new Date().toISOString(),
        reviewed: 0
      });
      
      await strategicMemory.markBriefingRead(1);
      
      const record = mockDb.data.strategic_insights[0];
      expect(record.reviewed).toBe(1);
    });
  });
  
  describe('Statistics', () => {
    test('should return insight statistics', async () => {
      // Add various insights
      await strategicMemory.storeInsight({ type: 'observation', topic: 'Obs 1', text: 'Text', confidence: 0.5 });
      await strategicMemory.storeInsight({ type: 'proposal', topic: 'Prop 1', text: 'Text', confidence: 0.7, newConfig: { a: 1 } });
      await strategicMemory.storeInsight({ type: 'proposal', topic: 'Prop 2', text: 'Text', confidence: 0.8, newConfig: { b: 2 } });
      
      const stats = await strategicMemory.getStatistics();
      
      expect(stats.totalInsights).toBe(3);
      expect(stats.totalProposals).toBe(2);
      expect(stats).toHaveProperty('appliedProposals');
      expect(stats).toHaveProperty('approvedProposals');
      expect(stats).toHaveProperty('rejectedProposals');
      expect(stats).toHaveProperty('approvalRate');
    });
  });
  
  describe('Event Emission', () => {
    test('should emit insightStored event', async () => {
      const eventPromise = new Promise(resolve => {
        strategicMemory.on('insightStored', resolve);
      });
      
      await strategicMemory.storeInsight({
        type: 'observation',
        topic: 'Test',
        text: 'Description',
        confidence: 0.5
      });
      
      const event = await eventPromise;
      expect(event.id).toBeDefined();
      expect(event.insight.topic).toBe('Test');
    });
    
    test('should emit proposalReviewed event', async () => {
      const result = await strategicMemory.storeInsight({
        type: 'proposal',
        topic: 'Test',
        text: 'Desc',
        confidence: 0.5,
        newConfig: {}
      });
      
      const eventPromise = new Promise(resolve => {
        strategicMemory.on('proposalReviewed', resolve);
      });
      
      await strategicMemory.reviewProposal(result.id, true);
      
      const event = await eventPromise;
      expect(event.proposalId).toBe(result.id);
      expect(event.approved).toBe(true);
    });
  });
});
