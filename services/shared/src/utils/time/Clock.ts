export interface Clock {
  now(): number;
  date(): Date;
  setTimeout(callback: () => void, ms: number): any;
  clearTimeout(timeoutId: any): void;
  setInterval(callback: () => void, ms: number): any;
  clearInterval(intervalId: any): void;
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  date(): Date {
    return new Date();
  }

  setTimeout(callback: () => void, ms: number): any {
    return setTimeout(callback, ms);
  }

  clearTimeout(timeoutId: any): void {
    clearTimeout(timeoutId);
  }

  setInterval(callback: () => void, ms: number): any {
    return setInterval(callback, ms);
  }

  clearInterval(intervalId: any): void {
    clearInterval(intervalId);
  }
}

export class BacktestClock implements Clock {
  private currentTime: number;
  private timers: Map<
    number,
    {
      callback: () => void;
      dueTime: number;
      type: 'timeout' | 'interval';
      intervalMs?: number;
    }
  > = new Map();
  private nextTimerId: number = 1;

  constructor(startTime: number) {
    this.currentTime = startTime;
  }

  now(): number {
    return this.currentTime;
  }

  date(): Date {
    return new Date(this.currentTime);
  }

  setTime(time: number) {
    if (time < this.currentTime) {
      throw new Error('Cannot move time backwards');
    }
    // eslint-disable-next-line functional/immutable-data
    this.currentTime = time;
    this.processTimers();
  }

  advance(ms: number) {
    this.setTime(this.currentTime + ms);
  }

  setTimeout(callback: () => void, ms: number): any {
    // eslint-disable-next-line functional/immutable-data
    const id = this.nextTimerId++;
    // eslint-disable-next-line functional/immutable-data
    this.timers.set(id, {
      callback,
      dueTime: this.currentTime + ms,
      type: 'timeout',
    });
    return id;
  }

  clearTimeout(timeoutId: any): void {
    // eslint-disable-next-line functional/immutable-data
    this.timers.delete(timeoutId);
  }

  setInterval(callback: () => void, ms: number): any {
    // eslint-disable-next-line functional/immutable-data
    const id = this.nextTimerId++;
    // eslint-disable-next-line functional/immutable-data
    this.timers.set(id, {
      callback,
      dueTime: this.currentTime + ms,
      type: 'interval',
      intervalMs: ms,
    });
    return id;
  }

  clearInterval(intervalId: any): void {
    // eslint-disable-next-line functional/immutable-data
    this.timers.delete(intervalId);
  }

  private processTimers() {
    // Simple implementation: process all timers due at or before currentTime
    // In a real priority queue, this would be more efficient.
    const executableTimers = Array.from(this.timers.entries())
      .filter(([_, timer]) => timer.dueTime <= this.currentTime)
      .sort((a, b) => a[1].dueTime - b[1].dueTime);

    for (const [id, timer] of executableTimers) {
      // For now, just execute. Backtesting usually drives by tick, so precise timer firing order strictly by time is assumed.
      timer.callback();

      if (timer.type === 'timeout') {
        // eslint-disable-next-line functional/immutable-data
        this.timers.delete(id);
      } else if (timer.type === 'interval' && timer.intervalMs) {
        // eslint-disable-next-line functional/immutable-data
        timer.dueTime += timer.intervalMs;
        // Re-check if it needs to fire again immediately if we advanced a lot?
        // For simplicity, we assume we advance in small steps or handle this loop gracefully in a full implementation.
      }
    }
  }
}
