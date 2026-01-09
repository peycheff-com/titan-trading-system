import { CONSTANTS } from '../utils/constants.js';

/**
 * Optimized metrics service with change detection and batching
 */
export class MetricsService {
  constructor({ container, loggerAdapter, metrics }) {
    this.container = container;
    this.logger = loggerAdapter;
    this.metrics = metrics;
    
    // Cache for change detection
    this.cache = {
      equity: null,
      positionCount: 0,
      totalLeverage: 0,
      drawdown: 0,
      healthStatus: new Map(),
    };
    
    this.updateInterval = null;
    this.isRunning = false;
  }

  /**
   * Start periodic metrics updates with change detection
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('Metrics service already running');
      return;
    }

    this.updateInterval = setInterval(async () => {
      try {
        await this.updateMetrics();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Failed to update metrics');
      }
    }, CONSTANTS.METRICS_UPDATE_INTERVAL_MS);

    this.isRunning = true;
    this.logger.info(
      `Periodic metrics updates started (${CONSTANTS.METRICS_UPDATE_INTERVAL_MS}ms interval)`
    );
  }

  /**
   * Stop periodic metrics updates
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.isRunning = false;
    this.logger.info('Metrics updates stopped');
  }

  /**
   * Update all metrics with change detection
   */
  async updateMetrics() {
    const updates = [];

    // Update equity (only if changed)
    const equity = await this.#updateEquityMetric();
    if (equity !== null) updates.push('equity');

    // Update position metrics
    const positionUpdates = await this.#updatePositionMetrics();
    updates.push(...positionUpdates);

    // Update drawdown
    const drawdownUpdated = await this.#updateDrawdownMetric();
    if (drawdownUpdated) updates.push('drawdown');

    // Update health status
    const healthUpdates = await this.#updateHealthMetrics();
    updates.push(...healthUpdates);

    if (updates.length > 0) {
      this.logger.debug({ updates }, 'Metrics updated');
    }
  }

  /**
   * Update equity metric with change detection
   * @returns {number|null} New equity value or null if unchanged
   */
  async #updateEquityMetric() {
    try {
      const phaseManager = this.container.get('phaseManager');
      const equity = phaseManager.getLastKnownEquity();
      
      if (equity !== null && equity !== this.cache.equity) {
        this.metrics.updateEquity(equity);
        this.cache.equity = equity;
        return equity;
      }
    } catch (error) {
      this.logger.debug({ error: error.message }, 'Failed to update equity metric');
    }
    
    return null;
  }

  /**
   * Update position-related metrics
   * @returns {string[]} Array of updated metric names
   */
  async #updatePositionMetrics() {
    const updates = [];
    
    try {
      const shadowState = this.container.get('shadowState');
      const positions = shadowState.getAllPositions();
      
      // Update position count
      if (positions.size !== this.cache.positionCount) {
        this.metrics.updateActivePositions(positions.size);
        this.cache.positionCount = positions.size;
        updates.push('positionCount');
      }

      // Update individual position PnL and calculate total leverage
      let totalLeverage = 0;
      const equity = this.cache.equity || 1; // Avoid division by zero
      
      for (const [symbol, position] of positions) {
        const pnl = position.unrealized_pnl || 0;
        this.metrics.updatePositionPnl(symbol, position.side, pnl);
        totalLeverage += (position.size * position.entry_price) / equity;
      }

      // Update total leverage if changed significantly (avoid noise)
      const leverageDiff = Math.abs(totalLeverage - this.cache.totalLeverage);
      if (leverageDiff > 0.01) { // 1% threshold
        this.metrics.updateTotalLeverage(totalLeverage);
        this.cache.totalLeverage = totalLeverage;
        updates.push('totalLeverage');
      }
    } catch (error) {
      this.logger.debug({ error: error.message }, 'Failed to update position metrics');
    }
    
    return updates;
  }

  /**
   * Update drawdown metric
   * @returns {boolean} True if updated
   */
  async #updateDrawdownMetric() {
    try {
      const shadowState = this.container.get('shadowState');
      const pnlStats = shadowState.calculatePnLStats(1);
      
      if (pnlStats.max_drawdown_pct !== undefined) {
        const drawdown = Math.abs(pnlStats.max_drawdown_pct);
        const drawdownDiff = Math.abs(drawdown - this.cache.drawdown);
        
        if (drawdownDiff > 0.001) { // 0.1% threshold
          this.metrics.updateDrawdown(drawdown);
          this.cache.drawdown = drawdown;
          return true;
        }
      }
    } catch (error) {
      this.logger.debug({ error: error.message }, 'Failed to update drawdown metric');
    }
    
    return false;
  }

  /**
   * Update health status metrics
   * @returns {string[]} Array of updated health components
   */
  async #updateHealthMetrics() {
    const updates = [];
    
    try {
      const healthChecks = [
        { name: 'websocket', check: () => this.#checkWebSocketHealth() },
        { name: 'database', check: () => this.#checkDatabaseHealth() },
        { name: 'broker', check: () => this.#checkBrokerHealth() },
      ];

      for (const { name, check } of healthChecks) {
        try {
          const isHealthy = await check();
          const previousStatus = this.cache.healthStatus.get(name);
          
          if (isHealthy !== previousStatus) {
            this.metrics.updateHealth(name, isHealthy);
            this.cache.healthStatus.set(name, isHealthy);
            updates.push(`health:${name}`);
          }
        } catch (error) {
          this.logger.debug({ 
            component: name, 
            error: error.message 
          }, 'Health check failed');
          
          // Mark as unhealthy if check throws
          const previousStatus = this.cache.healthStatus.get(name);
          if (previousStatus !== false) {
            this.metrics.updateHealth(name, false);
            this.cache.healthStatus.set(name, false);
            updates.push(`health:${name}`);
          }
        }
      }
    } catch (error) {
      this.logger.debug({ error: error.message }, 'Failed to update health metrics');
    }
    
    return updates;
  }

  /**
   * Check WebSocket health
   * @returns {boolean}
   */
  async #checkWebSocketHealth() {
    const wsCache = this.container.get('wsCache');
    return wsCache?.isConnected() || false;
  }

  /**
   * Check database health
   * @returns {boolean}
   */
  async #checkDatabaseHealth() {
    const databaseManager = this.container.get('databaseManager');
    return databaseManager.isConnected();
  }

  /**
   * Check broker health
   * @returns {boolean}
   */
  async #checkBrokerHealth() {
    const brokerGateway = this.container.get('brokerGateway');
    return brokerGateway.isHealthy();
  }

  /**
   * Get current metrics cache (for debugging)
   * @returns {Object}
   */
  getCache() {
    return {
      ...this.cache,
      healthStatus: Object.fromEntries(this.cache.healthStatus),
    };
  }

  /**
   * Force update all metrics (bypass change detection)
   */
  async forceUpdate() {
    // Clear cache to force updates
    this.cache = {
      equity: null,
      positionCount: 0,
      totalLeverage: 0,
      drawdown: 0,
      healthStatus: new Map(),
    };
    
    await this.updateMetrics();
    this.logger.info('Forced metrics update completed');
  }
}