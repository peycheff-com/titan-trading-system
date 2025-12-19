/**
 * Unit Tests for CapitalFlowManager
 * 
 * Tests sweep condition detection, reserve limit enforcement,
 * high watermark updates, and sweep retry logic.
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.8
 */

import { CapitalFlowManager, ExchangeWalletAPI } from '../../src/engine/CapitalFlowManager.js';
import { CapitalFlowConfig } from '../../src/types/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

/**
 * Mock Exchange API for testing
 */
class MockExchangeAPI implements ExchangeWalletAPI {
  private futuresBalance: number = 0;
  private spotBalance: number = 0;
  private transferShouldFail: boolean = false;
  private failCount: number = 0;
  private maxFailures: number = 0;

  setFuturesBalance(balance: number): void {
    this.futuresBalance = balance;
  }

  setSpotBalance(balance: number): void {
    this.spotBalance = balance;
  }

  setTransferShouldFail(shouldFail: boolean, maxFailures: number = Infinity): void {
    this.transferShouldFail = shouldFail;
    this.maxFailures = maxFailures;
    this.failCount = 0;
  }

  async getFuturesBalance(): Promise<number> {
    return this.futuresBalance;
  }

  async getSpotBalance(): Promise<number> {
    return this.spotBalance;
  }

  async transferToSpot(amount: number): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    if (this.transferShouldFail && this.failCount < this.maxFailures) {
      this.failCount++;
      return { success: false, error: 'Transfer failed' };
    }
    
    this.futuresBalance -= amount;
    this.spotBalance += amount;
    return { success: true, transactionId: `tx-${Date.now()}` };
  }
}

