import { HologramState, POI, SessionState } from '../types';

/**
 * Encapsulates the mutable state of the Hunter Application.
 * This class is a singleton-like state container to isolate mutations
 * and allow the main application class to be cleaner.
 */
/* eslint-disable functional/immutable-data */
export class HunterStateManager {
  // Application Lifecycle State
  private _isRunning = false;
  private _isPaused = false;
  private _headlessMode = false;

  // Trading State
  private _currentHolograms: HologramState[] = [];
  private _currentSession: SessionState | null = null;
  private _activePOIs: POI[] = [];

  // Timers
  private _timers: Map<string, NodeJS.Timeout> = new Map();

  // Configuration
  constructor(headlessMode = false) {
    this._headlessMode = headlessMode;
  }

  // Getters
  public get isRunning(): boolean {
    return this._isRunning;
  }
  public get isPaused(): boolean {
    return this._isPaused;
  }
  public get headlessMode(): boolean {
    return this._headlessMode;
  }
  public get currentHolograms(): HologramState[] {
    return this._currentHolograms;
  }
  public get currentSession(): SessionState | null {
    return this._currentSession;
  }
  public get activePOIs(): POI[] {
    return this._activePOIs;
  }

  // State Modifiers
  public setRunning(isRunning: boolean): void {
    this._isRunning = isRunning;
  }

  public togglePause(): boolean {
    this._isPaused = !this._isPaused;
    return this._isPaused;
  }

  public updateHolograms(holograms: HologramState[]): void {
    this._currentHolograms = holograms;
  }

  public updateSession(session: SessionState): void {
    this._currentSession = session;
  }

  public updatePOIs(pois: POI[]): void {
    this._activePOIs = pois;
  }

  public setHeadlessMode(headless: boolean): void {
    this._headlessMode = headless;
  }

  // Timer Management
  public setTimer(key: string, timer: NodeJS.Timeout): void {
    this.clearTimer(key);
    this._timers.set(key, timer);
  }

  public clearTimer(key: string): void {
    if (this._timers.has(key)) {
      clearInterval(this._timers.get(key));
      this._timers.delete(key);
    }
  }

  public clearAllTimers(): void {
    for (const key of this._timers.keys()) {
      this.clearTimer(key);
    }
  }
}
