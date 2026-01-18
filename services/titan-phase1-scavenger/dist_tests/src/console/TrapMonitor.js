import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from 'ink';
/**
 * Main TrapMonitor Dashboard Component
 *
 * Requirement 8.1: Display header with phase identifier, current equity, and profit percentage
 */
export function TrapMonitor({ trapMap, sensorStatus, liveFeed, equity, pnlPct }) {
    return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { borderStyle: "double", borderColor: "cyan", padding: 1, children: _jsxs(Text, { bold: true, color: "cyan", children: ["\uD83D\uDD78\uFE0F  TITAN PREDESTINATION | \uD83D\uDCB0 $", equity.toFixed(2), " (", pnlPct >= 0 ? '+' : '', pnlPct.toFixed(1), "%)"] }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "[F1] CONFIG  [SPACE] PAUSE  [Q] QUIT" }) }), _jsxs(Box, { marginTop: 1, borderStyle: "single", borderColor: "green", padding: 1, children: [_jsx(Text, { bold: true, color: "green", children: "\uD83C\uDFAF ACTIVE TRIPWIRES (Waiting for victims...)" }), _jsx(TrapTable, { trapMap: trapMap })] }), _jsxs(Box, { marginTop: 1, borderStyle: "single", borderColor: "yellow", padding: 1, children: [_jsx(Text, { bold: true, color: "yellow", children: "\uD83D\uDCE1 SENSOR STATUS" }), _jsx(SensorStatusDisplay, { data: sensorStatus })] }), _jsxs(Box, { marginTop: 1, borderStyle: "single", borderColor: "gray", padding: 1, children: [_jsx(Text, { bold: true, color: "gray", children: "\uD83D\uDCDD LIVE FEED" }), _jsx(LiveFeed, { events: liveFeed })] })] }));
}
/**
 * TrapTable Component
 *
 * Requirement 8.2: Display columns for symbol, current price, trigger price, trap type, and lead time
 * Requirement 8.3: Show visual indicator for trap type (BREAKOUT, LIQ_HUNT, BREAKDOWN, etc.)
 * Requirement 8.4: Show distance percentage between current price and trigger price
 * Requirement 8.5: Color code by proximity (red < 0.5%, yellow < 2%)
 */
function TrapTable({ trapMap }) {
    // Flatten all traps from the map
    const allTraps = [];
    trapMap.forEach((trapList, symbol) => {
        trapList.forEach(trap => {
            allTraps.push({ symbol, trap });
        });
    });
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Box, { children: _jsxs(Text, { bold: true, color: "white", children: ['COIN'.padEnd(12), 'CURR PRICE'.padEnd(14), 'TRIGGER'.padEnd(14), 'TYPE'.padEnd(18), 'LEAD TIME'.padEnd(12)] }) }), allTraps.length > 0 ? (allTraps.map(({ symbol, trap }, idx) => {
                const currentPrice = trap.currentPrice || trap.triggerPrice;
                const proximity = ((trap.triggerPrice - currentPrice) / currentPrice) * 100;
                const absProximity = Math.abs(proximity);
                // Color code by proximity - Requirement 8.5
                let proximityColor = 'white';
                if (absProximity < 0.5) {
                    proximityColor = 'red'; // Very close!
                }
                else if (absProximity < 2.0) {
                    proximityColor = 'yellow'; // Getting close
                }
                // Format trap type display - Requirement 8.3
                const trapTypeDisplay = formatTrapType(trap.trapType);
                // Format lead time - Requirement 8.2
                const leadTimeDisplay = trap.estimatedLeadTime
                    ? `~${trap.estimatedLeadTime}ms`
                    : 'N/A';
                return (_jsx(Box, { children: _jsxs(Text, { color: proximityColor, children: [symbol.padEnd(12), currentPrice.toFixed(2).padEnd(14), trap.triggerPrice.toFixed(2).padEnd(14), trapTypeDisplay.padEnd(18), leadTimeDisplay.padEnd(12)] }) }, `${symbol}-${idx}`));
            })) : (_jsx(Box, { marginTop: 1, children: _jsx(Text, { dimColor: true, children: "No traps set. Calculating..." }) }))] }));
}
/**
 * Format trap type for display
 * Requirement 8.3: Show visual indicator for trap types
 */
