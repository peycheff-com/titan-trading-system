/**
 * Binance Exchange Adapter (Stub)
 * 
 * Implements BrokerAdapter interface for Binance exchange.
 * Currently a placeholder for future implementation.
 * 
 * @module BinanceAdapter
 */

export class BinanceAdapter {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.logger.warn('BinanceAdapter is a stub. Functionality is not yet implemented.');
  }

  async healthCheck() {
    return {
      success: false,
      exchange: 'BINANCE',
      error: 'Not Implemented',
      timestamp: new Date().toISOString()
    };
  }

  async sendOrder() {
    throw new Error('BinanceAdapter: sendOrder not implemented');
  }

  async getAccount() {
    throw new Error('BinanceAdapter: getAccount not implemented');
  }

  async getPositions() {
    return [];
  }

  async cancelOrder() {
    throw new Error('BinanceAdapter: cancelOrder not implemented');
  }
}
