/**
 * Power Law Symbol Whitelist
 *
 * Centralized list of symbols supported by the Power Law system.
 * Used by both Brain (RiskGuardian) and Execution (RiskGuard) to ensure
 * consistent symbol validation across the stack.
 *
 * @audit EvidencePack 2026-01-31: Dual-layer whitelist identified as drift risk.
 *        This shared config consolidates both layers.
 */
/**
 * Canonical list of Power Law supported symbols.
 * Add new symbols here - they will propagate to all consumers.
 */
export declare const POWER_LAW_SYMBOL_WHITELIST: readonly ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "DOTUSDT", "LINKUSDT", "MATICUSDT", "UNIUSDT", "LTCUSDT", "ATOMUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT", "APTUSDT", "SUIUSDT", "INJUSDT"];
/**
 * Type-safe symbol type for Power Law operations
 */
export type PowerLawSymbol = (typeof POWER_LAW_SYMBOL_WHITELIST)[number];
/**
 * Check if a symbol is in the Power Law whitelist
 */
export declare function isPowerLawSymbol(symbol: string): symbol is PowerLawSymbol;
/**
 * Default symbol for fallback metrics (used when symbol-specific metrics missing)
 */
export declare const POWER_LAW_FALLBACK_SYMBOL: PowerLawSymbol;
//# sourceMappingURL=powerlaw_symbols.d.ts.map