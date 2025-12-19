/**
 * Property-Based Tests for StrategicMemory
 * 
 * Tests the StrategicMemory class using property-based testing with fast-check
 * to verify correctness properties across many generated inputs.
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StrategicMemory, PerformanceMetrics } from '../../src/ai/StrategicMemory';
import { Insight, OptimizationProposal } from '../../src/types';

describe('StrategicMemory Property Tests', () => {
  let tempDir: string;
  let dbPath: string;
  let memory: StrategicMemory;

  beforeEach(() => {
    // Create temporary directory for test database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategic-memory-test-'));
    dbPath = path.join(tempDir, 'test.db');
    memory = new StrategicMemory(dbPath);
  });

  afterEach(() => {
    // Clean up
    memory.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 3: Insight Storage Round Trip
   * Validates: Requirements 1.4
   * 
   * Property: For any valid insight stored via storeInsightFull(),
   * retrieving it via getInsight() should return the same data
   */
  test('Property 3: Insight Storage Round Trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        generateValidInsight(),
        async (insight: Insight) => {
          // Store the insight
          const id = await memory.storeInsightFull(insight);
          
          // Retrieve the insight
          const retrieved = await memory.getInsight(id);
          
          // Property: Retrieved insight should not be null
          expect(retrieved).not.toBeNull();
          
          if (retrieved) {
            // Property: Core fields should match exactly
            expect(retrieved.topic).toBe(insight.topic);
            expect(retrieved.text).toBe(insight.text);
            expect(retrieved.confidence).toBe(insight.confidence);
            
            // Property: Optional fields should match if provided
            if (insight.affectedSymbols) {
              expect(retrieved.affectedSymbols).toEqual(insight.affectedSymbols);
            }
            if (insight.affectedTraps) {
              expect(retrieved.affectedTraps).toEqual(insight.affectedTraps);
            }
            if (insight.regimeContext) {
              expect(retrieved.regimeContext).toBe(insight.regimeContext);
            }
            if (insight.metadata) {
              expect(retrieved.metadata).toEqual(insight.metadata);
            }
            
            // Property: ID should be assigned
            expect(retrieved.id).toBe(id);
            expect(typeof retrieved.id).toBe('number');
            
            // Property: Timestamp should be set (either provided or auto-generated)
            expect(typeof retrieved.timestamp).toBe('number');
            expect(retrieved.timestamp).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Recent Insights Ordering
   * Validates: Requirements 1.5
   * 
   * Property: getRecentInsights() should always return insights
   * ordered by timestamp in descending order (newest first)
   */
  test('Property 4: Recent Insights Ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(generateValidInsight(), { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 1, max: 50 }),
        async (insights: Insight[], limit: number) => {
          // Store all insights with different timestamps to ensure ordering
          const storedIds: number[] = [];
          for (let i = 0; i < insights.length; i++) {
            const insight = { ...insights[i], timestamp: Date.now() + i * 1000 };
            const id = await memory.storeInsightFull(insight);
            storedIds.push(id);
          }
          
          // Retrieve recent insights
          const recent = await memory.getRecentInsights(limit);
          
          // Property: Should not exceed the requested limit
          expect(recent.length).toBeLessThanOrEqual(limit);
          
          // Property: Should not exceed the total number of insights in the database
          const totalCount = await memory.getInsightCount();
          expect(recent.length).toBeLessThanOrEqual(totalCount);
          
          // Property: Should be ordered by timestamp descending (newest first)
          for (let i = 1; i < recent.length; i++) {
            expect(recent[i - 1].timestamp!).toBeGreaterThanOrEqual(recent[i].timestamp!);
          }
          
          // Property: All returned insights should have valid IDs and timestamps
          for (const insight of recent) {
            expect(typeof insight.id).toBe('number');
            expect(typeof insight.timestamp).toBe('number');
            expect(insight.timestamp!).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 11: Config Version Tagging
   * Validates: Requirements 4.6
   * 
   * Property: For any valid proposal and config, tagConfigVersion()
   * should link them correctly and update proposal status to 'applied'
   */
  test('Property 11: Config Version Tagging', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(
        generateValidProposal(),
        generateValidConfigJson(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (proposal: OptimizationProposal, configJson: string, baseVersionTag: string) => {
          // Make version tag unique for each test run
          const versionTag = `${baseVersionTag}_${testCounter++}_${Date.now()}`;
          
          // Store the proposal first
          const proposalId = await memory.storeProposal(proposal);
          
          // Tag the config version
          await memory.tagConfigVersion(versionTag, configJson, proposalId);
          
          // Retrieve the config version
          const configVersion = await memory.getConfigVersion(versionTag);
          
          // Property: Config version should be stored correctly
          expect(configVersion).not.toBeNull();
          
          if (configVersion) {
            expect(configVersion.versionTag).toBe(versionTag);
            expect(configVersion.configJson).toBe(configJson);
            expect(configVersion.proposalId).toBe(proposalId);
            expect(typeof configVersion.appliedAt).toBe('number');
            expect(configVersion.appliedAt).toBeGreaterThan(0);
          }
          
          // Property: Proposal status should be updated to 'applied'
          const updatedProposal = await memory.getProposal(proposalId);
          expect(updatedProposal).not.toBeNull();
          
          if (updatedProposal) {
            expect(updatedProposal.status).toBe('applied');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// Generator functions for property-based testing
function generateValidInsight(): fc.Arbitrary<Insight> {
  return fc.record({
    topic: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    text: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10),
    confidence: fc.float({ min: Math.fround(0), max: Math.fround(1) }).filter(n => !isNaN(n) && isFinite(n)),
    timestamp: fc.option(fc.integer({ min: 1600000000000, max: Date.now() + 86400000 })),
    affectedSymbols: fc.option(fc.array(
      fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'),
      { minLength: 1, maxLength: 5 }
    )),
    affectedTraps: fc.option(fc.array(
      fc.constantFrom('oi_wipeout', 'funding_spike', 'liquidity_sweep', 'volatility_spike'),
      { minLength: 1, maxLength: 4 }
    )),
    regimeContext: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
    metadata: fc.option(fc.record({
      sampleSize: fc.integer({ min: 1, max: 10000 }),
      timeRange: fc.record({
        start: fc.integer({ min: 1600000000000, max: Date.now() }),
        end: fc.integer({ min: 1600000000000, max: Date.now() + 86400000 })
      }),
      correlationStrength: fc.option(fc.float({ min: Math.fround(-1), max: Math.fround(1) }).filter(n => !isNaN(n) && isFinite(n) && n !== 0).map(n => n === -0 ? 0 : n))
    }))
  });
}

function generateValidProposal(): fc.Arbitrary<OptimizationProposal> {
  return fc.record({
    targetKey: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
    currentValue: fc.oneof(
      fc.float({ min: Math.fround(0), max: Math.fround(100) }),
      fc.integer({ min: 1, max: 100 }),
      fc.boolean(),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
    suggestedValue: fc.oneof(
      fc.float({ min: Math.fround(0), max: Math.fround(100) }),
      fc.integer({ min: 1, max: 100 }),
      fc.boolean(),
      fc.string({ minLength: 1, maxLength: 50 })
    ),
    reasoning: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10),
    expectedImpact: fc.record({
      pnlImprovement: fc.float({ min: Math.fround(-0.5), max: Math.fround(0.5) }).filter(n => !isNaN(n) && isFinite(n)),
      riskChange: fc.float({ min: Math.fround(-0.5), max: Math.fround(0.5) }).filter(n => !isNaN(n) && isFinite(n)),
      confidenceScore: fc.float({ min: Math.fround(0), max: Math.fround(1) }).filter(n => !isNaN(n) && isFinite(n))
    }),
    status: fc.option(fc.constantFrom('pending', 'approved', 'rejected', 'applied'))
  });
}

function generateValidConfigJson(): fc.Arbitrary<string> {
  return fc.record({
    traps: fc.record({
      oi_wipeout: fc.record({
        enabled: fc.boolean(),
        stop_loss: fc.float({ min: Math.fround(0.01), max: Math.fround(0.1) }),
        take_profit: fc.float({ min: Math.fround(0.01), max: Math.fround(0.2) }),
        risk_per_trade: fc.float({ min: Math.fround(0.005), max: Math.fround(0.05) }),
        max_leverage: fc.integer({ min: 1, max: 20 }),
        min_confidence: fc.float({ min: Math.fround(0.5), max: Math.fround(0.95) }),
        cooldown_period: fc.integer({ min: 300, max: 3600 })
      })
    }),
    risk: fc.record({
      max_daily_loss: fc.float({ min: Math.fround(0.01), max: Math.fround(0.1) }),
      max_position_size: fc.float({ min: Math.fround(0.1), max: Math.fround(1.0) }),
      max_open_positions: fc.integer({ min: 1, max: 10 }),
      emergency_flatten_threshold: fc.float({ min: Math.fround(0.05), max: Math.fround(0.2) })
    }),
    execution: fc.record({
      latency_penalty: fc.integer({ min: 50, max: 500 }),
      slippage_model: fc.constantFrom('conservative', 'realistic', 'optimistic'),
      limit_chaser_enabled: fc.boolean(),
      max_fill_time: fc.integer({ min: 1000, max: 10000 })
    })
  }).map(config => JSON.stringify(config, null, 2));
}