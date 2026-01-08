/**
 * Property-Based Tests for CapitalFlowManager
 * 
 * Tests universal properties that should hold across all inputs
 */

import * as fc from 'fast-check';
import { CapitalFlowManager, ExchangeWalletAPI } from '../../src/engine/CapitalFlowManager';
import { 
  CapitalFlowConfig,
  SweepResult,
  TreasuryOperation
} from '../../src/types/index';

// Test configuration
const testConfig: CapitalFlowConfig = {
  sweepThreshold: 1.2, // 20% excess triggers sweep
  reserveLimit: 200, // $200 minimum reserve
  sweepSchedule: '0 0 * * *', // Daily at midnight
  maxRetries: 3,
  retryBaseDelay: 1000 // 1 second base delay
};

/**
 * Mock Exchange API for testing
 */
class MockExchangeAPI implements ExchangeWalletAPI {
  private futuresBalance: number = 0;
  private spotBalance: number = 0;
  private shouldFailTransfer: boolean = false;
  private transferCount: number = 0;

  setFuturesBalance(balance: number): void {
    this.futuresBalance = Math.max(0, balance);
  }

  setSpotBalance(balance: number): void {
    this.spotBalance = Math.max(0, balance);
  }

  setShouldFailTransfer(shouldFail: boolean): void {
    this.shouldFailTransfer = shouldFail;
  }

  getTransferCount(): number {
    return this.transferCount;
  }

  resetTransferCount(): void {
    this.transferCount = 0;
  }

  async getFuturesBalance(): Promise<number> {
    return this.futuresBalance;
  }

  async getSpotBalance(): Promise<number> {
    return this.spotBalance;
  }

  async transferToSpot(amount: number): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    this.transferCount++;
    
    if (this.shouldFailTransfer) {
      return {
        success: false,
        error: 'Mock transfer failure'
      };
    }

    if (amount > this.futuresBalance) {
      return {
        success: false,
        error: 'Insufficient futures balance'
      };
    }

    // Simulate successful transfer
    this.futuresBalance -= amount;
    this.spotBalance += amount;

    return {
      success: true,
      transactionId: `mock-tx-${Date.now()}-${this.transferCount}`
    };
  }
}

