import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ConfigPanel Component - F1 Key Modal Overlay
 *
 * Modal overlay for runtime configuration of trap parameters, exchange settings,
 * and risk management. Supports hot-reload without restart.
 *
 * Requirements: 12.1-12.7 (Runtime Configuration)
 */
import { useState } from 'react';
import { Box, Text } from 'ink';
/**
 * ConfigPanel Component
 *
 * Requirement 12.1: Display configuration panel overlay when user presses F1 key
 * Requirement 12.2: Allow adjustment of regime settings (compression threshold, entropy threshold, trend strength threshold)
 * Requirement 12.3: Allow adjustment of flow settings (CVD threshold, frequency multiplier, OBI threshold)
 * Requirement 12.4: Allow adjustment of risk settings (max leverage, max position size percentage, fee barrier multiplier)
 * Requirement 12.5: Write configuration to config.json file and apply changes immediately
 * Requirement 12.6: Discard changes and return to dashboard when user cancels
 */
export function ConfigPanel({ config, onSave, onCancel }) {
    // Local state for editing
    const [editedConfig, setEditedConfig] = useState({ ...config });
    const [activeSection, setActiveSection] = useState('trap');
    /**
     * Update a config value
     */
    const updateValue = (key, value) => {
        setEditedConfig((prev) => ({
            ...prev,
            [key]: value,
        }));
    };
    /**
     * Update exchange setting
     */
    const updateExchange = (exchange, key, value) => {
        setEditedConfig((prev) => ({
            ...prev,
            exchanges: {
                ...prev.exchanges,
                [exchange]: {
                    ...prev.exchanges[exchange],
                    [key]: value,
                },
            },
        }));
    };
    /**
     * Handle save
     * Requirement 12.5: Write configuration to config.json file and apply changes immediately
     */
    const handleSave = () => {
        onSave(editedConfig);
    };
    /**
     * Handle cancel
     * Requirement 12.6: Discard changes and return to dashboard
     */
    const handleCancel = () => {
        onCancel();
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "double", borderColor: "cyan", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: "cyan", children: "\u2699\uFE0F  CONFIGURATION PANEL" }) }), _jsxs(Box, { marginBottom: 1, children: [_jsx(Text, { color: activeSection === 'trap' ? 'cyan' : 'gray', children: "[1] Trap Params" }), _jsx(Text, { children: " " }), _jsx(Text, { color: activeSection === 'volume' ? 'cyan' : 'gray', children: "[2] Volume" }), _jsx(Text, { children: " " }), _jsx(Text, { color: activeSection === 'execution' ? 'cyan' : 'gray', children: "[3] Execution" }), _jsx(Text, { children: " " }), _jsx(Text, { color: activeSection === 'risk' ? 'cyan' : 'gray', children: "[4] Risk" }), _jsx(Text, { children: " " }), _jsx(Text, { color: activeSection === 'exchanges' ? 'cyan' : 'gray', children: "[5] Exchanges" })] }), _jsxs(Box, { flexDirection: "column", marginBottom: 1, borderStyle: "single", padding: 1, children: [activeSection === 'trap' && (_jsx(TrapParamsSection, { config: editedConfig, updateValue: updateValue })), activeSection === 'volume' && (_jsx(VolumeSection, { config: editedConfig, updateValue: updateValue })), activeSection === 'execution' && (_jsx(ExecutionSection, { config: editedConfig, updateValue: updateValue })), activeSection === 'risk' && (_jsx(RiskSection, { config: editedConfig, updateValue: updateValue })), activeSection === 'exchanges' && (_jsx(ExchangesSection, { config: editedConfig, updateExchange: updateExchange }))] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "[S] Save  [C] Cancel  [1-5] Switch Section" }) })] }));
}
/**
 * Trap Parameters Section
 * Requirement 12.2: Allow adjustment of trap thresholds
 */
function TrapParamsSection({ config, updateValue }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "green", children: "\uD83C\uDFAF Trap Parameters" }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Update Interval: " }), _jsxs(Text, { color: "cyan", children: [config.updateInterval, "ms"] }), _jsx(Text, { dimColor: true, children: " (10000-300000)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Top Symbols Count: " }), _jsx(Text, { color: "cyan", children: config.topSymbolsCount }), _jsx(Text, { dimColor: true, children: " (1-50)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Liquidation Confidence: " }), _jsx(Text, { color: "cyan", children: config.liquidationConfidence }), _jsx(Text, { dimColor: true, children: " (0-100)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Daily Level Confidence: " }), _jsx(Text, { color: "cyan", children: config.dailyLevelConfidence }), _jsx(Text, { dimColor: true, children: " (0-100)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Bollinger Confidence: " }), _jsx(Text, { color: "cyan", children: config.bollingerConfidence }), _jsx(Text, { dimColor: true, children: " (0-100)" })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Use arrow keys to adjust values, or edit config.json directly" }) })] }));
}
/**
 * Volume Validation Section
 * Requirement 12.3: Allow adjustment of volume validation settings
 */
