export enum DefconLevel {
    NORMAL = "NORMAL",
    CAUTION = "CAUTION",
    DEFENSIVE = "DEFENSIVE",
    EMERGENCY = "EMERGENCY",
}

export interface SystemHealth {
    latency_ms: number;
    error_rate_5m: number;
    drawdown_pct: number;
}