describe('CapitalFlowManager', () => {
  let manager: CapitalFlowManager;
  let mockAPI: MockExchangeAPI;
  let config: CapitalFlowConfig;

  beforeEach(() => {
    config = { ...defaultConfig.capitalFlow };
    mockAPI = new MockExchangeAPI();
    manager = new CapitalFlowManager(config, undefined, mockAPI);
  });


  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const retrievedConfig = manager.getConfig();
      expect(retrievedConfig.sweepThreshold).toBe(1.2);
      expect(retrievedConfig.reserveLimit).toBe(200);
      expect(retrievedConfig.maxRetries).toBe(3);
    });

    it('should accept custom configuration', () => {
      const customConfig: CapitalFlowConfig = {
        sweepThreshold: 1.3,
        reserveLimit: 500,
        sweepSchedule: '0 12 * * *',
        maxRetries: 5,
        retryBaseDelay: 2000,
      };
      const customManager = new CapitalFlowManager(customConfig, undefined, mockAPI);
      
      const retrievedConfig = customManager.getConfig();
      expect(retrievedConfig.sweepThreshold).toBe(1.3);
      expect(retrievedConfig.reserveLimit).toBe(500);
      expect(retrievedConfig.maxRetries).toBe(5);
    });
  });

  describe('setTargetAllocation', () => {
    it('should set target allocation', () => {
      manager.setTargetAllocation(1000);
      expect(manager.getTargetAllocation()).toBe(1000);
    });

    it('should handle negative values by setting to 0', () => {
      manager.setTargetAllocation(-500);
      expect(manager.getTargetAllocation()).toBe(0);
    });
  });

  describe('getHighWatermark', () => {
    it('should return 0 initially', () => {
      expect(manager.getHighWatermark()).toBe(0);
    });
  });

  describe('updateHighWatermark', () => {
    it('should update watermark when equity exceeds current', async () => {
      const updated = await manager.updateHighWatermark(1000);
      expect(updated).toBe(true);
      expect(manager.getHighWatermark()).toBe(1000);
    });

    it('should not update watermark when equity is lower', async () => {
      await manager.updateHighWatermark(1000);
      const updated = await manager.updateHighWatermark(800);
      expect(updated).toBe(false);
      expect(manager.getHighWatermark()).toBe(1000);
    });

    it('should not update watermark when equity is equal', async () => {
      await manager.updateHighWatermark(1000);
      const updated = await manager.updateHighWatermark(1000);
      expect(updated).toBe(false);
      expect(manager.getHighWatermark()).toBe(1000);
    });

    it('should update watermark monotonically (Property 10)', async () => {
      const equitySequence = [500, 1000, 800, 1200, 900, 1500];
      const expectedWatermarks = [500, 1000, 1000, 1200, 1200, 1500];

      for (let i = 0; i < equitySequence.length; i++) {
        await manager.updateHighWatermark(equitySequence[i]);
        expect(manager.getHighWatermark()).toBe(expectedWatermarks[i]);
      }
    });
  });


  describe('checkSweepConditions', () => {
    beforeEach(() => {
      manager.setTargetAllocation(1000);
    });

    it('should not sweep when balance is below threshold', async () => {
      mockAPI.setFuturesBalance(1100); // 10% over target, below 20% threshold
      
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(false);
      expect(decision.amount).toBe(0);
    });

    it('should sweep when balance exceeds 20% threshold (Requirement 4.2)', async () => {
      mockAPI.setFuturesBalance(1500); // 50% over target
      
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(true);
      expect(decision.amount).toBeGreaterThan(0);
    });

    it('should calculate correct excess amount (Requirement 4.3)', async () => {
      mockAPI.setFuturesBalance(1500);
      manager.setTargetAllocation(1000);
      
      // Sweep trigger level = 1000 * 1.2 = 1200
      // Excess = 1500 - 1200 = 300
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(true);
      expect(decision.amount).toBe(300);
    });

    it('should respect reserve limit (Requirement 4.5)', async () => {
      mockAPI.setFuturesBalance(350); // Low balance
      manager.setTargetAllocation(200);
      
      // Sweep trigger level = 200 * 1.2 = 240
      // Excess = 350 - 240 = 110
      // But max sweepable = 350 - 200 (reserve) = 150
      // So sweep amount = min(110, 150) = 110
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(true);
      expect(decision.amount).toBe(110);
    });

    it('should not sweep if it would violate reserve limit', async () => {
      mockAPI.setFuturesBalance(200); // Exactly at reserve limit
      manager.setTargetAllocation(100);
      
      // Sweep trigger level = 100 * 1.2 = 120
      // Balance 200 > 120, so excess = 80
      // But max sweepable = 200 - 200 = 0
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(false);
    });

    it('should return correct futures balance and target allocation', async () => {
      mockAPI.setFuturesBalance(1500);
      manager.setTargetAllocation(1000);
      
      const decision = await manager.checkSweepConditions();
      expect(decision.futuresBalance).toBe(1500);
      expect(decision.targetAllocation).toBe(1000);
    });
  });

  describe('executeSweep', () => {
    beforeEach(() => {
      mockAPI.setFuturesBalance(1500);
      manager.setTargetAllocation(1000);
    });

    it('should execute sweep successfully', async () => {
      const result = await manager.executeSweep(300);
      
      expect(result.success).toBe(true);
      expect(result.amount).toBe(300);
      expect(result.transactionId).toBeDefined();
    });

    it('should reject invalid sweep amount', async () => {
      const result = await manager.executeSweep(0);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sweep amount');
    });

    it('should reject negative sweep amount', async () => {
      const result = await manager.executeSweep(-100);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sweep amount');
    });

    it('should reject sweep that violates reserve limit (Property 5)', async () => {
      mockAPI.setFuturesBalance(300);
      
      // Trying to sweep 200 would leave only 100, below reserve of 200
      const result = await manager.executeSweep(200);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('reserve limit');
    });

    it('should update total swept on success (Property 4)', async () => {
      const initialSwept = manager.getTotalSwept();
      
      await manager.executeSweep(100);
      expect(manager.getTotalSwept()).toBe(initialSwept + 100);
      
      await manager.executeSweep(50);
      expect(manager.getTotalSwept()).toBe(initialSwept + 150);
    });

    it('should retry on failure (Requirement 4.8)', async () => {
      mockAPI.setTransferShouldFail(true, 2); // Fail first 2 attempts
      
      const result = await manager.executeSweep(100);
      
      // Should succeed on 3rd attempt
      expect(result.success).toBe(true);
    });

    it('should fail after max retries', async () => {
      mockAPI.setTransferShouldFail(true, 10); // Fail all attempts
      
      const result = await manager.executeSweep(100);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('failed after');
    });
  });


  describe('getTreasuryStatus', () => {
    it('should return correct treasury status', async () => {
      mockAPI.setFuturesBalance(1500);
      mockAPI.setSpotBalance(500);
      await manager.updateHighWatermark(2000);
      await manager.executeSweep(100);
      
      const status = await manager.getTreasuryStatus();
      
      expect(status.futuresWallet).toBe(1400); // 1500 - 100
      expect(status.spotWallet).toBe(600); // 500 + 100
      expect(status.highWatermark).toBe(2000);
      expect(status.totalSwept).toBe(100);
      expect(status.lockedProfit).toBe(100);
      expect(status.riskCapital).toBe(1400);
    });
  });

  describe('getNextSweepTriggerLevel', () => {
    it('should calculate correct trigger level', () => {
      manager.setTargetAllocation(1000);
      
      // Trigger level = 1000 * 1.2 = 1200
      expect(manager.getNextSweepTriggerLevel()).toBe(1200);
    });

    it('should update when target allocation changes', () => {
      manager.setTargetAllocation(500);
      expect(manager.getNextSweepTriggerLevel()).toBe(600);
      
      manager.setTargetAllocation(2000);
      expect(manager.getNextSweepTriggerLevel()).toBe(2400);
    });
  });

  describe('shouldTriggerSweepOnEquityIncrease', () => {
    it('should return true for > 10% increase', () => {
      expect(manager.shouldTriggerSweepOnEquityIncrease(1000, 1150)).toBe(true);
      expect(manager.shouldTriggerSweepOnEquityIncrease(1000, 1200)).toBe(true);
    });

    it('should return false for <= 10% increase', () => {
      expect(manager.shouldTriggerSweepOnEquityIncrease(1000, 1100)).toBe(false);
      expect(manager.shouldTriggerSweepOnEquityIncrease(1000, 1050)).toBe(false);
    });

    it('should return false for decrease', () => {
      expect(manager.shouldTriggerSweepOnEquityIncrease(1000, 900)).toBe(false);
    });

    it('should handle zero previous equity', () => {
      expect(manager.shouldTriggerSweepOnEquityIncrease(0, 100)).toBe(false);
    });

    it('should handle negative previous equity', () => {
      expect(manager.shouldTriggerSweepOnEquityIncrease(-100, 100)).toBe(false);
    });
  });

  describe('performSweepIfNeeded', () => {
    it('should perform sweep when conditions are met', async () => {
      mockAPI.setFuturesBalance(1500);
      manager.setTargetAllocation(1000);
      
      const result = await manager.performSweepIfNeeded();
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it('should return null when conditions are not met', async () => {
      mockAPI.setFuturesBalance(1100);
      manager.setTargetAllocation(1000);
      
      const result = await manager.performSweepIfNeeded();
      
      expect(result).toBeNull();
    });
  });

  describe('getReserveLimit', () => {
    it('should return configured reserve limit', () => {
      expect(manager.getReserveLimit()).toBe(200);
    });
  });

  describe('edge cases', () => {
    it('should handle zero target allocation', async () => {
      manager.setTargetAllocation(0);
      mockAPI.setFuturesBalance(500);
      
      const decision = await manager.checkSweepConditions();
      // With 0 target, trigger level is 0, so any balance triggers sweep
      // But reserve limit still applies
      expect(decision.shouldSweep).toBe(true);
      expect(decision.amount).toBe(300); // 500 - 200 reserve
    });

    it('should handle very large balances', async () => {
      mockAPI.setFuturesBalance(1000000);
      manager.setTargetAllocation(500000);
      
      const decision = await manager.checkSweepConditions();
      expect(decision.shouldSweep).toBe(true);
      // Excess = 1000000 - (500000 * 1.2) = 1000000 - 600000 = 400000
      expect(decision.amount).toBe(400000);
    });

    it('should handle balance exactly at reserve limit', async () => {
      mockAPI.setFuturesBalance(200);
      manager.setTargetAllocation(100);
      
      const decision = await manager.checkSweepConditions();
      // Can't sweep anything without violating reserve
      expect(decision.shouldSweep).toBe(false);
    });
  });
});
