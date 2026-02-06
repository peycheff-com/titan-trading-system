export class SystemClock {
    now() {
        return Date.now();
    }
    date() {
        return new Date();
    }
    setTimeout(callback, ms) {
        return setTimeout(callback, ms);
    }
    clearTimeout(timeoutId) {
        clearTimeout(timeoutId);
    }
    setInterval(callback, ms) {
        return setInterval(callback, ms);
    }
    clearInterval(intervalId) {
        clearInterval(intervalId);
    }
}
export class BacktestClock {
    currentTime;
    timers = new Map();
    nextTimerId = 1;
    constructor(startTime) {
        this.currentTime = startTime;
    }
    now() {
        return this.currentTime;
    }
    date() {
        return new Date(this.currentTime);
    }
    setTime(time) {
        if (time < this.currentTime) {
            throw new Error('Cannot move time backwards');
        }
        // eslint-disable-next-line functional/immutable-data
        this.currentTime = time;
        this.processTimers();
    }
    advance(ms) {
        this.setTime(this.currentTime + ms);
    }
    setTimeout(callback, ms) {
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
    clearTimeout(timeoutId) {
        // eslint-disable-next-line functional/immutable-data
        this.timers.delete(timeoutId);
    }
    setInterval(callback, ms) {
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
    clearInterval(intervalId) {
        // eslint-disable-next-line functional/immutable-data
        this.timers.delete(intervalId);
    }
    processTimers() {
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
            }
            else if (timer.type === 'interval' && timer.intervalMs) {
                // eslint-disable-next-line functional/immutable-data
                timer.dueTime += timer.intervalMs;
                // Re-check if it needs to fire again immediately if we advanced a lot?
                // For simplicity, we assume we advance in small steps or handle this loop gracefully in a full implementation.
            }
        }
    }
}
//# sourceMappingURL=Clock.js.map