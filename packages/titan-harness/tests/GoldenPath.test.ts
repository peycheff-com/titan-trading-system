/**
 * GoldenPath Unit Tests
 *
 * Tests the GoldenPath harness logic with mocked NATS client.
 * Since GoldenPath depends on NATS for real integration testing,
 * these unit tests verify the internal logic (latency stats, rejection stats)
 * and basic structural behavior.
 */

import { GoldenPath, LatencyStats, RejectionEvent } from '../src/GoldenPath';

// Mock the @titan/shared NATS client
jest.mock('@titan/shared', () => ({
  getNatsClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    publish: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true),
  })),
  TITAN_SUBJECTS: {
    CMD: { EXECUTION: { ALL: 'titan.cmd.execution.>', PREFIX: 'titan.cmd.execution' } },
    EVT: { EXECUTION: { REJECT: 'titan.evt.execution.reject' } },
    SIGNAL: { SUBMIT: 'titan.signal.submit' },
  },
}));

describe('GoldenPath', () => {
  let harness: GoldenPath;

  beforeEach(() => {
    jest.clearAllMocks();
    harness = new GoldenPath({ natsUrl: 'nats://localhost:4222' });
  });

  afterEach(async () => {
    await harness.stop();
  });

  describe('initialization', () => {
    it('should create a GoldenPath instance', () => {
      expect(harness).toBeTruthy();
    });

    it('should start and stop without errors', async () => {
      await harness.start();
      await harness.stop();
    });

    it('should be idempotent on repeated start calls', async () => {
      await harness.start();
      await harness.start(); // Should not throw
      await harness.stop();
    });
  });

  describe('getLatencyStats', () => {
    it('should return zero stats when no samples exist', () => {
      const stats: LatencyStats = harness.getLatencyStats();
      expect(stats.p50).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.p99).toBe(0);
      expect(stats.samples).toEqual([]);
    });
  });

  describe('getRejectionStats', () => {
    it('should return zero stats when no rejections exist', () => {
      const stats = harness.getRejectionStats();
      expect(stats.total).toBe(0);
      expect(stats.byReason).toEqual({});
    });
  });

  describe('runScenario', () => {
    it('should timeout if no execution intent is received', async () => {
      await harness.start();

      // runScenario publishes a signal and waits 5s for an intent
      // Since NATS is mocked and nothing responds, it should timeout
      await expect(
        harness.runScenario('BTCUSDT', 'BUY', 1.0),
      ).rejects.toThrow('Timeout');
    }, 10000);
  });
});
