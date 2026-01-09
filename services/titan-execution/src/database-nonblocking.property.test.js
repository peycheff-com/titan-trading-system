/**
 * Property-Based Test: Database Write Non-Blocking
 * 
 * Feature: titan-regime-engine, Property 82: Database write non-blocking
 * 
 * Property: For any database write failure during order execution, the system SHALL log 
 * the error but SHALL NOT block the order from being sent to the broker.
 * 
 * Validates: Requirements 97.9
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';
import { ShadowState } from './ShadowState.js';

describe('Property 82: Database write non-blocking', () => {
  let brokerGateway;
  let shadowState;
  let mockAdapter;

  beforeEach(() => {
    mockAdapter = new MockBrokerAdapter();
  });

  afterEach(() => {
    if (brokerGateway) {
      brokerGateway.destroy();
    }
    if (shadowState) {
      shadowState.destroy();
    }
  });

  describe('BrokerGateway - Order execution with database failure', () => {
    it('should not block order execution when database write fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            symbol: fc.constantFrom('BTCUSDT', 'ETHUSDT', 'SOLUSDT'),
            side: fc.constantFrom('BUY', 'SELL'),
            size: fc.double({ min: 0.01, max: 10, noNaN: true }),
            limit_price: fc.double({ min: 100, max: 100000, noNaN: true }),
          }),
          fc.string({ minLength: 10, maxLength: 50 }),
          async (orderParams, signalId) => {
            const failingDbManager = {
              insertTrade: async () => {
                throw new Error('Database connection failed');
              },
            };

            brokerGateway = new BrokerGateway({
              adapter: mockAdapter,
              databaseManager: failingDbManager,
            });

            const result = await brokerGateway.sendOrder(signalId, orderParams);

            expect(result.success).toBe(true);
            expect(result.filled).toBe(true);
            expect(result.broker_order_id).toBeDefined();

            const brokerPositions = await mockAdapter.getPositions();
            expect(brokerPositions.length).toBeGreaterThan(0);

            mockAdapter.reset();
            brokerGateway.destroy();
            brokerGateway = null;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('ShadowState - Position management with database failure', () => {
    it('should not block position opening when database write fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            symbol: fc.constantFrom('BTCUSDT', 'ETHUSDT'),
            direction: fc.constantFrom(1, -1),
            size: fc.double({ min: 0.01, max: 10, noNaN: true }),
            fill_price: fc.double({ min: 100, max: 100000, noNaN: true }),
          }),
          fc.string({ minLength: 10, maxLength: 50 }),
          async (intentParams, signalId) => {
            const failingDbManager = {
              insertPosition: async () => {
                throw new Error('Database connection failed');
              },
            };

            shadowState = new ShadowState({
              databaseManager: failingDbManager,
            });

            const intent = {
              signal_id: signalId,
              symbol: intentParams.symbol,
              direction: intentParams.direction,
              size: intentParams.size,
            };

            shadowState.processIntent(intent);

            const brokerResponse = {
              broker_order_id: `BROKER_${Date.now()}`,
              fill_price: intentParams.fill_price,
              fill_size: intentParams.size,
              filled: true,
              status: 'FILLED',
            };

            const position = shadowState.confirmExecution(signalId, brokerResponse);

            expect(position).not.toBeNull();
            expect(position.symbol).toBe(intentParams.symbol);
            expect(shadowState.hasPosition(intentParams.symbol)).toBe(true);

            shadowState.destroy();
            shadowState = null;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should not block position closing when database write fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('BTCUSDT', 'ETHUSDT'),
          fc.double({ min: 0.1, max: 5, noNaN: true }),
          fc.double({ min: 1000, max: 50000, noNaN: true }),
          fc.double({ min: 1000, max: 50000, noNaN: true }),
          fc.constantFrom('MANUAL', 'TP1', 'SL'),
          async (symbol, size, entryPrice, exitPrice, closeReason) => {
            const failingDbManager = {
              insertPosition: async () => {
                throw new Error('Database connection failed');
              },
              closePosition: async () => {
                throw new Error('Database connection failed');
              },
            };

            shadowState = new ShadowState({
              databaseManager: failingDbManager,
            });

            shadowState.processIntent({
              signal_id: 'signal_open',
              symbol,
              direction: 1,
              size,
            });

            shadowState.confirmExecution('signal_open', {
              broker_order_id: 'BROKER_OPEN',
              fill_price: entryPrice,
              fill_size: size,
              filled: true,
              status: 'FILLED',
            });

            const tradeRecord = shadowState.closePosition(symbol, exitPrice, closeReason);

            expect(tradeRecord).not.toBeNull();
            expect(tradeRecord.symbol).toBe(symbol);
            expect(shadowState.hasPosition(symbol)).toBe(false);

            const expectedPnl = (exitPrice - entryPrice) * size;
            expect(tradeRecord.pnl).toBeCloseTo(expectedPnl, 2);

            shadowState.destroy();
            shadowState = null;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
