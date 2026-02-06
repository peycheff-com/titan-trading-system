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
export const POWER_LAW_SYMBOL_WHITELIST = [
    // Major pairs
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'SOLUSDT',
    'XRPUSDT',
    'DOGEUSDT',
    'ADAUSDT',
    'AVAXUSDT',
    'DOTUSDT',
    'LINKUSDT',
    'MATICUSDT',
    'UNIUSDT',
    'LTCUSDT',
    'ATOMUSDT',
    'NEARUSDT',
    'ARBUSDT',
    'OPUSDT',
    'APTUSDT',
    'SUIUSDT',
    'INJUSDT',
];
/**
 * Check if a symbol is in the Power Law whitelist
 */
export function isPowerLawSymbol(symbol) {
    return POWER_LAW_SYMBOL_WHITELIST.includes(symbol);
}
/**
 * Default symbol for fallback metrics (used when symbol-specific metrics missing)
 */
export const POWER_LAW_FALLBACK_SYMBOL = 'BTCUSDT';
//# sourceMappingURL=powerlaw_symbols.js.map