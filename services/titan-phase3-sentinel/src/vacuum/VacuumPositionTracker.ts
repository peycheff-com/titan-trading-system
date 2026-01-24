import type { VacuumPosition } from '../types/signals.js';

/**
 * Tracks lifecycle of Vacuum Arbitrage positions
 */
export class VacuumPositionTracker {
  private positions: Map<string, VacuumPosition>; // symbol -> position

  constructor() {
    this.positions = new Map();
  }

  addPosition(position: VacuumPosition): void {
    // eslint-disable-next-line functional/immutable-data
    this.positions.set(position.symbol, position);
  }

  getPosition(symbol: string): VacuumPosition | undefined {
    return this.positions.get(symbol);
  }

  removePosition(symbol: string): void {
    // eslint-disable-next-line functional/immutable-data
    this.positions.delete(symbol);
  }

  /**
   * Check if position should be closed
   */
  shouldClose(symbol: string, currentBasis: number): boolean {
    const pos = this.positions.get(symbol);
    if (!pos) return false;

    // Simple convergence check
    // If we entered at -0.01 (Vacuum), target might be 0 or -0.001.
    // If currentBasis >= pos.targetBasis -> Close

    // Need to know direction. Entry basis tells us direction usually.
    // Negative Entry Basis -> Long Perp -> Close when Basis increases (converges to 0)
    // Positive Entry Basis -> Short Perp -> Close when Basis decreases (converges to 0)

    if (pos.entryBasis < 0) {
      // Long Position
      return currentBasis >= pos.targetBasis;
    } else {
      // Short Position
      return currentBasis <= pos.targetBasis;
    }
  }
}
