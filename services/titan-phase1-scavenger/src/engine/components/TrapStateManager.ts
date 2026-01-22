import { Tripwire } from '../../types/index.js';

export interface VolumeCounter {
  count: number;
  buyVolume: number;
  sellVolume: number;
  startTime: number;
}

/**
 * TrapStateManager
 *
 * Manages the shared state for the TitanTrap engine.
 * - Trap storage (active tripwires)
 * - Volume counters (for detection)
 * - Price cache (for validation)
 * - Anti-gaming state (timeouts, blacklists)
 */
export class TrapStateManager {
  // Trap storage
  private trapMap: Map<string, Tripwire[]> = new Map();
  private volumeCounters: Map<string, VolumeCounter> = new Map();
  private latestPrices: Map<string, number> = new Map();

  // Anti-Gaming State
  private lastActivationTime: Map<string, number> = new Map();
  private failedAttempts: Map<string, number> = new Map();
  private blacklistedUntil: Map<string, number> = new Map();

  getTrapMap(): Map<string, Tripwire[]> {
    return this.trapMap;
  }

  setTrapMap(map: Map<string, Tripwire[]>): void {
    this.trapMap = map;
  }

  getTraps(symbol: string): Tripwire[] | undefined {
    return this.trapMap.get(symbol);
  }

  setTraps(symbol: string, traps: Tripwire[]): void {
    this.trapMap.set(symbol, traps);
  }

  getAllSymbols(): string[] {
    return Array.from(this.trapMap.keys());
  }

  clearTraps(): void {
    this.trapMap.clear();
  }

  // Volume Counters
  getVolumeCounter(symbol: string): VolumeCounter | undefined {
    return this.volumeCounters.get(symbol);
  }

  setVolumeCounter(symbol: string, counter: VolumeCounter): void {
    this.volumeCounters.set(symbol, counter);
  }

  deleteVolumeCounter(symbol: string): void {
    this.volumeCounters.delete(symbol);
  }

  // Price Cache
  getLatestPrice(symbol: string): number | undefined {
    return this.latestPrices.get(symbol);
  }

  setLatestPrice(symbol: string, price: number): void {
    this.latestPrices.set(symbol, price);
  }

  // Anti-Gaming
  getLastActivationTime(symbol: string): number {
    return this.lastActivationTime.get(symbol) || 0;
  }

  setLastActivationTime(symbol: string, time: number): void {
    this.lastActivationTime.set(symbol, time);
  }

  getFailedAttempts(symbol: string): number {
    return this.failedAttempts.get(symbol) || 0;
  }

  incrementFailedAttempts(symbol: string): number {
    const current = this.getFailedAttempts(symbol);
    this.failedAttempts.set(symbol, current + 1);
    return current + 1;
  }

  resetFailedAttempts(symbol: string): void {
    this.failedAttempts.set(symbol, 0);
  }

  getBlacklistedUntil(symbol: string): number | undefined {
    return this.blacklistedUntil.get(symbol);
  }

  blacklistSymbol(symbol: string, until: number): void {
    this.blacklistedUntil.set(symbol, until);
  }

  isBlacklisted(symbol: string): boolean {
    const until = this.blacklistedUntil.get(symbol);
    return !!until && Date.now() < until;
  }
}
