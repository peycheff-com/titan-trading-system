export declare enum TruthState {
    VERIFIED = "VERIFIED",
    PROBABLE = "PROBABLE",
    SUSPECT = "SUSPECT",
    UNKNOWN = "UNKNOWN"
}
export interface TruthScore {
    score: number;
    state: TruthState;
    reasons: string[];
    lastUpdated: number;
}
//# sourceMappingURL=truth.d.ts.map