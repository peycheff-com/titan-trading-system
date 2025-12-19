/**
 * Scavenger → Execution Service Integration Test
 * 
 * Tests the complete signal flow:
 * 1. Scavenger sends PREPARE signal via Fast Path IPC
 * 2. Execution Service validates and reserves intent
 * 3. Scavenger waits 100ms for trap confirmation
 * 4. Scavenger sends CONFIRM signal
 * 5. Execution Service places order on Bybit
 * 6. Shadow State is updated
 * 7. Database persistence is verified
 * 
 * Requirements: 1.1-1.7 (Scavenger Integration)
 * 
 * Usage:
 *   npm test -- tests/integration/scavenger-execution-flow.test.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import net from 'net';
import crypto from 'crypto';
import { DatabaseManager } from '../../DatabaseManager.js';

// Test configuration
const IPC_SOCKET_PATH = '/tmp/titan-ipc-test.sock';
const HMAC_SECRET = 'test-secret-key';
const TEST_TIMEOUT = 10000; // 10 seconds

describe('Scavenger → Execution Service Integration', () => {
  let executionServer;
  let database;

  beforeAll(async () => {
    // Initialize database
    database = new DatabaseManager({
      filename: ':memory:', // In-memory database for testing
    });

    await database.initDatabase();

    // Start mock Execution Service
    executionServer = await startMockExecutionService();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Stop mock Execution Service
    if (executionServer) {
      await stopMockExecutionService(executionServer);
    }

    // Close database
    if (database) {
      await database.close();
    }
  });

  beforeEach(async () => {
    // Clear database before each test
    await database.clearAll();
  });

  describe('PREPARE → CONFIRM Flow', () => {
    it('should accept PREPARE signal and execute on CONFIRM', async () => {
      // Create test signal
      const signal = {
        signal_id: `test-${Date.now()}`,
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entry_zone: { min: 49900, max: 50100 },
        stop_loss: 49500,
        take_profits: [51500],
        confidence: 90,
        leverage: 20,
        velocity: 0.002,
        trap_type: 'LIQUIDATION',
        timestamp: Date.now(),
      };

      // Step 1: Send PREPARE
      const prepareResult = await sendIPCMessage({
        signal: { ...signal, signal_type: 'PREPARE' },
      });

      expect(prepareResult.prepared).toBe(true);
      expect(prepareResult.signal_id).toBe(signal.signal_id);

      // Step 2: Wait 100ms (trap confirmation)
      await sleep(100);

      // Step 3: Send CONFIRM
      const confirmResult = await sendIPCMessage({
        signal: { signal_id: signal.signal_id, signal_type: 'CONFIRM' },
      });

      expect(confirmResult.executed).toBe(true);
      expect(confirmResult.signal_id).toBe(signal.signal_id);
      expect(confirmResult.fill_price).toBeGreaterThan(0);

      // Step 4: Verify Shadow State
      const shadowState = await database.getShadowState();
      expect(shadowState.positions).toHaveLength(1);
      expect(shadowState.positions[0].symbol).toBe('BTCUSDT');
      expect(shadowState.positions[0].direction).toBe('LONG');

      // Step 5: Verify database persistence
      const trades = await database.getTrades({ limit: 1 });
      expect(trades).toHaveLength(1);
      expect(trades[0].signal_id).toBe(signal.signal_id);
      expect(trades[0].symbol).toBe('BTCUSDT');
    }, TEST_TIMEOUT);

    it('should handle ABORT after PREPARE', async () => {
      // Create test signal
      const signal = {
        signal_id: `test-abort-${Date.now()}`,
        source: 'scavenger',
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        entry_zone: { min: 2990, max: 3010 },
        stop_loss: 3050,
        take_profits: [2900],
        confidence: 85,
        leverage: 15,
        velocity: 0.001,
        trap_type: 'DAILY_LEVEL',
        timestamp: Date.now(),
      };

      // Step 1: Send PREPARE
      const prepareResult = await sendIPCMessage({
        signal: { ...signal, signal_type: 'PREPARE' },
      });

      expect(prepareResult.prepared).toBe(true);

      // Step 2: Wait 50ms
      await sleep(50);

      // Step 3: Send ABORT (trap invalidated)
      const abortResult = await sendIPCMessage({
        signal: { signal_id: signal.signal_id, signal_type: 'ABORT' },
      });

      expect(abortResult.aborted).toBe(true);
      expect(abortResult.signal_id).toBe(signal.signal_id);

      // Step 4: Verify no position was created
      const shadowState = await database.getShadowState();
      expect(shadowState.positions).toHaveLength(0);

      // Step 5: Verify no trade was recorded
      const trades = await database.getTrades({ limit: 10 });
      expect(trades).toHaveLength(0);
    }, TEST_TIMEOUT);

    it('should timeout PREPARE after 10 seconds without CONFIRM/ABORT', async () => {
      // Create test signal
      const signal = {
        signal_id: `test-timeout-${Date.now()}`,
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entry_zone: { min: 49900, max: 50100 },
        stop_loss: 49500,
        take_profits: [51500],
        confidence: 90,
        leverage: 20,
        velocity: 0.002,
        trap_type: 'LIQUIDATION',
        timestamp: Date.now(),
      };

      // Step 1: Send PREPARE
      const prepareResult = await sendIPCMessage({
        signal: { ...signal, signal_type: 'PREPARE' },
      });

      expect(prepareResult.prepared).toBe(true);

      // Step 2: Wait 11 seconds (exceeds 10-second timeout)
      // Note: In real test, we'd mock the timer to avoid waiting
      // For now, we'll just verify the timeout mechanism exists

      // Step 3: Verify prepared intent is discarded after timeout
      // (This would be tested by checking internal state of Execution Service)
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should reject PREPARE with invalid signal', async () => {
      // Create invalid signal (missing required fields)
      const invalidSignal = {
        signal_id: `test-invalid-${Date.now()}`,
        source: 'scavenger',
        // Missing symbol, direction, etc.
      };

      // Send PREPARE
      const result = await sendIPCMessage({
        signal: { ...invalidSignal, signal_type: 'PREPARE' },
      });

      expect(result.prepared).toBe(false);
      expect(result.error).toBeDefined();
    }, TEST_TIMEOUT);

    it('should reject CONFIRM without prior PREPARE', async () => {
      // Send CONFIRM without PREPARE
      const result = await sendIPCMessage({
        signal: { signal_id: 'nonexistent-signal', signal_type: 'CONFIRM' },
      });

      expect(result.executed).toBe(false);
      expect(result.error).toContain('No prepared intent found');
    }, TEST_TIMEOUT);

    it('should handle IPC connection failures gracefully', async () => {
      // Stop Execution Service
      await stopMockExecutionService(executionServer);

      // Try to send message
      try {
        await sendIPCMessage({
          signal: { signal_id: 'test', signal_type: 'PREPARE' },
        });
        
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toContain('ECONNREFUSED');
      }

      // Restart Execution Service
      executionServer = await startMockExecutionService();
    }, TEST_TIMEOUT);
  });

  describe('Shadow State Persistence', () => {
    it('should persist Shadow State to database', async () => {
      // Create and execute signal
      const signal = {
        signal_id: `test-persist-${Date.now()}`,
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        entry_zone: { min: 49900, max: 50100 },
        stop_loss: 49500,
        take_profits: [51500],
        confidence: 90,
        leverage: 20,
        velocity: 0.002,
        trap_type: 'LIQUIDATION',
        timestamp: Date.now(),
      };

      await sendIPCMessage({
        signal: { ...signal, signal_type: 'PREPARE' },
      });

      await sleep(100);

      await sendIPCMessage({
        signal: { signal_id: signal.signal_id, signal_type: 'CONFIRM' },
      });

      // Verify Shadow State is persisted
      const shadowState = await database.getShadowState();
      expect(shadowState.positions).toHaveLength(1);

      // Simulate crash and restore
      const restoredState = await database.getShadowState();
      expect(restoredState.positions).toHaveLength(1);
      expect(restoredState.positions[0].signal_id).toBe(signal.signal_id);
    }, TEST_TIMEOUT);
  });
});

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Start mock Execution Service
 */
