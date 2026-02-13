/**
 * Golden Path Integration Test
 *
 * Validates the core trading signal flow through the Brain:
 *   Phase Signal → Risk Check → Allocation → Intent published to Execution
 *
 * Uses mocked NatsClient to capture publishEnvelope calls.
 * No running infrastructure required.
 */

import { SignalProcessor } from '../../src/engine/SignalProcessor';
import { RiskGuardian } from '../../src/features/Risk/RiskGuardian';
import { AllocationEngine } from '../../src/features/Allocation/AllocationEngine';
import { PerformanceTracker } from '../../src/engine/PerformanceTracker';
import { BrainStateManager } from '../../src/engine/BrainStateManager';
import { CircuitBreaker } from '../../src/engine/CircuitBreaker';
import { GovernanceEngine } from '../../src/features/Governance/GovernanceEngine';
import { BayesianCalibrator } from '../../src/features/Risk/BayesianCalibrator';
import { EquityTier, IntentSignal, RiskGuardianConfig } from '../../src/types/index';

// ─── Mock NatsClient ──────────────────────────────────────────────────────────

const publishEnvelopeMock = jest.fn().mockResolvedValue(undefined);
const publishMock = jest.fn().mockResolvedValue(undefined);
const subscribeMock = jest.fn();

jest.mock('@titan/shared', () => {
  const actual = jest.requireActual('@titan/shared');

  // Must be a real class since Brain's Logger extends SharedLogger
  class MockLogger {
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    debug = jest.fn();
    fatal = jest.fn();
    static getInstance() {
      return new MockLogger();
    }
    static createConfigFromEnv() {
      return {};
    }
  }

  return {
    ...actual,
    getNatsClient: () => ({
      isConnected: () => true,
      connect: jest.fn().mockResolvedValue(undefined),
      publishEnvelope: publishEnvelopeMock,
      publish: publishMock,
      subscribe: subscribeMock,
    }),
    Logger: MockLogger,
  };
});

// ─── Mock Redis for BayesianCalibrator ────────────────────────────────────────

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
} as any;

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_EQUITY = 10_000; // $10k — activates Phase 1 + Phase 2

const riskGuardianConfig: RiskGuardianConfig = {
  // From RiskPolicyV1
  maxAccountLeverage: 10,
  maxPositionNotional: 5_000,
  maxDailyLoss: -500,
  maxOpenOrdersPerSymbol: 3,
  symbolWhitelist: ['BTC_USDT', 'ETH_USDT'],
  maxSlippageBps: 50,
  maxStalenessMs: 30_000,
  maxCorrelation: 0.8,
  correlationPenalty: 0.5,
  minConfidenceScore: 0.3,
  minStopDistanceMultiplier: 1.0,
  features: {
    disableTruthGating: true,
  },
  version: 1,
  lastUpdated: Date.now(),
  // Brain-specific extensions
  betaUpdateInterval: 60_000,
  correlationUpdateInterval: 300_000,
  confidence: {
    decayRate: 0.01,
    recoveryRate: 0.005,
    threshold: 0.3,
  },
  fractal: {
    phase1: { maxLeverage: 5, maxDrawdown: 0.1, maxAllocation: 0.5 },
    phase2: { maxLeverage: 10, maxDrawdown: 0.15, maxAllocation: 0.8 },
    phase3: { maxLeverage: 3, maxDrawdown: 0.05, maxAllocation: 0.5 },
  },
};

