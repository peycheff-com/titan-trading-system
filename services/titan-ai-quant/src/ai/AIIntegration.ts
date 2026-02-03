import { EventEmitter } from 'events';
import { TitanAnalyst } from './TitanAnalyst';
import { OHLCV, RegimeSnapshot, Trade } from '../types';
import { PredictiveAnalytics } from './PredictiveAnalytics';
import { RealTimeOptimizer } from './RealTimeOptimizer';

export interface AIIntegrationConfig {
  strategySelectionInterval: number;
  riskAdjustmentInterval: number;
  performanceEvaluationInterval: number;
  enableAutomatedStrategySelection: boolean;
  enableAdaptiveRiskManagement: boolean;
}

export class AIIntegration extends EventEmitter {
  private predictiveAnalytics: PredictiveAnalytics;
  private realTimeOptimizer: RealTimeOptimizer;
  private config: AIIntegrationConfig;

  constructor(analyst: TitanAnalyst, config: AIIntegrationConfig) {
    super();
    this.config = config;
    this.predictiveAnalytics = new PredictiveAnalytics({});
    this.realTimeOptimizer = new RealTimeOptimizer(analyst, {});
  }

  start() {
    this.emit('started');
    this.predictiveAnalytics.start();
    this.realTimeOptimizer.start();
  }

  stop() {
    this.predictiveAnalytics.stop();
    this.realTimeOptimizer.stop();
    this.emit('stopped');
  }

  shutdown() {
    this.stop();
  }

  addMarketData(symbol: string, data: OHLCV[]) {
    this.emit('marketDataAdded');
    this.predictiveAnalytics.processMarketData(symbol, data);
  }

  addRegimeSnapshot(_snapshot: RegimeSnapshot) {
    this.emit('regimeSnapshotAdded');
  }

  addTrade(_trade: Trade) {
    this.emit('tradeAdded');
  }

  getStatus() {
    return {
      performanceScore: 80, // Stub
      realTimeOptimizer: this.realTimeOptimizer.getStats(),
      predictiveAnalytics: this.predictiveAnalytics.getStats(),
    };
  }

  private selectOptimalStrategies(
    _symbol: string,
    _regime: unknown,
    predictions: Array<{ strategy: string; confidence: number }>,
  ) {
    // Stub implementation for property test
    const selectedStrategies = predictions.map((p) => ({
      strategy: p.strategy,
      allocation: 0.2, // Stub allocation
      confidence: p.confidence,
    }));
    return {
      selectedStrategies,
      totalAllocation: selectedStrategies.reduce(
        (sum: number, s: { allocation: number }) => sum + s.allocation,
        0,
      ),
    };
  }

  private evaluatePerformance() {
    // Stub implementation
    this.emit('performanceEvaluated');
  }
}
