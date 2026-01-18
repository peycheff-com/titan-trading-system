import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * ConfigPanel Example - Console UI Integration
 *
 * This example shows how to integrate ConfigManager with the Ink console UI
 * for the F1 key configuration panel (Requirement 12.1)
 *
 * NOTE: This is an example file showing the integration pattern.
 * The actual ConfigPanel component will be implemented in Task 25.
 */
import { useState } from 'react';
import { Box, Text } from 'ink';
import { ConfigManager } from './ConfigManager';
export function ConfigPanel({ configManager, onClose }) {
    const [config, setConfig] = useState(configManager.getConfig());
    const [selectedSection, setSelectedSection] = useState('regime');
    const handleSave = () => {
        // Validate before saving
        const errors = configManager.validateConfig(config);
        if (errors.length > 0) {
            console.error('❌ Validation errors:', errors);
            return;
        }
        // Save config (hot-reload without restart)
        configManager.saveConfig(config);
        console.log('✅ Configuration saved and applied');
        onClose();
    };
    const handleCancel = () => {
        // Discard changes
        console.log('⚠️ Configuration changes discarded');
        onClose();
    };
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "double", borderColor: "cyan", padding: 1, children: [_jsx(Text, { bold: true, color: "cyan", children: "\u2699\uFE0F CONFIGURATION PANEL (F1 to close)" }), selectedSection === 'regime' && (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "\uD83D\uDCCA Regime Settings" }), _jsxs(Text, { children: ["Liquidation Confidence: ", config.liquidationConfidence] }), _jsxs(Text, { children: ["Daily Level Confidence: ", config.dailyLevelConfidence] }), _jsxs(Text, { children: ["Bollinger Confidence: ", config.bollingerConfidence] })] })), selectedSection === 'flow' && (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "\uD83C\uDF0A Flow Settings" }), _jsxs(Text, { children: ["Min Trades in 100ms: ", config.minTradesIn100ms] }), _jsxs(Text, { children: ["Volume Window: ", config.volumeWindowMs, "ms"] })] })), selectedSection === 'risk' && (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "\u26A0\uFE0F Risk Settings" }), _jsxs(Text, { children: ["Max Leverage: ", config.maxLeverage, "x"] }), _jsxs(Text, { children: ["Stop Loss: ", (config.stopLossPercent * 100).toFixed(1), "%"] }), _jsxs(Text, { children: ["Target: ", (config.targetPercent * 100).toFixed(1), "%"] })] })), selectedSection === 'exchanges' && (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "\uD83D\uDD04 Exchange Settings" }), _jsxs(Text, { children: ["Binance: ", config.exchanges.binance.enabled ? '✅' : '❌', " (Signal Validator)"] }), _jsxs(Text, { children: ["Bybit: ", config.exchanges.bybit.executeOn ? '✅' : '❌', " Execute"] }), _jsxs(Text, { children: ["MEXC: ", config.exchanges.mexc.executeOn ? '✅' : '❌', " Execute"] })] })), _jsx(Box, { marginTop: 1, children: _jsx(Text, { children: "[S] Save  [C] Cancel  [1-4] Switch Section" }) })] }));
}
/**
 * Example Usage in Main Application
 */
export function ExampleUsage() {
    const configManager = new ConfigManager();
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    // Handle F1 key press
    const handleKeyPress = (key) => {
        if (key === 'f1') {
            setShowConfigPanel(!showConfigPanel);
        }
    };
    return (_jsx(Box, { flexDirection: "column", children: showConfigPanel ? (_jsx(ConfigPanel, { configManager: configManager, onClose: () => setShowConfigPanel(false) })) : (_jsx(Text, { children: "Press F1 to open configuration panel" })) }));
}
/**
 * Example: Programmatic Configuration Updates
 */
export function programmaticConfigExample() {
    const configManager = new ConfigManager();
    // Update regime settings
    configManager.updateRegimeSettings({
        liquidationConfidence: 90,
        dailyLevelConfidence: 80,
    });
    // Update risk settings
    configManager.updateRiskSettings({
        maxLeverage: 15,
        stopLossPercent: 0.015,
    });
    // Enable MEXC execution
    configManager.updateExchangeSettings('mexc', {
        enabled: true,
        executeOn: true,
    });
    // Get updated config
    const config = configManager.getConfig();
    console.log('Updated config:', config);
}
//# sourceMappingURL=ConfigPanel.example.js.map