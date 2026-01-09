import { CONSTANTS } from '../utils/constants.js';

/**
 * Handles configuration updates with proper error handling and component reinitialization
 */
export class ConfigUpdateHandler {
  constructor({ 
    container, 
    loggerAdapter, 
    initializeBrokerAdapter, 
    createBrokerGateway 
  }) {
    this.container = container;
    this.logger = loggerAdapter;
    this.initializeBrokerAdapter = initializeBrokerAdapter;
    this.createBrokerGateway = createBrokerGateway;
  }

  /**
   * Handle configuration update event
   * @param {Object} update - Configuration update details
   */
  async handle(update) {
    this.logger.info({ update }, 'Configuration updated, reinitializing broker');
    
    try {
      const configManager = this.container.get('configManager');
      const currentConfig = await configManager.getConfig();
      
      if (this.#shouldUseLiveBroker(currentConfig)) {
        await this.#initializeLiveBroker();
      } else {
        await this.#initializeMockBroker();
      }

      this.#updateDependentComponents();
      this.#reconnectWebSocketIfNeeded();
      
      this.logger.info('Broker reinitialization completed successfully');
    } catch (error) {
      this.logger.error({ 
        error: error.message, 
        stack: error.stack,
        update 
      }, 'Failed to reinitialize broker');
      
      // Emit error for centralized handling
      throw new Error(`Broker reinitialization failed: ${error.message}`);
    }
  }

  /**
   * Check if live broker should be used
   * @param {Object} config - Current configuration
   * @returns {boolean}
   */
  #shouldUseLiveBroker(config) {
    return config.mode === 'LIVE' && 
           config.broker && 
           process.env.BYBIT_API_KEY && 
           process.env.BYBIT_API_SECRET;
  }

  /**
   * Initialize live broker adapter
   */
  async #initializeLiveBroker() {
    const brokerOptions = {
      useMockBroker: false,
      bybitApiKey: process.env.BYBIT_API_KEY,
      bybitApiSecret: process.env.BYBIT_API_SECRET,
      bybitTestnet: process.env.BYBIT_TESTNET === 'true',
      bybitRateLimit: parseInt(
        process.env.BYBIT_RATE_LIMIT || 
        String(CONSTANTS.DEFAULT_BYBIT_RATE_LIMIT)
      ),
      bybitMaxRetries: parseInt(
        process.env.BYBIT_MAX_RETRIES || 
        String(CONSTANTS.DEFAULT_BYBIT_MAX_RETRIES)
      ),
      bybitCacheTtl: parseInt(
        process.env.BYBIT_CACHE_TTL || 
        String(CONSTANTS.DEFAULT_BYBIT_CACHE_TTL_MS)
      ),
    };

    const { adapter } = this.initializeBrokerAdapter(brokerOptions, this.logger);
    const databaseManager = this.container.get('databaseManager');
    const newBrokerGateway = this.createBrokerGateway(adapter, this.logger, databaseManager);
    
    // Reset and update broker gateway
    this.container.reset('brokerGateway');
    this.container.register('brokerGateway', () => newBrokerGateway);
    
    this.logger.info('Live broker adapter initialized');
  }

  /**
   * Initialize mock broker adapter
   */
  async #initializeMockBroker() {
    const { MockBrokerAdapter } = await import('../BrokerGateway.js');
    const databaseManager = this.container.get('databaseManager');
    const newBrokerGateway = this.createBrokerGateway(
      new MockBrokerAdapter(), 
      this.logger, 
      databaseManager
    );
    
    // Reset and update broker gateway
    this.container.reset('brokerGateway');
    this.container.register('brokerGateway', () => newBrokerGateway);
    
    this.logger.info('Mock broker adapter initialized');
  }

  /**
   * Update components that depend on broker gateway
   */
  #updateDependentComponents() {
    const brokerGateway = this.container.get('brokerGateway');
    
    // Update order manager
    const orderManager = this.container.get('orderManager');
    if (orderManager && typeof orderManager.setBrokerGateway === 'function') {
      orderManager.setBrokerGateway(brokerGateway);
    } else if (orderManager) {
      orderManager.brokerGateway = brokerGateway;
    }

    // Update phase manager
    const phaseManager = this.container.get('phaseManager');
    if (phaseManager && typeof phaseManager.setBrokerGateway === 'function') {
      phaseManager.setBrokerGateway(brokerGateway);
    } else if (phaseManager) {
      phaseManager.brokerGateway = brokerGateway;
    }

    this.logger.debug('Dependent components updated with new broker gateway');
  }

  /**
   * Reconnect WebSocket server if available
   */
  #reconnectWebSocketIfNeeded() {
    try {
      const wsStatus = this.container.get('wsStatus');
      const brokerGateway = this.container.get('brokerGateway');
      
      if (wsStatus && brokerGateway) {
        brokerGateway.setWebSocketServer({
          broadcast: (message) => {
            const data = typeof message === 'string' ? JSON.parse(message) : message;
            wsStatus.broadcast(data);
          },
        });
        
        this.logger.debug('WebSocket server reconnected to broker gateway');
      }
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Failed to reconnect WebSocket server');
    }
  }
}