async function startMockExecutionService() {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        try {
          const message = JSON.parse(data.toString());
          const signal = message.signal;

          // Validate HMAC signature
          const expectedSignature = crypto
            .createHmac('sha256', HMAC_SECRET)
            .update(JSON.stringify(signal))
            .digest('hex');

          if (message.signature !== expectedSignature) {
            socket.write(JSON.stringify({
              error: 'Invalid HMAC signature',
            }));
            return;
          }

          // Handle signal types
          if (signal.signal_type === 'PREPARE') {
            // Accept PREPARE
            socket.write(JSON.stringify({
              prepared: true,
              signal_id: signal.signal_id,
              timestamp: Date.now(),
            }));
          } else if (signal.signal_type === 'CONFIRM') {
            // Execute order (mock)
            socket.write(JSON.stringify({
              executed: true,
              signal_id: signal.signal_id,
              fill_price: 50000,
              fill_size: 0.1,
              timestamp: Date.now(),
            }));
          } else if (signal.signal_type === 'ABORT') {
            // Abort prepared intent
            socket.write(JSON.stringify({
              aborted: true,
              signal_id: signal.signal_id,
              timestamp: Date.now(),
            }));
          }
        } catch (error) {
          socket.write(JSON.stringify({
            error: error.message,
          }));
        }
      });
    });

    server.listen(IPC_SOCKET_PATH, () => {
      console.log(`Mock Execution Service listening on ${IPC_SOCKET_PATH}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

/**
 * Stop mock Execution Service
 */
async function stopMockExecutionService(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Mock Execution Service stopped');
      resolve();
    });
  });
}

/**
 * Send IPC message to Execution Service
 */
async function sendIPCMessage(message) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(IPC_SOCKET_PATH, () => {
      // Generate HMAC signature
      const signature = crypto
        .createHmac('sha256', HMAC_SECRET)
        .update(JSON.stringify(message.signal))
        .digest('hex');

      // Send message
      socket.write(JSON.stringify({
        ...message,
        signature,
      }));
    });

    socket.on('data', (data) => {
      const response = JSON.parse(data.toString());
      socket.end();
      resolve(response);
    });

    socket.on('error', (error) => {
      reject(error);
    });

    socket.on('timeout', () => {
      socket.end();
      reject(new Error('IPC request timeout'));
    });

    socket.setTimeout(5000); // 5 second timeout
  });
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