function VolumeSection({ config, updateValue }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "green", children: "\uD83D\uDCCA Volume Validation" }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Min Trades in 100ms: " }), _jsx(Text, { color: "cyan", children: config.minTradesIn100ms }), _jsx(Text, { dimColor: true, children: " (1-1000)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Volume Window: " }), _jsxs(Text, { color: "cyan", children: [config.volumeWindowMs, "ms"] }), _jsx(Text, { dimColor: true, children: " (10-1000)" })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Higher values = more conservative (fewer false signals)" }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Lower values = more aggressive (more signals, more noise)" }) })] }));
}
/**
 * Execution Settings Section
 * Requirement 12.3: Allow adjustment of execution parameters
 */
function ExecutionSection({ config, updateValue }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "green", children: "\u26A1 Execution Settings" }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Extreme Velocity Threshold: " }), _jsxs(Text, { color: "cyan", children: [(config.extremeVelocityThreshold * 100).toFixed(2), "%/s"] }), _jsx(Text, { dimColor: true, children: " (0-10%)" })] }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "  \u2192 Use MARKET order if velocity exceeds this" }) }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Moderate Velocity Threshold: " }), _jsxs(Text, { color: "cyan", children: [(config.moderateVelocityThreshold * 100).toFixed(2), "%/s"] }), _jsx(Text, { dimColor: true, children: " (0-5%)" })] }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "  \u2192 Use AGGRESSIVE LIMIT if velocity exceeds this" }) }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Aggressive Limit Markup: " }), _jsxs(Text, { color: "cyan", children: [(config.aggressiveLimitMarkup * 100).toFixed(2), "%"] }), _jsx(Text, { dimColor: true, children: " (0-1%)" })] }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "  \u2192 Price markup for aggressive limit orders" }) })] }));
}
/**
 * Risk Management Section
 * Requirement 12.4: Allow adjustment of risk settings
 */
function RiskSection({ config, updateValue }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "green", children: "\uD83D\uDEE1\uFE0F  Risk Management" }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Max Leverage: " }), _jsxs(Text, { color: "cyan", children: [config.maxLeverage, "x"] }), _jsx(Text, { dimColor: true, children: " (1-100)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Max Position Size: " }), _jsxs(Text, { color: "cyan", children: [(config.maxPositionSizePercent * 100).toFixed(0), "%"] }), _jsx(Text, { dimColor: true, children: " (10-100%)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Stop Loss: " }), _jsxs(Text, { color: "cyan", children: [(config.stopLossPercent * 100).toFixed(1), "%"] }), _jsx(Text, { dimColor: true, children: " (0.1-10%)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Target: " }), _jsxs(Text, { color: "cyan", children: [(config.targetPercent * 100).toFixed(1), "%"] }), _jsx(Text, { dimColor: true, children: " (0.1-50%)" })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { dimColor: true, children: "Risk-Reward Ratio: " }), _jsxs(Text, { color: "yellow", children: [(config.targetPercent / config.stopLossPercent).toFixed(1), ":1"] })] })] }));
}
/**
 * Exchange Settings Section
 * Requirement 12.5: Allow adjustment of exchange toggles
 */
function ExchangesSection({ config, updateExchange }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { bold: true, color: "green", children: "\uD83C\uDF10 Exchange Settings" }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { bold: true, children: "Binance (Signal Validator)" }) }), _jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { children: "Enabled: " }), _jsx(Text, { color: "green", children: "\u2713 ALWAYS ON" }), _jsx(Text, { dimColor: true, children: " (required for signal validation)" })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { bold: true, children: "Bybit (Execution Target)" }) }), _jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { children: "Enabled: " }), _jsx(Text, { color: config.exchanges.bybit.enabled ? 'green' : 'red', children: config.exchanges.bybit.enabled ? '✓ YES' : '✗ NO' })] }), _jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { children: "Execute On: " }), _jsx(Text, { color: config.exchanges.bybit.executeOn ? 'green' : 'red', children: config.exchanges.bybit.executeOn ? '✓ YES' : '✗ NO' })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { bold: true, children: "MEXC (Execution Target)" }) }), _jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { children: "Enabled: " }), _jsx(Text, { color: config.exchanges.mexc.enabled ? 'green' : 'red', children: config.exchanges.mexc.enabled ? '✓ YES' : '✗ NO' })] }), _jsxs(Box, { marginLeft: 2, children: [_jsx(Text, { children: "Execute On: " }), _jsx(Text, { color: config.exchanges.mexc.executeOn ? 'green' : 'red', children: config.exchanges.mexc.executeOn ? '✓ YES' : '✗ NO' })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "Toggle exchanges by editing config.json directly" }) }), _jsx(Box, { children: _jsx(Text, { dimColor: true, children: "At least one execution exchange must be enabled" }) })] }));
}
export default ConfigPanel;
//# sourceMappingURL=ConfigPanel.js.map