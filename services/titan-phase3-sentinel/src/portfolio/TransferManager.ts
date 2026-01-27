import type { IExchangeGateway } from '../exchanges/interfaces.js';

/**
 * Manages capital transfers between accounts (Spot <-> Margin/Perp)
 */
export class TransferManager {
  private gateway: IExchangeGateway;

  constructor(gateway: IExchangeGateway) {
    this.gateway = gateway;
  }

  /**
   * Transfer funds between Spot and Perp wallets.
   * note: implementation depends heavily on exchange API.
   * This is a logical abstraction.
   */
  async transfer(amount: number, from: 'SPOT' | 'PERP', to: 'SPOT' | 'PERP'): Promise<boolean> {
    if (amount <= 0) return false;
    if (from === to) return true;

    console.log(`[TransferManager] Transferring ${amount} USD from ${from} to ${to}`);

    // In reality: await this.gateway.transfer(...)
    // For now, assume success
    return true;
  }

  /**
   * Execute a top-up transfer from Spot to Perp
   */
  async executeTopUp(symbol: string, amount: number): Promise<boolean> {
    // In a real implementation, we would check spot balance first
    return this.transfer(amount, 'SPOT', 'PERP');
  }
}
