import { EventEmitter } from 'events';

/**
 * Handles abort signals and coordination for complex execution tasks
 */
export class AbortHandler extends EventEmitter {
  private controller: AbortController;
  private _isAborted: boolean = false;

  constructor() {
    super();
    this.controller = new AbortController();
  }

  /**
   * Signal an abort
   */
  abort(reason?: string): void {
    if (this._isAborted) return;

    // eslint-disable-next-line functional/immutable-data
    this._isAborted = true;
    this.controller.abort(reason);
    this.emit('abort', reason);
  }

  /**
   * Check if aborted
   */
  get isAborted(): boolean {
    return this._isAborted;
  }

  /**
   * Get the signal
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Reset the handler (create new controller)
   */
  reset(): void {
    // eslint-disable-next-line functional/immutable-data
    this.controller = new AbortController();
    // eslint-disable-next-line functional/immutable-data
    this._isAborted = false;
  }
}
