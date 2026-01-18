import { jsx as _jsx } from "react/jsx-runtime";
/**
 * ConfigPanel Integration Example
 *
 * This example shows how to integrate the ConfigPanel with the TrapMonitor
 * and handle F1 key press to toggle between views.
 */
import { useState } from 'react';
import { render, useInput } from 'ink';
import { TrapMonitor } from './TrapMonitor';
import { ConfigPanel } from './ConfigPanel';
import { ConfigManager } from '../config/ConfigManager';
/**
 * Main Application Component
 */
function App() {
    const [showConfig, setShowConfig] = useState(false);
    const [configManager] = useState(() => new ConfigManager());
    // Mock data for demonstration
    const [trapMonitorData, setTrapMonitorData] = useState({
        trapMap: new Map(),
        sensorStatus: {
            binanceHealth: 'OK',
            binanceTickRate: 1250,
            bybitStatus: 'ARMED',
            bybitPing: 45,
            slippage: 0.08,
        },
        liveFeed: [
            {
                timestamp: Date.now() - 5000,
                type: 'INFO',
                message: 'System started',
            },
            {
                timestamp: Date.now() - 3000,
                type: 'TRAP_SET',
                message: 'BTCUSDT trap set at $45,123.45',
            },
        ],
        equity: 1250.50,
        pnlPct: 12.5,
    });
    /**
     * Handle keyboard input
     */
    useInput((input, key) => {
        // F1 key - Toggle config panel
        if (key.f1) {
            setShowConfig(prev => !prev);
        }
        // ESC key - Close config panel
        if (key.escape && showConfig) {
            setShowConfig(false);
        }
        // Q key - Quit application
        if (input === 'q' && !showConfig) {
            process.exit(0);
        }
        // S key - Save config (when panel is open)
        if (input === 's' && showConfig) {
            // Save is handled by ConfigPanel's onSave callback
        }
        // C key - Cancel config (when panel is open)
        if (input === 'c' && showConfig) {
            setShowConfig(false);
        }
        // Number keys 1-5 - Switch config sections (when panel is open)
        if (showConfig && ['1', '2', '3', '4', '5'].includes(input)) {
            // Section switching is handled internally by ConfigPanel
            // This is just for demonstration
        }
    });
    /**
     * Handle config save
     */
    const handleConfigSave = (newConfig) => {
        try {
            configManager.saveConfig(newConfig);
            console.log('✅ Configuration saved successfully');
            setShowConfig(false);
        }
        catch (error) {
            console.error('❌ Failed to save configuration:', error);
        }
    };
    /**
     * Handle config cancel
     */
    const handleConfigCancel = () => {
        console.log('📝 Configuration changes discarded');
        setShowConfig(false);
    };
    /**
     * Render the appropriate view
     */
    return showConfig ? (_jsx(ConfigPanel, { config: configManager.getConfig(), onSave: handleConfigSave, onCancel: handleConfigCancel })) : (_jsx(TrapMonitor, { ...trapMonitorData }));
}
/**
 * Start the application
 */
export function startTrapMonitor() {
    const { unmount } = render(_jsx(App, {}));
    // Handle cleanup on exit
    process.on('SIGINT', () => {
        unmount();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        unmount();
        process.exit(0);
    });
    return unmount;
}
// Export for use in main application
export default App;
//# sourceMappingURL=ConfigPanel.example.js.map