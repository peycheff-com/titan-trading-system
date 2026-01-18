/**
 * DashboardIntegration - Integration example for DashboardService
 * Shows how to set up wallet providers and configure the service
 *
 * Requirements: 10.2, 10.8
 */

import { DashboardService, WalletBalance } from "./DashboardService.js";
import { TitanBrain } from "../engine/TitanBrain.js";
import { DatabaseManager } from "../db/DatabaseManager.js";
import { getLogger } from "../monitoring/index.js";

const logger = getLogger();

/**
 * Example wallet provider for Bybit
 */
export class BybitWalletProvider {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Fetch wallet balances from Bybit
   */
  async getBalances(): Promise<WalletBalance[]> {
    // This is a mock implementation
    // In a real implementation, this would call the Bybit API
    return [
      {
        exchange: "bybit",
        walletType: "futures",
        asset: "USDT",
        balance: 1000.0,
        usdValue: 1000.0,
      },
      {
        exchange: "bybit",
        walletType: "spot",
        asset: "USDT",
        balance: 500.0,
        usdValue: 500.0,
      },
    ];
  }
}

/**
 * Example wallet provider for Binance
 */
export class BinanceWalletProvider {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Fetch wallet balances from Binance
   */
  async getBalances(): Promise<WalletBalance[]> {
    // This is a mock implementation
    // In a real implementation, this would call the Binance API
    return [
      {
        exchange: "binance",
        walletType: "spot",
        asset: "USDT",
        balance: 750.0,
        usdValue: 750.0,
      },
      {
        exchange: "binance",
        walletType: "spot",
        asset: "BTC",
        balance: 0.01,
        usdValue: 430.0, // Assuming BTC price of $43,000
      },
    ];
  }
}

/**
 * Set up dashboard service with wallet providers
 */
export function setupDashboardService(
  brain: TitanBrain,
  db?: DatabaseManager,
): DashboardService {
  const dashboardService = new DashboardService(brain, db, {
    version: "1.0.0",
    cacheTTL: 60000, // 1 minute
    navCacheTTL: 30000, // 30 seconds
    maxRecentDecisions: 50,
  });

  // Register wallet providers
  // In a real implementation, these would use actual API credentials
  const bybitProvider = new BybitWalletProvider("api_key", "api_secret");
  const binanceProvider = new BinanceWalletProvider("api_key", "api_secret");

  dashboardService.registerWalletProvider(
    "bybit",
    () => bybitProvider.getBalances(),
  );
  dashboardService.registerWalletProvider(
    "binance",
    () => binanceProvider.getBalances(),
  );

  return dashboardService;
}

/**
 * Example usage of dashboard service
 */
export async function exampleUsage(brain: TitanBrain, db?: DatabaseManager) {
  const dashboardService = setupDashboardService(brain, db);

  // Get NAV calculation
  const nav = await dashboardService.calculateNAV();
  logger.info(`Total NAV: ${nav.totalNAV}`);
  (logger as any).info("Wallet breakdown:", undefined, {
    breakdown: nav.walletBreakdown,
  });

  const dashboardData = await brain.getDashboardData();
  // Enrich with stored metrics
  const extendedData: any = { // Changed type to any for simplicity, assuming ExtendedDashboardData is defined elsewhere
    ...dashboardData,
    metrics: {
      ...dashboardData.riskMetrics,
      // Add historical metrics here if needed
    },
  };
  (logger as any).info("Dashboard data generated", undefined, {
    data: extendedData,
  });

  const jsonExport = JSON.stringify(extendedData);
  logger.info(`JSON export length: ${jsonExport.length}`);

  // Check cache status
  const cacheStatus = dashboardService.getCacheStatus();
  logger.info("Cache status:", cacheStatus);
}
