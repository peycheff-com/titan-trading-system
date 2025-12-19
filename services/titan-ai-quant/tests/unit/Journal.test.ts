/**
 * Unit tests for Journal (Log Parser)
 * 
 * Requirements: 1.1, 1.2, 1.6
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Journal } from '../../src/ai/Journal';
import { Trade, RegimeSnapshot } from '../../src/types';

describe('Journal', () => {
  let journal: Journal;
  let tempDir: string;
  let tradesFilePath: string;
  let regimeFilePath: string;

  // Sample trade data
  const sampleTrade: Trade = {
    id: 'trade-001',
    timestamp: 1700000000000,
    symbol: 'BTCUSDT',
    trapType: 'oi_wipeout',
    side: 'long',
    entryPrice: 50000,
    exitPrice: 49500,
    quantity: 0.1,
    leverage: 20,
    pnl: -50,
    pnlPercent: -0.01,
    duration: 4000,
    slippage: 0.001,
    fees: 2.5,
    exitReason: 'stop_loss'
  };

  const sampleRegime: RegimeSnapshot = {
    timestamp: 1699999900000,
    symbol: 'BTCUSDT',
    trendState: -1,
    volState: 2,
    liquidityState: 0,
    regimeState: -1
  };

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journal-test-'));
    tradesFilePath = path.join(tempDir, 'trades.jsonl');
    regimeFilePath = path.join(tempDir, 'regime_snapshots.jsonl');
    journal = new Journal(tradesFilePath, regimeFilePath);
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tradesFilePath)) {
      fs.unlinkSync(tradesFilePath);
    }
    if (fs.existsSync(regimeFilePath)) {
      fs.unlinkSync(regimeFilePath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  describe('ingestTrades', () => {
    it('should return empty array when file does not exist', async () => {
      const trades = await journal.ingestTrades();
      expect(trades).toEqual([]);
    });

    it('should parse valid JSONL trade logs', async () => {
      // Write sample trades to file
      const trades = [sampleTrade, { ...sampleTrade, id: 'trade-002', pnl: 100, pnlPercent: 0.02 }];
      fs.writeFileSync(tradesFilePath, trades.map(t => JSON.stringify(t)).join('\n'));

      const result = await journal.ingestTrades();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('trade-001');
      expect(result[1].id).toBe('trade-002');
    });

    it('should respect limit parameter', async () => {
      // Write 5 trades
      const trades = Array.from({ length: 5 }, (_, i) => ({
        ...sampleTrade,
        id: `trade-${i}`
      }));
      fs.writeFileSync(tradesFilePath, trades.map(t => JSON.stringify(t)).join('\n'));

      const result = await journal.ingestTrades(3);
      expect(result).toHaveLength(3);
    });

    it('should skip malformed JSON lines', async () => {
      const content = [
        JSON.stringify(sampleTrade),
        'invalid json {',
        JSON.stringify({ ...sampleTrade, id: 'trade-002' })
      ].join('\n');
      fs.writeFileSync(tradesFilePath, content);

      const result = await journal.ingestTrades();
      expect(result).toHaveLength(2);
    });

    it('should skip trades missing required fields', async () => {
      const content = [
        JSON.stringify(sampleTrade),
        JSON.stringify({ id: 'incomplete', symbol: 'BTC' }), // Missing required fields
        JSON.stringify({ ...sampleTrade, id: 'trade-002' })
      ].join('\n');
      fs.writeFileSync(tradesFilePath, content);

      const result = await journal.ingestTrades();
      expect(result).toHaveLength(2);
    });

    it('should handle empty lines', async () => {
      const content = [
        JSON.stringify(sampleTrade),
        '',
        '   ',
        JSON.stringify({ ...sampleTrade, id: 'trade-002' })
      ].join('\n');
      fs.writeFileSync(tradesFilePath, content);

      const result = await journal.ingestTrades();
      expect(result).toHaveLength(2);
    });
  });

  describe('summarizeTrade', () => {
    it('should generate token-efficient narrative with all required fields', () => {
      const narrative = journal.summarizeTrade(sampleTrade, sampleRegime);
      
      // Check all required fields are present
      expect(narrative).toContain('Symbol: BTCUSDT');
      expect(narrative).toContain('Type: OI_WIPEOUT');
      expect(narrative).toContain('Result:');
      expect(narrative).toContain('Duration:');
      expect(narrative).toContain('Slippage:');
      expect(narrative).toContain('Regime:');
    });

    it('should format result percentage correctly', () => {
      const narrative = journal.summarizeTrade(sampleTrade, sampleRegime);
      expect(narrative).toContain('Result: -1.00%');
    });

    it('should format positive results with plus sign', () => {
      const profitTrade = { ...sampleTrade, pnlPercent: 0.025 };
      const narrative = journal.summarizeTrade(profitTrade, sampleRegime);
      expect(narrative).toContain('Result: +2.50%');
    });

    it('should convert duration to seconds', () => {
      const narrative = journal.summarizeTrade(sampleTrade, sampleRegime);
      expect(narrative).toContain('Duration: 4s');
    });

    it('should include regime context', () => {
      const narrative = journal.summarizeTrade(sampleTrade, sampleRegime);
      expect(narrative).toContain('Risk-Off');
      expect(narrative).toContain('Extreme-Vol');
      expect(narrative).toContain('Bear');
    });

    it('should handle different regime states', () => {
      const bullRegime: RegimeSnapshot = {
        ...sampleRegime,
        trendState: 1,
        volState: 0,
        regimeState: 1
      };
      const narrative = journal.summarizeTrade(sampleTrade, bullRegime);
      expect(narrative).toContain('Risk-On');
      expect(narrative).toContain('Low-Vol');
      expect(narrative).toContain('Bull');
    });
  });

  describe('getFailedTrades', () => {
    it('should filter only loss-making trades', () => {
      const trades: Trade[] = [
        { ...sampleTrade, id: 'loss-1', pnl: -50 },
        { ...sampleTrade, id: 'profit-1', pnl: 100 },
        { ...sampleTrade, id: 'loss-2', pnl: -25 },
        { ...sampleTrade, id: 'breakeven', pnl: 0 }
      ];

      const failed = journal.getFailedTrades(trades);
      expect(failed).toHaveLength(2);
      expect(failed.map(t => t.id)).toEqual(['loss-1', 'loss-2']);
    });

    it('should return empty array when no losses', () => {
      const trades: Trade[] = [
        { ...sampleTrade, pnl: 100 },
        { ...sampleTrade, pnl: 50 }
      ];

      const failed = journal.getFailedTrades(trades);
      expect(failed).toHaveLength(0);
    });

    it('should handle empty input', () => {
      const failed = journal.getFailedTrades([]);
      expect(failed).toHaveLength(0);
    });
  });

  describe('getRegimeContext', () => {
    beforeEach(() => {
      // Set up regime snapshots for testing
      const snapshots: RegimeSnapshot[] = [
        { ...sampleRegime, timestamp: 1000 },
        { ...sampleRegime, timestamp: 2000 },
        { ...sampleRegime, timestamp: 3000 },
        { ...sampleRegime, timestamp: 5000 }
      ];
      journal.setRegimeSnapshots(snapshots);
    });

    it('should return null when no regime snapshots loaded', () => {
      journal.reset();
      const result = journal.getRegimeContext(sampleTrade);
      expect(result).toBeNull();
    });

    it('should find exact timestamp match', () => {
      const trade = { ...sampleTrade, timestamp: 2000 };
      const result = journal.getRegimeContext(trade);
      expect(result?.timestamp).toBe(2000);
    });

    it('should find closest regime snapshot <= trade timestamp', () => {
      const trade = { ...sampleTrade, timestamp: 2500 };
      const result = journal.getRegimeContext(trade);
      expect(result?.timestamp).toBe(2000);
    });

    it('should return null when trade is before all snapshots', () => {
      const trade = { ...sampleTrade, timestamp: 500 };
      const result = journal.getRegimeContext(trade);
      expect(result).toBeNull();
    });

    it('should return last snapshot when trade is after all', () => {
      const trade = { ...sampleTrade, timestamp: 10000 };
      const result = journal.getRegimeContext(trade);
      expect(result?.timestamp).toBe(5000);
    });
  });

  describe('generateFailureNarratives', () => {
    it('should generate narratives for failed trades', async () => {
      // Write trades
      const trades = [
        { ...sampleTrade, id: 'loss-1', pnl: -50, pnlPercent: -0.01 },
        { ...sampleTrade, id: 'profit-1', pnl: 100, pnlPercent: 0.02 }
      ];
      fs.writeFileSync(tradesFilePath, trades.map(t => JSON.stringify(t)).join('\n'));

      // Set up regime snapshots
      journal.setRegimeSnapshots([sampleRegime]);

      const narratives = await journal.generateFailureNarratives();
      expect(narratives).toHaveLength(1);
      expect(narratives[0]).toContain('BTCUSDT');
      expect(narratives[0]).toContain('OI_WIPEOUT');
    });
  });

  describe('setRegimeSnapshots', () => {
    it('should sort snapshots by timestamp', () => {
      const unsorted: RegimeSnapshot[] = [
        { ...sampleRegime, timestamp: 3000 },
        { ...sampleRegime, timestamp: 1000 },
        { ...sampleRegime, timestamp: 2000 }
      ];
      journal.setRegimeSnapshots(unsorted);
      
      const snapshots = journal.getRegimeSnapshots();
      expect(snapshots[0].timestamp).toBe(1000);
      expect(snapshots[1].timestamp).toBe(2000);
      expect(snapshots[2].timestamp).toBe(3000);
    });
  });
});
