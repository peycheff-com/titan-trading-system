/**
 * DataLoader - Historical Data Ingestion
 *
 * Handles loading and preprocessing of historical market data
 * for backtesting purposes. Supports multiple data sources and
 * formats with validation and error handling.
 *
 * Requirements: 3.4
 */

import * as fs from 'fs';
import * as path from 'path';
import { OHLCV, RegimeSnapshot, Trade } from '../types/index.js';
import { ErrorCode, TitanError } from '../utils/ErrorHandler.js';

export interface DataSource {
  type: 'file' | 'api' | 'database';
  path?: string;
  url?: string;
  credentials?: Record<string, string>;
}

export interface DataLoaderConfig {
  dataDir?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number; // Cache time-to-live in milliseconds
  validateData?: boolean;
}

/**
 * Historical data loader with caching and validation
 */
export class DataLoader {
  private config: Required<DataLoaderConfig>;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  constructor(config: DataLoaderConfig = {}) {
    this.config = {
      dataDir: config.dataDir ?? path.join(process.cwd(), 'data'),
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTTL: config.cacheTTL ?? 5 * 60 * 1000, // 5 minutes
      validateData: config.validateData ?? true,
    };
  }

  /**
   * Load OHLCV data from file
   *
   * Supports JSON and CSV formats. Data should be sorted by timestamp.
   *
   * @param symbol - Trading symbol
   * @param startTime - Start timestamp (optional)
   * @param endTime - End timestamp (optional)
   * @returns Array of OHLCV data
   */
  async loadOHLCVData(symbol: string, startTime?: number, endTime?: number): Promise<OHLCV[]> {
    const cacheKey = `ohlcv_${symbol}_${startTime}_${endTime}`;

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached as OHLCV[];
      }
    }

    try {
      // Try JSON format first
      const jsonPath = path.join(this.config.dataDir, 'ohlcv', `${symbol}.json`);
      let data: OHLCV[] = [];

      if (fs.existsSync(jsonPath)) {
        data = await this.loadOHLCVFromJSON(jsonPath);
      } else {
        // Try CSV format
        const csvPath = path.join(this.config.dataDir, 'ohlcv', `${symbol}.csv`);
        if (fs.existsSync(csvPath)) {
          data = await this.loadOHLCVFromCSV(csvPath);
        } else {
          // Generate synthetic data for testing
          data = this.generateSyntheticOHLCV(symbol, startTime, endTime);
        }
      }

      // Filter by time range if specified
      if (startTime !== undefined || endTime !== undefined) {
        data = data.filter((candle) => {
          if (startTime !== undefined && candle.timestamp < startTime) {
            return false;
          }
          if (endTime !== undefined && candle.timestamp > endTime) return false;
          return true;
        });
      }

      // Validate data if enabled
      if (this.config.validateData) {
        this.validateOHLCVData(data);
      }

      // Cache the result
      if (this.config.cacheEnabled) {
        this.setCachedData(cacheKey, data);
      }

      return data;
    } catch (error) {
      throw new TitanError(
        ErrorCode.MISSING_OHLCV_DATA,
        `Failed to load OHLCV data for ${symbol}`,
        {
          symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
    }
  }

  /**
   * Load regime snapshots from file
   *
   * @param symbol - Trading symbol
   * @param startTime - Start timestamp (optional)
   * @param endTime - End timestamp (optional)
   * @returns Array of regime snapshots
   */
  async loadRegimeData(
    symbol: string,
    startTime?: number,
    endTime?: number,
  ): Promise<RegimeSnapshot[]> {
    const cacheKey = `regime_${symbol}_${startTime}_${endTime}`;

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached as RegimeSnapshot[];
      }
    }

    try {
      const filePath = path.join(this.config.dataDir, 'regime', `${symbol}.json`);
      let data: RegimeSnapshot[] = [];

      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(fileContent);
      } else {
        // Generate synthetic regime data for testing
        data = this.generateSyntheticRegimeData(symbol, startTime, endTime);
      }

      // Filter by time range if specified
      if (startTime !== undefined || endTime !== undefined) {
        data = data.filter((snapshot) => {
          if (startTime !== undefined && snapshot.timestamp < startTime) {
            return false;
          }
          if (endTime !== undefined && snapshot.timestamp > endTime) {
            return false;
          }
          return true;
        });
      }

      // Validate data if enabled
      if (this.config.validateData) {
        this.validateRegimeData(data);
      }

      // Cache the result
      if (this.config.cacheEnabled) {
        this.setCachedData(cacheKey, data);
      }

      return data;
    } catch (error) {
      throw new TitanError(
        ErrorCode.MISSING_OHLCV_DATA,
        `Failed to load regime data for ${symbol}`,
        {
          symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
    }
  }

  /**
   * Load historical trades from file
   *
   * @param startTime - Start timestamp (optional)
   * @param endTime - End timestamp (optional)
   * @returns Array of historical trades
   */
  async loadTradeHistory(startTime?: number, endTime?: number): Promise<Trade[]> {
    const cacheKey = `trades_${startTime}_${endTime}`;

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedData(cacheKey);
      if (cached) {
        return cached as Trade[];
      }
    }

    try {
      const filePath = path.join(this.config.dataDir, 'trades.json');
      let data: Trade[] = [];

      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(fileContent);
      } else {
        // Generate synthetic trade data for testing
        data = this.generateSyntheticTrades(startTime, endTime);
      }

      // Filter by time range if specified
      if (startTime !== undefined || endTime !== undefined) {
        data = data.filter((trade) => {
          if (startTime !== undefined && trade.timestamp < startTime) {
            return false;
          }
          if (endTime !== undefined && trade.timestamp > endTime) return false;
          return true;
        });
      }

      // Validate data if enabled
      if (this.config.validateData) {
        this.validateTradeData(data);
      }

      // Cache the result
      if (this.config.cacheEnabled) {
        this.setCachedData(cacheKey, data);
      }

      return data;
    } catch (error) {
      throw new TitanError(ErrorCode.MISSING_OHLCV_DATA, `Failed to load trade history`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Load OHLCV data from JSON file
   */
  private async loadOHLCVFromJSON(filePath: string): Promise<OHLCV[]> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data)) {
      throw new Error('OHLCV data must be an array');
    }

    return data.map((item: any) => ({
      timestamp: item.timestamp || item.time || item.t,
      open: item.open || item.o,
      high: item.high || item.h,
      low: item.low || item.l,
      close: item.close || item.c,
      volume: item.volume || item.v || 0,
    }));
  }

  /**
   * Load OHLCV data from CSV file
   */
  private async loadOHLCVFromCSV(filePath: string): Promise<OHLCV[]> {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.trim().split('\n');

    // Skip header if present
    const dataLines =
      lines[0].includes('timestamp') || lines[0].includes('time') ? lines.slice(1) : lines;

    return dataLines.map((line) => {
      const [timestamp, open, high, low, close, volume] = line.split(',').map(Number);
      return { timestamp, open, high, low, close, volume: volume || 0 };
    });
  }

  /**
   * Generate synthetic OHLCV data for testing
   */
  private generateSyntheticOHLCV(symbol: string, startTime?: number, endTime?: number): OHLCV[] {
    const start = startTime || Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
    const end = endTime || Date.now();
    const interval = 5 * 60 * 1000; // 5 minutes

    const data: OHLCV[] = [];
    let price = 50000; // Starting price

    for (let timestamp = start; timestamp <= end; timestamp += interval) {
      // Simple random walk with some volatility
      const change = (Math.random() - 0.5) * 0.02; // ±1% max change
      const newPrice = price * (1 + change);

      const high = newPrice * (1 + Math.random() * 0.005); // Up to 0.5% higher
      const low = newPrice * (1 - Math.random() * 0.005); // Up to 0.5% lower
      const volume = Math.random() * 1000000; // Random volume

      data.push({
        timestamp,
        open: price,
        high,
        low,
        close: newPrice,
        volume,
      });

      price = newPrice;
    }

    return data;
  }

  /**
   * Generate synthetic regime data for testing
   */
  private generateSyntheticRegimeData(
    symbol: string,
    startTime?: number,
    endTime?: number,
  ): RegimeSnapshot[] {
    const start = startTime || Date.now() - 30 * 24 * 60 * 60 * 1000;
    const end = endTime || Date.now();
    const interval = 15 * 60 * 1000; // 15 minutes

    const data: RegimeSnapshot[] = [];

    for (let timestamp = start; timestamp <= end; timestamp += interval) {
      data.push({
        timestamp,
        symbol,
        trendState: (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1,
        volState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        liquidityState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        regimeState: (Math.floor(Math.random() * 3) - 1) as -1 | 0 | 1,
        hurstExponent: 0.3 + Math.random() * 0.4, // 0.3 to 0.7
        fdi: Math.random(),
        efficiencyRatio: Math.random(),
        vpinApprox: Math.random(),
        absorptionState: Math.random() > 0.7,
        shannonEntropy: Math.random() * 2,
      });
    }

    return data;
  }

  /**
   * Generate synthetic trade data for testing
   */
  private generateSyntheticTrades(startTime?: number, endTime?: number): Trade[] {
    const start = startTime || Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    const end = endTime || Date.now();

    const trades: Trade[] = [];
    const trapTypes: Array<
      'oi_wipeout' | 'funding_spike' | 'liquidity_sweep' | 'volatility_spike'
    > = ['oi_wipeout', 'funding_spike', 'liquidity_sweep', 'volatility_spike'];
    const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'];

    // Generate 50-200 trades
    const tradeCount = 50 + Math.floor(Math.random() * 150);

    for (let i = 0; i < tradeCount; i++) {
      const timestamp = start + Math.random() * (end - start);
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];
      const side = Math.random() > 0.5 ? 'long' : 'short';
      const entryPrice = 30000 + Math.random() * 40000; // $30k-$70k range
      const leverage = 5 + Math.floor(Math.random() * 16); // 5-20x
      const quantity = 0.01 + Math.random() * 0.1; // 0.01-0.11 BTC

      // Simulate trade outcome (60% win rate)
      const isWin = Math.random() > 0.4;
      const priceChange = isWin
        ? 0.01 + Math.random() * 0.04 // 1-5% gain
        : -(0.005 + Math.random() * 0.02); // 0.5-2.5% loss

      const exitPrice =
        side === 'long' ? entryPrice * (1 + priceChange) : entryPrice * (1 - priceChange);

      const pnl =
        quantity * leverage * (side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice);
      const pnlPercent = (pnl / (quantity * entryPrice * leverage)) * 100;

      trades.push({
        id: `trade_${i + 1}`,
        timestamp,
        symbol,
        trapType,
        side,
        entryPrice,
        exitPrice,
        quantity,
        leverage,
        pnl,
        pnlPercent,
        duration: 5 * 60 * 1000 + Math.random() * 55 * 60 * 1000, // 5-60 minutes
        slippage: Math.random() * 10, // 0-10 USD slippage
        fees: quantity * entryPrice * 0.0006, // 0.06% fee
        exitReason: isWin ? 'take_profit' : 'stop_loss',
      });
    }

    return trades.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get cached data if valid
   */
  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached data
   */
  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Validate OHLCV data
   */
  private validateOHLCVData(data: OHLCV[]): void {
    for (const candle of data) {
      if (candle.high < candle.low) {
        throw new Error(`Invalid OHLCV: high (${candle.high}) < low (${candle.low})`);
      }
      if (candle.open < 0 || candle.close < 0) {
        throw new Error(`Invalid OHLCV: negative prices`);
      }
      if (candle.volume < 0) {
        throw new Error(`Invalid OHLCV: negative volume`);
      }
    }
  }

  /**
   * Validate regime data
   */
  private validateRegimeData(data: RegimeSnapshot[]): void {
    for (const snapshot of data) {
      if (![-1, 0, 1].includes(snapshot.trendState)) {
        throw new Error(`Invalid regime: trendState must be -1, 0, or 1`);
      }
      if (![0, 1, 2].includes(snapshot.volState)) {
        throw new Error(`Invalid regime: volState must be 0, 1, or 2`);
      }
      if (![0, 1, 2].includes(snapshot.liquidityState)) {
        throw new Error(`Invalid regime: liquidityState must be 0, 1, or 2`);
      }
    }
  }

  /**
   * Validate trade data
   */
  private validateTradeData(data: Trade[]): void {
    for (const trade of data) {
      if (trade.entryPrice <= 0 || trade.exitPrice <= 0) {
        throw new Error(`Invalid trade: negative or zero prices`);
      }
      if (trade.quantity <= 0) {
        throw new Error(`Invalid trade: negative or zero quantity`);
      }
      if (trade.leverage < 1 || trade.leverage > 100) {
        throw new Error(`Invalid trade: leverage out of range (1-100)`);
      }
    }
  }
}
