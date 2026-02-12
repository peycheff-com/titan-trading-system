import { ShippingGate, GateConfig } from '../src/gate/ShippingGate';
import { BacktestResult } from '../src/types';

describe('ShippingGate', () => {
  const defaultGateConfig: GateConfig = {
    maxDrawdown: 0.20,
    minSharpe: 1.5,
    minSortino: 2.0,
    minCalmar: 1.0,
    tailRiskCap: 0.05,
  };

  const makeMockResult = (overrides: Partial<BacktestResult['metrics']> = {}): BacktestResult => ({
    metrics: {
      totalReturn: 0.25,
      maxDrawdown: 0.10,
      sharpeRatio: 2.0,
      winRate: 0.65,
      tradesCount: 100,
      ...overrides,
    },
    trades: [],
    equityCurve: [],
    logs: [],
  });

  let gate: ShippingGate;

  beforeEach(() => {
    gate = new ShippingGate(defaultGateConfig);
  });

  describe('Hard Gate: Max Drawdown Limit', () => {
    it('should pass when drawdown is below limit', () => {
      const baseline = makeMockResult({ maxDrawdown: 0.15 });
      const proposed = makeMockResult({ maxDrawdown: 0.15 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
    });

    it('should reject when drawdown exceeds limit', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult({ maxDrawdown: 0.25 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
      expect(report.rejectionReason).toContain('Max Drawdown');
      expect(report.rejectionReason).toContain('exceeds limit');
    });

    it('should reject at exact drawdown limit boundary', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult({ maxDrawdown: 0.201 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
    });

    it('should pass at exact drawdown limit when baseline matches', () => {
      const baseline = makeMockResult({ maxDrawdown: 0.20 });
      const proposed = makeMockResult({ maxDrawdown: 0.20 });
      const report = gate.evaluate(baseline, proposed);
      // maxDrawdown 0.20 is NOT > 0.20, and no degradation since baseline matches
      expect(report.passed).toBe(true);
    });
  });

  describe('Hard Gate: Degradation Check', () => {
    it('should pass when proposed drawdown is not degraded', () => {
      const baseline = makeMockResult({ maxDrawdown: 0.10 });
      const proposed = makeMockResult({ maxDrawdown: 0.10 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
    });

    it('should reject when drawdown degrades by more than 10% relative', () => {
      const baseline = makeMockResult({ maxDrawdown: 0.10 });
      const proposed = makeMockResult({ maxDrawdown: 0.12 }); // 20% relative increase
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
      expect(report.rejectionReason).toContain('degraded');
    });

    it('should pass when drawdown degrades within 10% relative', () => {
      const baseline = makeMockResult({ maxDrawdown: 0.10 });
      const proposed = makeMockResult({ maxDrawdown: 0.109 }); // 9% relative increase
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
    });
  });

  describe('Soft Gate: Sharpe Ratio', () => {
    it('should pass when Sharpe is above minimum', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult({ sharpeRatio: 2.0 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
    });

    it('should reject when Sharpe is below minimum', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult({ sharpeRatio: 1.0 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
      expect(report.rejectionReason).toContain('Sharpe Ratio');
      expect(report.rejectionReason).toContain('below minimum');
    });
  });

  describe('Hard Gate: Tail Risk Cap', () => {
    it('should reject when max single day loss exceeds tail risk cap', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult() as any;
      proposed.maxSingleDayLoss = 0.08; // exceeds 0.05 cap
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
      expect(report.rejectionReason).toContain('Max Single Day Loss');
    });

    it('should pass when no tail risk cap is set', () => {
      const gateNoCap = new ShippingGate({
        maxDrawdown: 0.20,
        minSharpe: 1.5,
        minSortino: 2.0,
        minCalmar: 1.0,
      });
      const baseline = makeMockResult();
      const proposed = makeMockResult() as any;
      proposed.maxSingleDayLoss = 0.10;
      const report = gateNoCap.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
    });
  });

  describe('Full validation pipeline', () => {
    it('should pass a fully compliant proposed result', () => {
      const baseline = makeMockResult();
      const proposed = makeMockResult();
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(true);
      expect(report.rejectionReason).toBeUndefined();
      expect(report.metrics).toBe(proposed);
    });

    it('should check gates in order: drawdown -> degradation -> tail risk -> sharpe', () => {
      // Trigger drawdown first (should return drawdown rejection, not sharpe)
      const baseline = makeMockResult();
      const proposed = makeMockResult({ maxDrawdown: 0.30, sharpeRatio: 0.5 });
      const report = gate.evaluate(baseline, proposed);
      expect(report.passed).toBe(false);
      expect(report.rejectionReason).toContain('Max Drawdown');
      // NOT sharpe — drawdown gate fires first
    });
  });
});
