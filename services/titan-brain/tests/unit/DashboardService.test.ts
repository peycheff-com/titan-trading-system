/**
 * DashboardService Unit Tests
 * Tests the dashboard data aggregation functionality
 */

import { DashboardService, WalletBalance } from '../../src/server/DashboardService.js';
import { TitanBrain } from '../../src/engine/TitanBrain.js';
import { AllocationEngine } from '../../src/engine/AllocationEngine.js';
import { PerformanceTracker } from '../../src/engine/PerformanceTracker.js';
import { RiskGuardian } from '../../src/engine/RiskGuardian.js';
import { CapitalFlowManager } from '../../src/engine/CapitalFlowManager.js';
import { CircuitBreaker } from '../../src/engine/CircuitBreaker.js';
import {
  AllocationVector,
  PhasePerformance,
  TreasuryStatus,
  BreakerStatus,
  BrainDecision,
  Position,
} from '../../src/types/index.js';


// Mock implementations
const mockAllocationEngine = {
  getWeights: jest.fn(),
  getMaxLeverage: jest.fn(),
} as unknown as AllocationEngine;

const mockPerformanceTracker = {
  getAllPhasePerformance: jest.fn(),
} as unknown as PerformanceTracker;

const mockRiskGuardian = {
  getRiskMetrics: jest.fn(),
} as unknown as RiskGuardian;

const mockCapitalFlowManager = {
  getTreasuryStatus: jest.fn(),
  getNextSweepTriggerLevel: jest.fn(),
  getTotalSwept: jest.fn(),
  getHighWatermark: jest.fn(),
} as unknown as CapitalFlowManager;

const mockCircuitBreaker = {
  getStatus: jest.fn(),
} as unknown as CircuitBreaker;

const mockBrain = {
  getEquity: jest.fn(),
  getPositions: jest.fn(),
  getAllPhasePerformance: jest.fn(),
  getAllApprovalRates: jest.fn(),
  getTreasuryStatus: jest.fn(),
  getNextSweepTriggerLevel: jest.fn(),
  getTotalSwept: jest.fn(),
  getHighWatermark: jest.fn(),
  getRecentDecisions: jest.fn(),
  getDashboardData: jest.fn(),
  getCircuitBreakerStatus: jest.fn(),
  getAllocation: jest.fn(),
} as unknown as TitanBrain;

describe('DashboardService', () => {
  let dashboardService: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    dashboardService = new DashboardService(mockBrain);
  });

  describe('calculateNAV', () => {
    it('should calculate NAV from wallet providers', async () => {
      // Mock wallet provider
      const mockWalletBalances: WalletBalance[] = [
        {
          exchange: 'bybit',
          walletType: 'futures',
          asset: 'USDT',
          balance: 1000,
          usdValue: 1000,
        },
        {
          exchange: 'binance',
          walletType: 'spot',
          asset: 'USDT',
          balance: 500,
          usdValue: 500,
        },
      ];

      const mockProvider = jest.fn().mockResolvedValue(mockWalletBalances);
      dashboardService.registerWalletProvider('test', mockProvider);

      // Mock positions with unrealized PnL
      const mockPositions: Position[] = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 100,
          entryPrice: 50000,
          unrealizedPnL: 50,
          leverage: 10,
          phaseId: 'phase1',
        },
      ];
      (mockBrain.getPositions as jest.Mock).mockReturnValue(mockPositions);

      const result = await dashboardService.calculateNAV();

      expect(result.totalNAV).toBe(1550); // 1000 + 500 + 50
      expect(result.walletBreakdown).toEqual(mockWalletBalances);
      expect(result.unrealizedPnL).toBe(50);
      expect(mockProvider).toHaveBeenCalled();
    });

    it('should handle wallet provider errors gracefully', async () => {
      const mockProvider = jest.fn().mockRejectedValue(new Error('API Error'));
      dashboardService.registerWalletProvider('test', mockProvider);

      (mockBrain.getPositions as jest.Mock).mockReturnValue([]);

      const result = await dashboardService.calculateNAV();

      expect(result.totalNAV).toBe(0);
      expect(result.walletBreakdown).toEqual([]);
      expect(result.unrealizedPnL).toBe(0);
    });

    it('should cache NAV calculation results', async () => {
      const mockProvider = jest.fn().mockResolvedValue([]);
      dashboardService.registerWalletProvider('test', mockProvider);
      (mockBrain.getPositions as jest.Mock).mockReturnValue([]);

      // First call
      await dashboardService.calculateNAV();
      expect(mockProvider).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await dashboardService.calculateNAV();
      expect(mockProvider).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatAllocation', () => {
    it('should format allocation vector correctly', () => {
      const allocation: AllocationVector = {
        w1: 0.6,
        w2: 0.3,
        w3: 0.1,
        timestamp: Date.now(),
      };
      const equity = 1000;

      const result = dashboardService.formatAllocation(allocation, equity);

      expect(result.phaseEquity.phase1.weight).toBe(0.6);
      expect(result.phaseEquity.phase1.equity).toBe(600);
      expect(result.phaseEquity.phase1.percentage).toBe('60.00%');
      expect(result.phaseEquity.phase2.equity).toBe(300);
      expect(result.phaseEquity.phase3.equity).toBe(100);
      expect(result.totalEquity).toBe(1000);
    });
  });

  describe('calculatePhaseEquity', () => {
    it('should calculate phase equity correctly', () => {
      const allocation: AllocationVector = {
        w1: 0.5,
        w2: 0.3,
        w3: 0.2,
        timestamp: Date.now(),
      };
      const equity = 2000;

      const result = dashboardService.calculatePhaseEquity(allocation, equity);

      expect(result.phase1).toBe(1000);
      expect(result.phase2).toBe(600);
      expect(result.phase3).toBe(400);
    });
  });

  describe('exportDashboardJSON', () => {
    it('should export dashboard data as JSON with metadata', async () => {
      // Mock dashboard data
      const mockDashboardData = {
        nav: 1000,
        allocation: { w1: 0.6, w2: 0.3, w3: 0.1, timestamp: Date.now() },
        version: '1.0.0',
        uptime: 60000,
      };

      // Mock the getDashboardData method
      jest.spyOn(dashboardService, 'getDashboardData').mockResolvedValue(mockDashboardData as any);

      const result = await dashboardService.exportDashboardJSON();
      const parsed = JSON.parse(result);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.version).toBe('1.0.0');
      expect(parsed.metadata.source).toBe('titan-brain-dashboard-service');
      expect(parsed.data).toEqual(mockDashboardData);
    });
  });

  describe('cache management', () => {
    it('should clear cache correctly', () => {
      dashboardService.clearCache();
      
      const cacheStatus = dashboardService.getCacheStatus();
      expect(cacheStatus.dashboard.cached).toBe(false);
      expect(cacheStatus.nav.cached).toBe(false);
    });

    it('should report cache status correctly', async () => {
      // Trigger cache population
      const mockProvider = jest.fn().mockResolvedValue([]);
      dashboardService.registerWalletProvider('test', mockProvider);
      (mockBrain.getPositions as jest.Mock).mockReturnValue([]);
      
      await dashboardService.calculateNAV();
      
      const cacheStatus = dashboardService.getCacheStatus();
      expect(cacheStatus.nav.cached).toBe(true);
      expect(cacheStatus.nav.age).toBeGreaterThanOrEqual(0);
    });
  });
});