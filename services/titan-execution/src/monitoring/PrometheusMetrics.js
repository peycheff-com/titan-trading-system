/**
 * Prometheus Metrics for Titan Execution Service
 * 
 * Exports metrics for monitoring system performance and health.
 * 
 * Requirements: 6.1-6.7
 * 
 * Metrics:
 * - titan_signals_total: Counter for signals processed
 * - titan_order_latency_seconds: Histogram for order execution latency
 * - titan_position_pnl_usd: Gauge for position P&L
 * - titan_equity_usd: Gauge for account equity
 * - titan_health_status: Gauge for system health (1=healthy, 0=unhealthy)
 * - titan_order_fill_rate: Gauge for order fill rate percentage
 * - titan_drawdown_percent: Gauge for current drawdown percentage
 */

import promClient from 'prom-client';

export class PrometheusMetrics {
  constructor() {
    // Create a Registry
    this.register = new promClient.Registry();
    
    // Add default metrics (CPU, memory, event loop lag, etc.)
    promClient.collectDefaultMetrics({ 
      register: this.register,
      prefix: 'titan_'
    });
    
    /**
     * Property 25: Metrics Recording Completeness
     * For any signal processed, corresponding metric should be incremented with correct labels
     */
    this.signalCounter = new promClient.Counter({
      name: 'titan_signals_total',
      help: 'Total number of signals processed by source and result',
      labelNames: ['source', 'result'], // source: scavenger/hunter/sentinel, result: accepted/rejected/executed/failed
      registers: [this.register]
    });
    
    /**
     * Property 26: Order Latency Recording
     * For any order execution, latency should be recorded in histogram metric
     */
    this.orderLatencyHistogram = new promClient.Histogram({
      name: 'titan_order_latency_seconds',
      help: 'Order execution latency from signal to fill',
      buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // 1ms to 10s
      registers: [this.register]
    });
    
    this.positionPnlGauge = new promClient.Gauge({
      name: 'titan_position_pnl_usd',
      help: 'Current position P&L in USD by symbol',
      labelNames: ['symbol', 'direction'],
      registers: [this.register]
    });
    
    this.equityGauge = new promClient.Gauge({
      name: 'titan_equity_usd',
      help: 'Current account equity in USD',
      registers: [this.register]
    });
    
    this.healthGauge = new promClient.Gauge({
      name: 'titan_health_status',
      help: 'System health status by component (1=healthy, 0=unhealthy)',
      labelNames: ['component'], // websocket, database, ipc, broker
      registers: [this.register]
    });
    
    this.orderFillRateGauge = new promClient.Gauge({
      name: 'titan_order_fill_rate',
      help: 'Order fill rate percentage (0-100)',
      registers: [this.register]
    });
    
    this.drawdownGauge = new promClient.Gauge({
      name: 'titan_drawdown_percent',
      help: 'Current drawdown percentage from peak equity',
      registers: [this.register]
    });
    
    this.activePositionsGauge = new promClient.Gauge({
      name: 'titan_active_positions',
      help: 'Number of currently active positions',
      registers: [this.register]
    });
    
    this.totalLeverageGauge = new promClient.Gauge({
      name: 'titan_total_leverage',
      help: 'Total leverage across all positions',
      registers: [this.register]
    });
    
    // Initialize health status for all components
    this.updateHealth('websocket', true);
    this.updateHealth('database', true);
    this.updateHealth('ipc', true);
    this.updateHealth('broker', true);
  }
  
  /**
   * Record signal processing
   * @param {string} source - Signal source (scavenger, hunter, sentinel)
   * @param {string} result - Processing result (accepted, rejected, executed, failed)
   */
  recordSignal(source, result) {
    this.signalCounter.inc({ source, result });
  }
  
  /**
   * Record order execution latency
   * @param {number} latencySeconds - Latency in seconds
   */
  recordOrderLatency(latencySeconds) {
    this.orderLatencyHistogram.observe(latencySeconds);
  }
  
  /**
   * Update position P&L
   * @param {string} symbol - Trading symbol
   * @param {string} direction - Position direction (LONG/SHORT)
   * @param {number} pnl - Profit/Loss in USD
   */
  updatePositionPnl(symbol, direction, pnl) {
    this.positionPnlGauge.set({ symbol, direction }, pnl);
  }
  
  /**
   * Clear position P&L (when position is closed)
   * @param {string} symbol - Trading symbol
   * @param {string} direction - Position direction
   */
  clearPositionPnl(symbol, direction) {
    this.positionPnlGauge.remove({ symbol, direction });
  }
  
  /**
   * Update account equity
   * @param {number} equity - Current equity in USD
   */
  updateEquity(equity) {
    this.equityGauge.set(equity);
  }
  
  /**
   * Update system health status
   * @param {string} component - Component name (websocket, database, ipc, broker)
   * @param {boolean} isHealthy - Health status
   */
  updateHealth(component, isHealthy) {
    this.healthGauge.set({ component }, isHealthy ? 1 : 0);
  }
  
  /**
   * Update order fill rate
   * @param {number} fillRate - Fill rate percentage (0-100)
   */
  updateOrderFillRate(fillRate) {
    this.orderFillRateGauge.set(fillRate);
  }
  
  /**
   * Update drawdown percentage
   * @param {number} drawdownPercent - Drawdown percentage from peak
   */
  updateDrawdown(drawdownPercent) {
    this.drawdownGauge.set(drawdownPercent);
  }
  
  /**
   * Update active positions count
   * @param {number} count - Number of active positions
   */
  updateActivePositions(count) {
    this.activePositionsGauge.set(count);
  }
  
  /**
   * Update total leverage
   * @param {number} leverage - Total leverage across all positions
   */
  updateTotalLeverage(leverage) {
    this.totalLeverageGauge.set(leverage);
  }
  
  /**
   * Get metrics in Prometheus text format
   * @returns {Promise<string>} Metrics in Prometheus format
   */
  async getMetrics() {
    return await this.register.metrics();
  }
  
  /**
   * Get metrics as JSON (for debugging)
   * @returns {Promise<Object>} Metrics as JSON
   */
  async getMetricsJSON() {
    return await this.register.getMetricsAsJSON();
  }
  
  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.register.resetMetrics();
  }
}

// Singleton instance
let metricsInstance = null;

/**
 * Get or create Prometheus metrics instance
 * @returns {PrometheusMetrics}
 */
export function getMetrics() {
  if (!metricsInstance) {
    metricsInstance = new PrometheusMetrics();
  }
  return metricsInstance;
}
