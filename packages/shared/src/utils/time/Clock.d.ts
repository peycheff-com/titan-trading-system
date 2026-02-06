export interface Clock {
    now(): number;
    date(): Date;
    setTimeout(callback: () => void, ms: number): any;
    clearTimeout(timeoutId: any): void;
    setInterval(callback: () => void, ms: number): any;
    clearInterval(intervalId: any): void;
}
export declare class SystemClock implements Clock {
    now(): number;
    date(): Date;
    setTimeout(callback: () => void, ms: number): any;
    clearTimeout(timeoutId: any): void;
    setInterval(callback: () => void, ms: number): any;
    clearInterval(intervalId: any): void;
}
export declare class BacktestClock implements Clock {
    private currentTime;
    private timers;
    private nextTimerId;
    constructor(startTime: number);
    now(): number;
    date(): Date;
    setTime(time: number): void;
    advance(ms: number): void;
    setTimeout(callback: () => void, ms: number): any;
    clearTimeout(timeoutId: any): void;
    setInterval(callback: () => void, ms: number): any;
    clearInterval(intervalId: any): void;
    private processTimers;
}
//# sourceMappingURL=Clock.d.ts.map