describe('CapitalFlowManager Property Tests', () => {
  let capitalFlowManager: CapitalFlowManager;
  let mockExchangeAPI: MockExchangeAPI;

  beforeEach(() => {
    mockExchangeAPI = new MockExchangeAPI();
    capitalFlowManager = new CapitalFlowManager(testConfig, undefined, mockExchangeAPI);
  });

  describe('Property 4: Sweep Monotonicity', () => {
    /**
     * **Validates: Requirements 4.4**
     * 
     * For any sequence of successful sweep operations, the total swept amount
     * should only increase (monotonically non-decreasing). This ensures that
     * the profit locking mechanism works correctly and never "loses" swept profits.
     * 
     * Property: totalSwept(t+1) >= totalSwept(t) for all successful sweeps
     */
    it('should ensure total swept amount only increases with successful sweeps', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate a sequence of sweep amounts
          fc.array(
            fc.float({ min: Math.fround(1), max: Math.fround(10000), noNaN: true }),
            { minLength: 1, maxLength: 10 }
          ),
          // Generate initial futures balance
          fc.float({ min: Math.fround(1000), max: Math.fround(50000), noNaN: true }),
          async (sweepAmounts, initialBalance) => {
            // Set up initial state
            mockExchangeAPI.setFuturesBalance(initialBalance);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            let previousTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Execute sequence of sweeps
            for (const sweepAmount of sweepAmounts) {
              // Ensure we have enough balance for the sweep
              const currentBalance = await mockExchangeAPI.getFuturesBalance();
              const adjustedAmount = Math.min(sweepAmount, currentBalance - testConfig.reserveLimit);
              
              if (adjustedAmount > 0) {
                const result = await capitalFlowManager.executeSweep(adjustedAmount);
                
                if (result.success) {
                  const currentTotalSwept = capitalFlowManager.getTotalSwept();
                  
                  // Property: Total swept should only increase
                  expect(currentTotalSwept).toBeGreaterThanOrEqual(previousTotalSwept);
                  
                  // Property: Increase should equal the sweep amount
                  expect(currentTotalSwept - previousTotalSwept).toBeCloseTo(adjustedAmount, 6);
                  
                  previousTotalSwept = currentTotalSwept;
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     * 
     * For any failed sweep operation, the total swept amount should remain unchanged.
     * This ensures that failed operations don't corrupt the accounting.
     * 
     * Property: If sweep fails, totalSwept remains constant
     */
    it('should not change total swept amount on failed sweeps', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
          fc.float({ min: Math.fround(500), max: Math.fround(10000), noNaN: true }),
          async (sweepAmount, initialBalance) => {
            // Set up initial state
            mockExchangeAPI.setFuturesBalance(initialBalance);
            mockExchangeAPI.setShouldFailTransfer(true); // Force failure
            
            const initialTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Execute sweep (should fail)
            const result = await capitalFlowManager.executeSweep(sweepAmount);
            
            const finalTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Property: Failed sweep should not change total swept
            expect(result.success).toBe(false);
            expect(finalTotalSwept).toBe(initialTotalSwept);
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     * 
     * For any sequence of mixed successful and failed sweeps, the total swept
     * amount should only increase by the sum of successful sweep amounts.
     * 
     * Property: totalSwept = sum of all successful sweep amounts
     */
    it('should accumulate only successful sweep amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate sequence of sweep operations with success/failure flags
          fc.array(
            fc.record({
              amount: fc.float({ min: Math.fround(1), max: Math.fround(2000), noNaN: true }),
              shouldSucceed: fc.boolean()
            }),
            { minLength: 2, maxLength: 8 }
          ),
          fc.float({ min: Math.fround(20000), max: Math.fround(100000), noNaN: true }),
          async (operations, initialBalance) => {
            // Set up with large initial balance to avoid balance constraints
            mockExchangeAPI.setFuturesBalance(initialBalance);
            
            const initialTotalSwept = capitalFlowManager.getTotalSwept();
            let expectedTotalSwept = initialTotalSwept;
            
            // Execute sequence of operations
            for (const op of operations) {
              mockExchangeAPI.setShouldFailTransfer(!op.shouldSucceed);
              
              const result = await capitalFlowManager.executeSweep(op.amount);
              
              if (result.success && op.shouldSucceed) {
                expectedTotalSwept += op.amount;
              }
              
              const currentTotalSwept = capitalFlowManager.getTotalSwept();
              
              // Property: Total swept should match expected accumulation
              expect(currentTotalSwept).toBeCloseTo(expectedTotalSwept, 6);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     * 
     * The total swept amount should never decrease, even across multiple
     * manager instances or state resets (monotonicity across time).
     * 
     * Property: totalSwept is monotonically non-decreasing across all operations
     */
    it('should maintain monotonicity across multiple operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
            { minLength: 3, maxLength: 15 }
          ),
          async (sweepAmounts) => {
            // Set up with sufficient balance
            mockExchangeAPI.setFuturesBalance(100000);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            const totalSweptHistory: number[] = [];
            totalSweptHistory.push(capitalFlowManager.getTotalSwept());
            
            // Execute all sweeps and track total swept
            for (const amount of sweepAmounts) {
              const result = await capitalFlowManager.executeSweep(amount);
              
              if (result.success) {
                const currentTotal = capitalFlowManager.getTotalSwept();
                totalSweptHistory.push(currentTotal);
              }
            }
            
            // Property: Each value should be >= previous value (monotonic)
            for (let i = 1; i < totalSweptHistory.length; i++) {
              expect(totalSweptHistory[i]).toBeGreaterThanOrEqual(totalSweptHistory[i - 1]);
            }
            
            // Property: Differences should equal sweep amounts
            let totalExpectedIncrease = 0;
            for (const amount of sweepAmounts) {
              totalExpectedIncrease += amount;
            }
            
            const finalTotal = totalSweptHistory[totalSweptHistory.length - 1];
            const initialTotal = totalSweptHistory[0];
            
            expect(finalTotal - initialTotal).toBeCloseTo(totalExpectedIncrease, 6);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     * 
     * Zero or negative sweep amounts should not affect the total swept amount.
     * This tests edge cases and input validation.
     * 
     * Property: Invalid sweep amounts don't change totalSwept
     */
    it('should not change total swept for invalid sweep amounts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(-10000), max: Math.fround(0), noNaN: true }),
          async (invalidAmount) => {
            mockExchangeAPI.setFuturesBalance(10000);
            
            const initialTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Execute sweep with invalid amount
            const result = await capitalFlowManager.executeSweep(invalidAmount);
            
            const finalTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Property: Invalid amounts should not succeed or change total
            expect(result.success).toBe(false);
            expect(finalTotalSwept).toBe(initialTotalSwept);
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * **Validates: Requirements 4.4**
     * 
     * Concurrent or rapid successive sweeps should maintain monotonicity.
     * This tests the robustness of the monotonicity property under stress.
     * 
     * Property: Rapid successive sweeps maintain monotonicity
     */
    it('should maintain monotonicity under rapid successive operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.float({ min: Math.fround(50), max: Math.fround(1000), noNaN: true }),
            { minLength: 5, maxLength: 20 }
          ),
          async (rapidSweepAmounts) => {
            // Set up with large balance
            mockExchangeAPI.setFuturesBalance(50000);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            const initialTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Execute rapid successive sweeps
            const results = await Promise.all(
              rapidSweepAmounts.map(amount => capitalFlowManager.executeSweep(amount))
            );
            
            const finalTotalSwept = capitalFlowManager.getTotalSwept();
            
            // Property: Total should have increased by sum of successful sweeps
            const successfulSweeps = results.filter(r => r.success);
            const expectedIncrease = successfulSweeps.reduce((sum, r) => sum + r.amount, 0);
            
            expect(finalTotalSwept).toBeGreaterThanOrEqual(initialTotalSwept);
            expect(finalTotalSwept - initialTotalSwept).toBeCloseTo(expectedIncrease, 6);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Sweep Amount Calculation Properties', () => {
    /**
     * Property: Sweep amount should never exceed available balance minus reserve
     */
    it('should never sweep more than available balance minus reserve', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(500), max: Math.fround(20000), noNaN: true }),
          fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
          async (futuresBalance, sweepAmount) => {
            mockExchangeAPI.setFuturesBalance(futuresBalance);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            const result = await capitalFlowManager.executeSweep(sweepAmount);
            
            if (result.success) {
              // Property: Successful sweep should not violate reserve limit
              const remainingBalance = futuresBalance - result.amount;
              expect(remainingBalance).toBeGreaterThanOrEqual(testConfig.reserveLimit);
            } else if (sweepAmount > 0) {
              // Property: If sweep failed due to reserve limit, remaining would be < reserve
              const wouldRemain = futuresBalance - sweepAmount;
              if (wouldRemain < testConfig.reserveLimit) {
                expect(result.error).toContain('reserve limit');
              }
            }
          }
        ),
        { numRuns: 300 }
      );
    });

    /**
     * Property: Sweep decisions should be consistent with balance and thresholds
     */
    it('should make consistent sweep decisions based on balance and thresholds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(1000), max: Math.fround(50000), noNaN: true }),
          fc.float({ min: Math.fround(500), max: Math.fround(20000), noNaN: true }),
          async (futuresBalance, targetAllocation) => {
            mockExchangeAPI.setFuturesBalance(futuresBalance);
            capitalFlowManager.setTargetAllocation(targetAllocation);
            
            const decision = await capitalFlowManager.checkSweepConditions();
            const sweepTriggerLevel = targetAllocation * testConfig.sweepThreshold;
            
            // Property: Should sweep if and only if balance exceeds trigger level
            if (futuresBalance > sweepTriggerLevel) {
              const maxSweepable = futuresBalance - testConfig.reserveLimit;
              if (maxSweepable > 0) {
                expect(decision.shouldSweep).toBe(true);
                expect(decision.amount).toBeGreaterThan(0);
                expect(decision.amount).toBeLessThanOrEqual(maxSweepable);
              } else {
                expect(decision.shouldSweep).toBe(false);
              }
            } else {
              expect(decision.shouldSweep).toBe(false);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  describe('Balance Consistency Properties', () => {
    /**
     * Property: Futures balance should decrease by exactly the sweep amount on success
     */
    it('should decrease futures balance by exactly the sweep amount', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(2000), max: Math.fround(20000), noNaN: true }),
          fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
          async (initialBalance, sweepAmount) => {
            mockExchangeAPI.setFuturesBalance(initialBalance);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            const initialFuturesBalance = await mockExchangeAPI.getFuturesBalance();
            
            const result = await capitalFlowManager.executeSweep(sweepAmount);
            
            if (result.success) {
              const finalFuturesBalance = await mockExchangeAPI.getFuturesBalance();
              
              // Property: Futures balance should decrease by sweep amount
              expect(initialFuturesBalance - finalFuturesBalance).toBeCloseTo(result.amount, 6);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    /**
     * Property: Total balance (futures + spot) should remain constant after sweep
     */
    it('should preserve total balance across wallets during sweep', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: Math.fround(2000), max: Math.fround(20000), noNaN: true }),
          fc.float({ min: Math.fround(1000), max: Math.fround(10000), noNaN: true }),
          fc.float({ min: Math.fround(100), max: Math.fround(3000), noNaN: true }),
          async (initialFutures, initialSpot, sweepAmount) => {
            mockExchangeAPI.setFuturesBalance(initialFutures);
            mockExchangeAPI.setSpotBalance(initialSpot);
            mockExchangeAPI.setShouldFailTransfer(false);
            
            const initialTotal = initialFutures + initialSpot;
            
            const result = await capitalFlowManager.executeSweep(sweepAmount);
            
            if (result.success) {
              const finalFutures = await mockExchangeAPI.getFuturesBalance();
              const finalSpot = await mockExchangeAPI.getSpotBalance();
              const finalTotal = finalFutures + finalSpot;
              
              // Property: Total balance should be preserved
              expect(finalTotal).toBeCloseTo(initialTotal, 6);
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});