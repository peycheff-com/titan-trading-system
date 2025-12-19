/**
 * Property-Based Tests for Journal
 * 
 * Tests the Journal class using property-based testing with fast-check
 * to verify correctness properties across many generated inputs.
 */

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Journal } from '../../src/ai/Journal';
import { Trade, RegimeSnapshot } from '../../src/types';

describe('Journal Property Tests', () => {
  let tempDir: string;
  let journal: Journal;
  let tradesFile: string;
  let regimeFile: string;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
    tradesFile = path.join(tempDir, 'trades.jsonl');
    regimeFile = path.join(tempDir, 'regime_snapshots.jsonl');
    journal = new Journal(tradesFile, regimeFile);
  });

  afterEach(() => {
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /**
   * Property 1: Trade Log Parsing Completeness
   * Validates: Requirements 1.1
   * 
   * Property: For any valid JSONL file with N trade records,
   * ingestTrades() should return exactly N valid Trade objects
   */
  test('Property 1: Trade Log Parsing Completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(generateValidTrade(), { minLength: 0, maxLength: 100 }),
        async (trades: Trade[]) => {
          // Write trades to JSONL file
          const jsonlContent = trades.map(trade => JSON.stringify(trade)).join('\n');
          fs.writeFileSync(tradesFile, jsonlContent);

          // Ingest trades
          const result = await journal.ingestTrades();

          // Property: Should return exactly the same number of trades
          expect(result).toHaveLength(trades.length);
          
          // Property: All returned objects should be valid trades
          for (const trade of result) {
            expect(typeof trade.timestamp).toBe('number');
            expect(typeof trade.symbol).toBe('string');
            expect(typeof trade.trapType).toBe('string');
            expect(typeof trade.pnl).toBe('number');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
  /**
   * Property 2: Narrative Field Inclusion
   * Validates: Requirements 1.2
   * 
   * Property: For any valid trade and regime snapshot,
   * summarizeTrade() should include all required fields in the narrative
   */
  test('Property 2: Narrative Field Inclusion', () => {
    fc.assert(
      fc.property(
        generateValidTrade(),
        generateValidRegimeSnapshot(),
        (trade: Trade, regime: RegimeSnapshot) => {
          const narrative = journal.summarizeTrade(trade, regime);
          
          // Property: Narrative must contain all required fields
          expect(narrative).toContain(`Symbol: ${trade.symbol}`);
          expect(narrative).toContain(`Type: ${trade.trapType.toUpperCase()}`);
          expect(narrative).toContain('Result:');
          expect(narrative).toContain('Duration:');
          expect(narrative).toContain('Slippage:');
          expect(narrative).toContain('Regime:');
          
          // Property: Narrative should be reasonably short (token-efficient)
          expect(narrative.length).toBeLessThan(200);
          
          // Property: Should handle negative PnL correctly
          if (trade.pnlPercent < 0) {
            expect(narrative).toMatch(/Result: -\d+\.\d+%/);
          } else {
            expect(narrative).toMatch(/Result: \+?\d+\.\d+%/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Trade-Regime Correlation
   * Validates: Requirements 1.6
   * 
   * Property: For any trade with timestamp T, getRegimeContext()
   * should return the regime snapshot with the largest timestamp <= T
   */
  test('Property 5: Trade-Regime Correlation', () => {
    fc.assert(
      fc.property(
        fc.array(generateValidRegimeSnapshot(), { minLength: 1, maxLength: 50 }),
        generateValidTrade(),
        (regimes: RegimeSnapshot[], trade: Trade) => {
          // Set up regime snapshots in journal
          journal.setRegimeSnapshots(regimes);
          
          const result = journal.getRegimeContext(trade);
          
          if (result !== null) {
            // Property: Returned regime timestamp should be <= trade timestamp
            expect(result.timestamp).toBeLessThanOrEqual(trade.timestamp);
            
            // Property: No other regime should have a larger timestamp <= trade timestamp
            const laterRegimes = regimes.filter(r => 
              r.timestamp > result.timestamp && r.timestamp <= trade.timestamp
            );
            expect(laterRegimes).toHaveLength(0);
          } else {
            // Property: If null, no regime should have timestamp <= trade timestamp
            const validRegimes = regimes.filter(r => r.timestamp <= trade.timestamp);
            expect(validRegimes).toHaveLength(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  /**
   * Property 16: Token-Efficient Narratives
   * Validates: Requirements 7.5
   * 
   * Property: Narratives should be token-efficient (short but complete)
   */
  test('Property 16: Token-Efficient Narratives', () => {
    fc.assert(
      fc.property(
        generateValidTrade(),
        generateValidRegimeSnapshot(),
        (trade: Trade, regime: RegimeSnapshot) => {
          const narrative = journal.summarizeTrade(trade, regime);
          
          // Property: Should be concise (under 150 characters for efficiency)
          expect(narrative.length).toBeLessThan(150);
          
          // Property: Should not contain redundant words
          expect(narrative).not.toMatch(/\b(\w+)\s+\1\b/); // No repeated words
          
          // Property: Should use abbreviations where appropriate
          expect(narrative).toMatch(/\d+s/); // Duration in seconds
          expect(narrative).toMatch(/\d+\.\d+%/); // Percentages
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 15: Streaming Memory Efficiency
   * Validates: Requirements 7.4
   * 
   * Property: ingestTrades() should handle large files without excessive memory usage
   */
  test('Property 15: Streaming Memory Efficiency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        async (tradeCount: number) => {
          // Generate large number of trades
          const trades: Trade[] = [];
          for (let i = 0; i < tradeCount; i++) {
            trades.push(fc.sample(generateValidTrade(), 1)[0]);
          }
          
          // Write to file
          const jsonlContent = trades.map(trade => JSON.stringify(trade)).join('\n');
          fs.writeFileSync(tradesFile, jsonlContent);
          
          // Measure memory before
          const memBefore = process.memoryUsage().heapUsed;
          
          // Ingest trades with limit to test streaming
          const limit = Math.min(100, tradeCount);
          const result = await journal.ingestTrades(limit);
          
          // Measure memory after
          const memAfter = process.memoryUsage().heapUsed;
          const memDelta = memAfter - memBefore;
          
          // Property: Memory usage should be reasonable (not proportional to file size)
          // Allow up to 100KB per trade processed (very generous for Node.js overhead)
          const maxMemoryPerTrade = 100000; // 100KB per trade
          expect(memDelta).toBeLessThan(result.length * maxMemoryPerTrade);
          
          // Property: Should respect the limit
          expect(result.length).toBeLessThanOrEqual(limit);
        }
      ),
      { numRuns: 20 } // Fewer runs for memory tests
    );
  });
});

// Generator functions for property-based testing
function generateValidTrade(): fc.Arbitrary<Trade> {
  return fc.record({
    id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
    timestamp: fc.integer({ min: 1600000000000, max: Date.now() }),
    symbol: fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'),
    trapType: fc.constantFrom('oi_wipeout', 'funding_spike', 'liquidity_sweep', 'volatility_spike'),
    side: fc.constantFrom('long', 'short'),
    entryPrice: fc.float({ min: Math.fround(1), max: Math.fround(100000) }).filter(n => !isNaN(n) && isFinite(n)),
    exitPrice: fc.float({ min: Math.fround(1), max: Math.fround(100000) }).filter(n => !isNaN(n) && isFinite(n)),
    quantity: fc.float({ min: Math.fround(0.001), max: Math.fround(100) }).filter(n => !isNaN(n) && isFinite(n)),
    leverage: fc.integer({ min: 1, max: 20 }),
    pnl: fc.float({ min: Math.fround(-1000), max: Math.fround(1000) }).filter(n => !isNaN(n) && isFinite(n)),
    pnlPercent: fc.float({ min: Math.fround(-0.1), max: Math.fround(0.1) }).filter(n => !isNaN(n) && isFinite(n)),
    duration: fc.integer({ min: 1000, max: 300000 }), // 1s to 5min
    slippage: fc.float({ min: Math.fround(0), max: Math.fround(0.01) }).filter(n => !isNaN(n) && isFinite(n)),
    fees: fc.float({ min: Math.fround(0), max: Math.fround(100) }).filter(n => !isNaN(n) && isFinite(n)),
    exitReason: fc.constantFrom('take_profit', 'stop_loss', 'trailing_stop', 'timeout', 'manual')
  });
}

function generateValidRegimeSnapshot(): fc.Arbitrary<RegimeSnapshot> {
  return fc.record({
    timestamp: fc.integer({ min: 1600000000000, max: Date.now() }),
    symbol: fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'),
    trendState: fc.constantFrom(-1, 0, 1),
    volState: fc.constantFrom(0, 1, 2),
    liquidityState: fc.constantFrom(0, 1, 2),
    regimeState: fc.constantFrom(-1, 0, 1),
    hurstExponent: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(1) })),
    fdi: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(2) })),
    efficiencyRatio: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(1) })),
    vpinApprox: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(1) })),
    absorptionState: fc.option(fc.boolean()),
    shannonEntropy: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(10) }))
  });
}