function formatTrapType(trapType) {
    switch (trapType) {
        case 'LIQUIDATION':
            return 'LIQ_HUNT';
        case 'DAILY_LEVEL':
            return 'BREAKOUT';
        case 'BOLLINGER':
            return 'BREAKOUT';
        case 'OI_WIPEOUT':
            return 'OI_WIPEOUT';
        case 'FUNDING_SQUEEZE':
            return 'FUNDING_SQZ';
        case 'BASIS_ARB':
            return 'BASIS_ARB';
        case 'ULTIMATE_BULGARIA':
            return 'ULTIMATE';
        case 'PREDICTION_SPIKE':
            return 'PRED_SPIKE';
        default:
            return trapType;
    }
}
/**
 * SensorStatusDisplay Component
 *
 * Requirement 8.6: Show Binance stream health, Bybit connection status, and estimated slippage percentage
 */
function SensorStatusDisplay({ data }) {
    // Determine health color
    const binanceColor = data.binanceHealth === 'OK' ? 'green' : data.binanceHealth === 'DEGRADED' ? 'yellow' : 'red';
    const bybitColor = data.bybitStatus === 'ARMED' ? 'green' : data.bybitStatus === 'DEGRADED' ? 'yellow' : 'red';
    const slippageColor = data.slippage < 0.1 ? 'green' : data.slippage < 0.3 ? 'yellow' : 'red';
    return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsxs(Box, { children: [_jsx(Text, { children: "Binance Stream: " }), _jsx(Text, { bold: true, color: binanceColor, children: data.binanceHealth }), _jsxs(Text, { children: [" (", data.binanceTickRate.toLocaleString(), " ticks/sec)"] })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Bybit Connection: " }), _jsx(Text, { bold: true, color: bybitColor, children: data.bybitStatus }), _jsxs(Text, { children: [" (Ping: ", data.bybitPing, "ms)"] })] }), _jsxs(Box, { marginTop: 1, children: [_jsx(Text, { children: "Estimated Slippage: " }), _jsxs(Text, { color: slippageColor, children: [data.slippage.toFixed(2), "%"] })] })] }));
}
/**
 * LiveFeed Component
 *
 * Requirement 8.7: Show last 5 events with timestamp, symbol, event type, and execution result
 *
 * Auto-scroll behavior: Ink automatically re-renders when the events array changes,
 * and by using slice(-5), we always show the most recent 5 events, effectively
 * providing auto-scroll functionality as new events are added.
 */
function LiveFeed({ events }) {
    // Get last 5 events - this provides auto-scroll as new events are added
    const recentEvents = events.slice(-5);
    return (_jsx(Box, { flexDirection: "column", marginTop: 1, children: recentEvents.length > 0 ? (recentEvents.map((event, idx) => {
            // Color code by event type
            let eventColor = 'white';
            switch (event.type) {
                case 'TRAP_SPRUNG':
                    eventColor = 'green';
                    break;
                case 'ERROR':
                    eventColor = 'red';
                    break;
                case 'TRAP_SET':
                    eventColor = 'yellow';
                    break;
                default:
                    eventColor = 'white';
            }
            // Format timestamp
            const timestamp = new Date(event.timestamp).toLocaleTimeString();
            return (_jsxs(Box, { children: [_jsxs(Text, { dimColor: true, children: ["[", timestamp, "] "] }), _jsx(Text, { color: eventColor, children: event.message })] }, idx));
        })) : (_jsx(Box, { children: _jsx(Text, { dimColor: true, children: "No events yet..." }) })) }));
}
export default TrapMonitor;
//# sourceMappingURL=TrapMonitor.js.map