function createValidSignal(overrides?: Partial<IntentSignal>): IntentSignal {
  return {
    signalId: 'test-signal-001',
    phaseId: 'phase1',
    symbol: 'BTC/USDT',
    side: 'BUY',
    requestedSize: 500,
    timestamp: Date.now(),
    leverage: 2,
    entryPrice: 40_000,
    stopLossPrice: 39_000,
    targetPrice: 42_000,
    confidence: 80,
    type: 'MANUAL',
    ...overrides,
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Golden Path: Signal → Brain → Execution Intent', () => {
  let signalProcessor: SignalProcessor;
  let stateManager: BrainStateManager;
  let circuitBreaker: CircuitBreaker;
  let allocationEngine: AllocationEngine;
  let riskGuardian: RiskGuardian;
  let performanceTracker: PerformanceTracker;

  beforeEach(() => {
    jest.clearAllMocks();

    // Allocation: $10k equity → Phase 1 (20%) + Phase 2 (80%)
    allocationEngine = new AllocationEngine({
      transitionPoints: { startP2: 1_500, fullP2: 5_000, startP3: 25_000 },
      leverageCaps: {
        [EquityTier.MICRO]: 3,
        [EquityTier.SMALL]: 5,
        [EquityTier.MEDIUM]: 10,
        [EquityTier.LARGE]: 15,
        [EquityTier.INSTITUTIONAL]: 20,
      },
    });

    const governanceEngine = new GovernanceEngine();
    const bayesianCalibrator = new BayesianCalibrator(mockRedis);

    riskGuardian = new RiskGuardian(
      riskGuardianConfig,
      allocationEngine,
      governanceEngine,
      bayesianCalibrator,
    );
    riskGuardian.setEquity(TEST_EQUITY);

    performanceTracker = new PerformanceTracker(
      {
        windowDays: 30,
        minTradeCount: 5,
        malusMultiplier: 0.5,
        bonusMultiplier: 1.2,
        malusThreshold: 0,
        bonusThreshold: 2.0,
      },
      undefined, // No DB for this test
    );

    circuitBreaker = new CircuitBreaker({
      maxDailyDrawdown: 0.15,
      minEquity: 100,
      consecutiveLossLimit: 5,
      consecutiveLossWindow: 3_600_000,
      cooldownMinutes: 30,
    });

    stateManager = new BrainStateManager();
    stateManager.setEquity(TEST_EQUITY);
    stateManager.setArmed(true);

    signalProcessor = new SignalProcessor(
      riskGuardian,
      allocationEngine,
      performanceTracker,
      stateManager,
      circuitBreaker,
    );
  });

  // ─── Happy Path ──────────────────────────────────────────────────────────

  it('should approve a valid signal and publish HMAC-signed intent to execution', async () => {
    const signal = createValidSignal();
    const decision = await signalProcessor.processSignal(signal);

    // 1. Decision approved
    expect(decision.approved).toBe(true);
    expect(decision.signalId).toBe('test-signal-001');
    expect(decision.authorizedSize).toBeGreaterThan(0);

    // 2. publishEnvelope called with correct subject pattern
    expect(publishEnvelopeMock).toHaveBeenCalledTimes(1);
    const [subject, payload, meta] = publishEnvelopeMock.mock.calls[0];

    expect(subject).toMatch(/^titan\.cmd\.execution\.place\.v1\./);
    expect(subject).toContain('BTC_USDT');

    // 3. Payload contains correct fields
    expect(payload).toMatchObject({
      schema_version: '1.0.0',
      signal_id: 'test-signal-001',
      source: 'brain',
      symbol: 'BTC/USDT',
      direction: 1, // BUY
      type: 'BUY_SETUP',
      stop_loss: 39_000,
      status: 'PENDING',
    });

    // 4. Policy hash is present and non-empty
    expect(typeof payload.policy_hash).toBe('string');
    expect(payload.policy_hash.length).toBeGreaterThan(0);

    // 5. Entry zone is an array
    expect(Array.isArray(payload.entry_zone)).toBe(true);
    expect(payload.entry_zone[0]).toBe(40_000);

    // 6. Envelope metadata
    expect(meta.producer).toBe('brain');
    expect(meta.correlation_id).toBe('test-signal-001');

    // 7. Brain decision event published
    expect(publishMock).toHaveBeenCalled();
    const decisionPayload = publishMock.mock.calls[0][1];
    expect(decisionPayload.approved).toBe(true);
  });

  it('should map SELL signals correctly (direction = -1)', async () => {
    const signal = createValidSignal({ side: 'SELL', signalId: 'sell-001' });
    const decision = await signalProcessor.processSignal(signal);

    expect(decision.approved).toBe(true);
    const [, payload] = publishEnvelopeMock.mock.calls[0];
    expect(payload.direction).toBe(-1);
    expect(payload.type).toBe('SELL_SETUP');
  });

  // ─── Circuit Breaker Rejection ───────────────────────────────────────────

  it('should reject signal when circuit breaker is active', async () => {
    // Trigger hard breaker directly
    await circuitBreaker.trigger('Test: equity below minimum');

    const signal = createValidSignal({ signalId: 'breaker-reject-001' });
    const decision = await signalProcessor.processSignal(signal);

    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain('Circuit breaker');
    expect(decision.authorizedSize).toBe(0);

    // No intent should be published to execution
    expect(publishEnvelopeMock).not.toHaveBeenCalled();
  });

  // ─── Disarmed Rejection ──────────────────────────────────────────────────

  it('should reject signal when system is disarmed', async () => {
    stateManager.setArmed(false);

    const signal = createValidSignal({ signalId: 'disarmed-001' });
    const decision = await signalProcessor.processSignal(signal);

    expect(decision.approved).toBe(false);
    expect(decision.reason).toContain('Disarmed');
    expect(decision.authorizedSize).toBe(0);
    expect(publishEnvelopeMock).not.toHaveBeenCalled();
  });

  // ─── Size Capping ────────────────────────────────────────────────────────

  it('should cap signal size by phase allocation weight', async () => {
    // With $10k equity and Phase 1 weight = ~0.2 (Phase 1 is 20% at $10k)
    // Max signal size = $10k * 0.2 = $2,000
    const signal = createValidSignal({
      signalId: 'cap-001',
      phaseId: 'phase1',
      requestedSize: 5_000, // Over the Phase 1 allocation cap
    });

    const decision = await signalProcessor.processSignal(signal);

    expect(decision.approved).toBe(true);
    // Size should be capped to Phase 1 allocation (20% of $10k = $2,000)
    expect(decision.authorizedSize).toBeLessThanOrEqual(2_000);
    expect(decision.authorizedSize).toBeGreaterThan(0);
  });

  // ─── Policy Hash Consistency ─────────────────────────────────────────────

  it('should include consistent policy_hash across multiple signals', async () => {
    const signal1 = createValidSignal({ signalId: 'hash-check-1' });
    const signal2 = createValidSignal({ signalId: 'hash-check-2', side: 'SELL' });

    await signalProcessor.processSignal(signal1);
    await signalProcessor.processSignal(signal2);

    expect(publishEnvelopeMock).toHaveBeenCalledTimes(2);
    const hash1 = publishEnvelopeMock.mock.calls[0][1].policy_hash;
    const hash2 = publishEnvelopeMock.mock.calls[1][1].policy_hash;

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
  });
});
