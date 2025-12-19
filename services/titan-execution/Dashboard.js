/**
 * Ink Terminal Dashboard
 * 
 * Real-time terminal UI for monitoring the Titan Execution Microservice.
 * Uses React and Ink for rendering a rich terminal interface.
 * 
 * Requirements: 49.1-49.7
 * 
 * @module Dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { EventEmitter } from 'events';

// Use React.createElement shorthand
const h = React.createElement;

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Maximum log entries to display */
const MAX_LOG_ENTRIES = 15;

/** @constant {number} Maximum positions to display */
const MAX_POSITIONS = 10;

/** @constant {number} Flash notification duration in ms */
const FLASH_DURATION_MS = 2000;

/** @constant {Object} Log level colors */
const LOG_COLORS = {
  INFO: 'green',
  WARN: 'yellow',
  ERROR: 'red',
  DEBUG: 'gray',
};

/** @constant {Object} Regime state labels and colors */
const REGIME_LABELS = {
  1: { label: 'RISK-ON', color: 'green' },
  0: { label: 'NEUTRAL', color: 'yellow' },
  '-1': { label: 'RISK-OFF', color: 'red' },
};

/** @constant {Object} Position side colors */
const SIDE_COLORS = {
  LONG: 'green',
  SHORT: 'red',
};

//─────────────────────────────────────────────────────────────────────────────
// EVENT BUS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Dashboard Event Bus - Internal EventEmitter for UI updates
 * Requirement 49.2: Emit to internal EventEmitter bus for UI updates
 */
export const dashboardBus = new EventEmitter();
dashboardBus.setMaxListeners(50);

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Format timestamp for display
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted time string (HH:MM:SS)
 */
function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  return date.toTimeString().split(' ')[0];
}

/**
 * Format number with fixed decimals
 * @param {number} value - Number to format
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted number
 */
function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return Number(value).toFixed(decimals);
}

/**
 * Format PnL with color indicator
 * @param {number} pnl - PnL value
 * @returns {Object} { value: string, color: string }
 */
function formatPnL(pnl) {
  if (pnl === null || pnl === undefined || isNaN(pnl)) {
    return { value: '--', color: 'gray' };
  }
  const value = pnl >= 0 ? `+${formatNumber(pnl)}` : formatNumber(pnl);
  const color = pnl >= 0 ? 'green' : 'red';
  return { value, color };
}

/**
 * Truncate string to max length
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 2) + '..' : str;
}

//─────────────────────────────────────────────────────────────────────────────
// COMPONENTS (using React.createElement)
//─────────────────────────────────────────────────────────────────────────────

/**
 * Header Component - Title and status bar
 */
function Header({ isConnected, flashMessage }) {
  return h(Box, { flexDirection: 'column', borderStyle: 'double', borderColor: 'cyan', paddingX: 1 },
    h(Box, { justifyContent: 'space-between' },
      h(Text, { bold: true, color: 'cyan' }, '⚡ TITAN EXECUTION DASHBOARD'),
      h(Box, null,
        flashMessage && h(Text, { color: 'magenta', bold: true }, ` 🔔 ${flashMessage} `),
        h(Text, { color: isConnected ? 'green' : 'red' },
          isConnected ? '● CONNECTED' : '○ DISCONNECTED'
        )
      )
    ),
    h(Text, { dimColor: true }, "Press 'q' to quit | 'r' to refresh | 'c' to clear logs")
  );
}

/**
 * LogEntry Component - Single log entry
 * Requirement 49.3: Display logs with timestamp, log_type, message
 */
function LogEntry({ entry }) {
  const color = LOG_COLORS[entry.level] || 'white';
  return h(Box, null,
    h(Text, { dimColor: true }, `[${formatTime(entry.timestamp)}]`),
    h(Text, { color }, ` [${entry.level.padEnd(5)}] `),
    h(Text, null, truncate(entry.message, 60))
  );
}

/**
 * LogPanel Component - Scrolling log display
 * Requirement 49.3: Display logs with timestamp, log_type (INFO/WARN/ERROR), message
 */
function LogPanel({ logs }) {
  const displayLogs = logs.slice(-MAX_LOG_ENTRIES);
  return h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'gray', paddingX: 1, height: MAX_LOG_ENTRIES + 2 },
    h(Text, { bold: true, color: 'white' }, '📋 LOGS'),
    logs.length === 0
      ? h(Text, { dimColor: true }, 'No logs yet...')
      : displayLogs.map((entry, idx) => h(LogEntry, { key: idx, entry }))
  );
}

/**
 * PositionRow Component - Single position display
 */
function PositionRow({ position, currentPrice }) {
  const sideColor = SIDE_COLORS[position.side] || 'white';
  const pnl = currentPrice 
    ? (position.side === 'LONG' 
        ? (currentPrice - position.entry_price) * position.size
        : (position.entry_price - currentPrice) * position.size)
    : null;
  const { value: pnlValue, color: pnlColor } = formatPnL(pnl);
  
  return h(Box, null,
    h(Box, { width: 10 }, h(Text, { bold: true }, truncate(position.symbol, 10))),
    h(Box, { width: 6 }, h(Text, { color: sideColor }, position.side)),
    h(Box, { width: 10 }, h(Text, null, formatNumber(position.size, 4))),
    h(Box, { width: 12 }, h(Text, null, formatNumber(position.entry_price))),
    h(Box, { width: 12 }, h(Text, { color: pnlColor }, pnlValue)),
    h(Box, { width: 12 }, h(Text, { color: 'red' }, formatNumber(position.stop_loss)))
  );
}

/**
 * PositionsPanel Component - Open positions display
 * Requirement 49.4: Display positions with symbol, side, size, entry_price, current_pnl, stop_loss
 */
function PositionsPanel({ positions, prices }) {
  const positionList = Array.from(positions.values()).slice(0, MAX_POSITIONS);
  
  return h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'blue', paddingX: 1 },
    h(Text, { bold: true, color: 'blue' }, `📊 POSITIONS (${positions.size})`),
    h(Box, null,
      h(Box, { width: 10 }, h(Text, { dimColor: true }, 'Symbol')),
      h(Box, { width: 6 }, h(Text, { dimColor: true }, 'Side')),
      h(Box, { width: 10 }, h(Text, { dimColor: true }, 'Size')),
      h(Box, { width: 12 }, h(Text, { dimColor: true }, 'Entry')),
      h(Box, { width: 12 }, h(Text, { dimColor: true }, 'PnL')),
      h(Box, { width: 12 }, h(Text, { dimColor: true }, 'Stop'))
    ),
    positionList.length === 0
      ? h(Text, { dimColor: true }, 'No open positions')
      : positionList.map((pos, idx) => 
          h(PositionRow, { key: pos.symbol || idx, position: pos, currentPrice: prices.get(pos.symbol) })
        )
  );
}

/**
 * RegimePanel Component - Regime state display
 * Requirement 49.5: Display regime_state, market_structure_score, hurst, entropy
 */
function RegimePanel({ regime }) {
  const regimeInfo = REGIME_LABELS[regime.regime_state] || { label: 'UNKNOWN', color: 'gray' };
  const hurstLabel = regime.hurst > 0.55 ? 'TREND' : regime.hurst < 0.45 ? 'MEAN-REV' : 'RANDOM';
  const entropyLabel = regime.entropy > 0.8 ? 'CHOP' : regime.entropy < 0.3 ? 'TREND' : 'NORMAL';
  
  return h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'magenta', paddingX: 1 },
    h(Text, { bold: true, color: 'magenta' }, '🎯 REGIME'),
    h(Box, null,
      h(Text, null, 'State: '),
      h(Text, { color: regimeInfo.color, bold: true }, regimeInfo.label)
    ),
    h(Box, null,
      h(Text, null, 'Structure Score: '),
      h(Text, { color: regime.market_structure_score >= 70 ? 'green' : 'yellow' },
        `${formatNumber(regime.market_structure_score, 0)}/100`)
    ),
    h(Box, null,
      h(Text, null, 'Hurst: '),
      h(Text, { color: regime.hurst > 0.55 ? 'green' : regime.hurst < 0.45 ? 'cyan' : 'yellow' },
        formatNumber(regime.hurst, 3)),
      h(Text, { dimColor: true }, ` (${hurstLabel})`)
    ),
    h(Box, null,
      h(Text, null, 'Entropy: '),
      h(Text, { color: regime.entropy > 0.8 ? 'red' : regime.entropy < 0.3 ? 'green' : 'yellow' },
        formatNumber(regime.entropy, 3)),
      h(Text, { dimColor: true }, ` (${entropyLabel})`)
    ),
    regime.model_recommendation && h(Box, null,
      h(Text, null, 'Model: '),
      h(Text, { color: 'cyan' }, regime.model_recommendation)
    )
  );
}


/**
 * HealthPanel Component - System health display
 * Requirement 49.6: Display last_heartbeat, z_score_drift, broker_connection_status
 */
function HealthPanel({ health }) {
  const heartbeatAge = health.last_heartbeat 
    ? Math.floor((Date.now() - new Date(health.last_heartbeat).getTime()) / 1000)
    : null;
  const heartbeatColor = heartbeatAge === null ? 'gray' 
    : heartbeatAge < 60 ? 'green' 
    : heartbeatAge < 180 ? 'yellow' 
    : 'red';
  
  const zScoreColor = health.z_score >= -1 ? 'green' 
    : health.z_score >= -2 ? 'yellow' 
    : 'red';
  
  return h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'green', paddingX: 1 },
    h(Text, { bold: true, color: 'green' }, '💚 HEALTH'),
    h(Box, null,
      h(Text, null, 'Heartbeat: '),
      h(Text, { color: heartbeatColor }, heartbeatAge !== null ? `${heartbeatAge}s ago` : 'Never'),
      health.missed_heartbeats > 0 && h(Text, { color: 'red' }, ` (missed: ${health.missed_heartbeats})`)
    ),
    h(Box, null,
      h(Text, null, 'Z-Score: '),
      h(Text, { color: zScoreColor }, formatNumber(health.z_score, 2)),
      health.is_safety_stop && h(Text, { color: 'red', bold: true }, ' [SAFETY STOP]')
    ),
    h(Box, null,
      h(Text, null, 'Broker: '),
      h(Text, { color: health.broker_connected ? 'green' : 'red' },
        health.broker_connected ? '● Connected' : '○ Disconnected')
    ),
    h(Box, null,
      h(Text, null, 'Auto-Exec: '),
      h(Text, { color: health.auto_execution_enabled ? 'green' : 'red' },
        health.auto_execution_enabled ? '● Enabled' : '○ Disabled')
    ),
    health.is_emergency && h(Text, { color: 'red', bold: true }, '⚠️ EMERGENCY STATE - Manual reset required')
  );
}

/**
 * StatsPanel Component - Trading statistics
 */
function StatsPanel({ stats }) {
  const winRateColor = stats.win_rate >= 0.5 ? 'green' : 'red';
  const { value: totalPnL, color: pnlColor } = formatPnL(stats.total_pnl);
  
  return h(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'yellow', paddingX: 1 },
    h(Text, { bold: true, color: 'yellow' }, '📈 STATS'),
    h(Box, null,
      h(Text, null, 'Trades: '),
      h(Text, null, stats.trade_count || 0)
    ),
    h(Box, null,
      h(Text, null, 'Win Rate: '),
      h(Text, { color: winRateColor }, `${formatNumber((stats.win_rate || 0) * 100, 1)}%`)
    ),
    h(Box, null,
      h(Text, null, 'Total PnL: '),
      h(Text, { color: pnlColor }, totalPnL)
    ),
    h(Box, null,
      h(Text, null, 'Avg Win: '),
      h(Text, { color: 'green' }, formatNumber(stats.avg_win))
    ),
    h(Box, null,
      h(Text, null, 'Avg Loss: '),
      h(Text, { color: 'red' }, formatNumber(stats.avg_loss))
    )
  );
}

//─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
//─────────────────────────────────────────────────────────────────────────────

/**
 * Main Dashboard Component
 * Requirement 49.1: Render an Ink-based terminal UI when microservice starts
 */
function Dashboard({ initialState = {} }) {
  const { exit } = useApp();
  
  // State
  const [logs, setLogs] = useState([]);
  const [positions, setPositions] = useState(new Map());
  const [prices, setPrices] = useState(new Map());
  const [regime, setRegime] = useState({
    regime_state: 0,
    market_structure_score: 0,
    hurst: 0.5,
    entropy: 0.5,
    model_recommendation: null,
  });
  const [health, setHealth] = useState({
    last_heartbeat: null,
    missed_heartbeats: 0,
    z_score: 0,
    broker_connected: false,  // MOCK MODE - no real broker
    auto_execution_enabled: false,  // Disabled by default in mock mode
    is_safety_stop: false,
    is_emergency: false,
  });
  const [stats, setStats] = useState({
    trade_count: 0,
    win_rate: 0,
    total_pnl: 0,
    avg_win: 0,
    avg_loss: 0,
  });
  const [isConnected, setIsConnected] = useState(false);  // Mock mode = not connected
  const [flashMessage, setFlashMessage] = useState(null);
  
  // Add log entry
  const addLog = useCallback((level, message, data = {}) => {
    setLogs(prev => {
      const newLogs = [...prev, {
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
      }];
      return newLogs.slice(-100);
    });
  }, []);
  
  // Flash notification
  // Requirement 49.7: Flash notification on webhook receive
  const showFlash = useCallback((message) => {
    setFlashMessage(message);
    setTimeout(() => setFlashMessage(null), FLASH_DURATION_MS);
  }, []);
  
  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
    addLog('INFO', 'Logs cleared');
  }, [addLog]);
  
  // Keyboard input handling
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    } else if (input === 'c') {
      clearLogs();
    } else if (input === 'r') {
      addLog('INFO', 'Manual refresh requested');
      dashboardBus.emit('refresh_requested');
    }
  });
  
  // Subscribe to event bus
  // Requirement 49.2: Emit to internal EventEmitter bus for UI updates
  useEffect(() => {
    const handleLog = ({ level, message, data }) => addLog(level, message, data);
    
    const handlePositionOpened = (position) => {
      setPositions(prev => new Map(prev).set(position.symbol, position));
      addLog('INFO', `Position opened: ${position.symbol} ${position.side}`);
      showFlash(`📈 ${position.side} ${position.symbol}`);
    };
    
    const handlePositionClosed = (trade) => {
      setPositions(prev => {
        const newMap = new Map(prev);
        newMap.delete(trade.symbol);
        return newMap;
      });
      const pnlStr = trade.pnl >= 0 ? `+${formatNumber(trade.pnl)}` : formatNumber(trade.pnl);
      addLog(trade.pnl >= 0 ? 'INFO' : 'WARN', `Position closed: ${trade.symbol} PnL: ${pnlStr}`);
      showFlash(`📉 Closed ${trade.symbol} ${pnlStr}`);
    };
    
    const handlePositionUpdated = (position) => {
      setPositions(prev => new Map(prev).set(position.symbol, position));
    };
    
    const handleRegimeUpdate = (newRegime) => setRegime(prev => ({ ...prev, ...newRegime }));
    const handleHealthUpdate = (newHealth) => setHealth(prev => ({ ...prev, ...newHealth }));
    
    const handleHeartbeatReceived = ({ received_at }) => {
      setHealth(prev => ({ ...prev, last_heartbeat: received_at, missed_heartbeats: 0 }));
    };
    
    const handleHeartbeatMissed = ({ missed_count }) => {
      setHealth(prev => ({ ...prev, missed_heartbeats: missed_count }));
      addLog('WARN', `Heartbeat missed (${missed_count} consecutive)`);
    };
    
    const handleSafetyStop = (data) => {
      setHealth(prev => ({ ...prev, is_safety_stop: true, auto_execution_enabled: false }));
      addLog('ERROR', `SAFETY STOP: Z-Score ${formatNumber(data.z_score)}`);
      showFlash('⚠️ SAFETY STOP');
    };
    
    const handleHardKill = (data) => {
      setHealth(prev => ({ ...prev, is_emergency: true, auto_execution_enabled: false }));
      addLog('ERROR', `HARD KILL: ${data.trigger_reason}`);
      showFlash('🚨 HARD KILL');
    };
    
    const handleEmergencyFlatten = (data) => {
      setHealth(prev => ({ ...prev, is_emergency: true, auto_execution_enabled: false }));
      addLog('ERROR', `EMERGENCY FLATTEN: ${data.reason}`);
      showFlash('🚨 EMERGENCY');
    };
    
    const handleStatsUpdate = (newStats) => setStats(prev => ({ ...prev, ...newStats }));
    
    const handleTradeRecorded = (trade) => {
      setStats(prev => ({
        ...prev,
        trade_count: prev.trade_count + 1,
        total_pnl: prev.total_pnl + trade.pnl,
      }));
    };
    
    // Requirement 49.7: Flash notification on webhook receive
    const handleWebhookReceived = ({ signal_id, type, symbol }) => {
      addLog('INFO', `Webhook: ${type} ${symbol || ''} (${signal_id?.slice(-8) || 'unknown'})`);
      showFlash(`🔔 ${type} ${symbol || ''}`);
    };
    
    const handleConnected = () => {
      setIsConnected(true);
      setHealth(prev => ({ ...prev, broker_connected: true }));
      addLog('INFO', 'Broker connected');
    };
    
    const handleDisconnected = () => {
      setIsConnected(false);
      setHealth(prev => ({ ...prev, broker_connected: false }));
      addLog('WARN', 'Broker disconnected');
    };
    
    const handlePriceUpdate = ({ symbol, price }) => {
      setPrices(prev => new Map(prev).set(symbol, price));
    };
    
    const handleReset = () => {
      setHealth(prev => ({
        ...prev,
        is_safety_stop: false,
        is_emergency: false,
        auto_execution_enabled: true,
        missed_heartbeats: 0,
      }));
      addLog('INFO', 'System reset - Auto-execution re-enabled');
      showFlash('✅ System Reset');
    };
    
    // Subscribe to all events
    dashboardBus.on('log', handleLog);
    dashboardBus.on('position:opened', handlePositionOpened);
    dashboardBus.on('position:closed', handlePositionClosed);
    dashboardBus.on('position:updated', handlePositionUpdated);
    dashboardBus.on('regime:update', handleRegimeUpdate);
    dashboardBus.on('health:update', handleHealthUpdate);
    dashboardBus.on('heartbeat:received', handleHeartbeatReceived);
    dashboardBus.on('heartbeat:missed', handleHeartbeatMissed);
    dashboardBus.on('safety_stop', handleSafetyStop);
    dashboardBus.on('hard_kill', handleHardKill);
    dashboardBus.on('emergency_flatten', handleEmergencyFlatten);
    dashboardBus.on('stats:update', handleStatsUpdate);
    dashboardBus.on('trade:recorded', handleTradeRecorded);
    dashboardBus.on('webhook:received', handleWebhookReceived);
    dashboardBus.on('connected', handleConnected);
    dashboardBus.on('disconnected', handleDisconnected);
    dashboardBus.on('price:update', handlePriceUpdate);
    dashboardBus.on('reset', handleReset);
    
    addLog('INFO', 'Dashboard initialized');
    
    return () => {
      dashboardBus.off('log', handleLog);
      dashboardBus.off('position:opened', handlePositionOpened);
      dashboardBus.off('position:closed', handlePositionClosed);
      dashboardBus.off('position:updated', handlePositionUpdated);
      dashboardBus.off('regime:update', handleRegimeUpdate);
      dashboardBus.off('health:update', handleHealthUpdate);
      dashboardBus.off('heartbeat:received', handleHeartbeatReceived);
      dashboardBus.off('heartbeat:missed', handleHeartbeatMissed);
      dashboardBus.off('safety_stop', handleSafetyStop);
      dashboardBus.off('hard_kill', handleHardKill);
      dashboardBus.off('emergency_flatten', handleEmergencyFlatten);
      dashboardBus.off('stats:update', handleStatsUpdate);
      dashboardBus.off('trade:recorded', handleTradeRecorded);
      dashboardBus.off('webhook:received', handleWebhookReceived);
      dashboardBus.off('connected', handleConnected);
      dashboardBus.off('disconnected', handleDisconnected);
      dashboardBus.off('price:update', handlePriceUpdate);
      dashboardBus.off('reset', handleReset);
    };
  }, [addLog, showFlash]);
  
  // Render using React.createElement
  return h(Box, { flexDirection: 'column', padding: 1 },
    h(Header, { isConnected, flashMessage }),
    h(Box, { marginTop: 1 },
      h(Box, { flexDirection: 'column', width: '60%' },
        h(LogPanel, { logs })
      ),
      h(Box, { flexDirection: 'column', width: '40%', marginLeft: 1 },
        h(HealthPanel, { health }),
        h(RegimePanel, { regime }),
        h(StatsPanel, { stats })
      )
    ),
    h(Box, { marginTop: 1 },
      h(PositionsPanel, { positions, prices })
    )
  );
}


//─────────────────────────────────────────────────────────────────────────────
// DASHBOARD MANAGER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * DashboardManager - Manages the Ink dashboard lifecycle and event bridging
 * 
 * Bridges events from ShadowState, Heartbeat, ZScoreDrift, and other components
 * to the dashboard's internal event bus.
 */
export class DashboardManager {
  /**
   * Create a new DashboardManager
   * 
   * @param {Object} options - Configuration options
   * @param {Object} [options.shadowState] - ShadowState instance
   * @param {Object} [options.heartbeat] - Heartbeat instance
   * @param {Object} [options.zScoreDrift] - ZScoreDrift instance
   * @param {Object} [options.reconciliation] - Reconciliation instance
   * @param {Object} [options.brokerGateway] - BrokerGateway instance
   * @param {Function} [options.logger] - Logger function
   */
  constructor(options = {}) {
    this.shadowState = options.shadowState;
    this.heartbeat = options.heartbeat;
    this.zScoreDrift = options.zScoreDrift;
    this.reconciliation = options.reconciliation;
    this.brokerGateway = options.brokerGateway;
    this.logger = options.logger || console;
    
    /** @type {Object|null} Ink render instance */
    this._inkInstance = null;
    
    /** @type {boolean} Whether dashboard is running */
    this._isRunning = false;
    
    /** @type {Function[]} Event listener cleanup functions */
    this._cleanupFns = [];
  }
  
  /**
   * Start the dashboard
   * Requirement 49.1: Render an Ink-based terminal UI when microservice starts
   * 
   * @returns {Promise<void>}
   */
  async start() {
    if (this._isRunning) {
      this.logger.warn?.({}, 'Dashboard already running');
      return;
    }
    
    // Bridge events from components to dashboard bus
    this._bridgeEvents();
    
    // Render the dashboard
    this._inkInstance = render(h(Dashboard));
    this._isRunning = true;
    
    this.logger.info?.({}, 'Dashboard started');
    dashboardBus.emit('log', { level: 'INFO', message: 'Titan Execution Microservice started' });
  }
  
  /**
   * Stop the dashboard
   */
  stop() {
    if (!this._isRunning) {
      return;
    }
    
    // Cleanup event listeners
    for (const cleanup of this._cleanupFns) {
      cleanup();
    }
    this._cleanupFns = [];
    
    // Unmount Ink
    if (this._inkInstance) {
      this._inkInstance.unmount();
      this._inkInstance = null;
    }
    
    this._isRunning = false;
    this.logger.info?.({}, 'Dashboard stopped');
  }
  
  /**
   * Bridge events from components to dashboard bus
   * Requirement 49.2: Emit to internal EventEmitter bus for UI updates
   * @private
   */
  _bridgeEvents() {
    // Bridge ShadowState events
    if (this.shadowState) {
      const onPositionOpened = (position) => dashboardBus.emit('position:opened', position);
      const onPositionClosed = (trade) => dashboardBus.emit('position:closed', trade);
      const onPositionUpdated = (position) => dashboardBus.emit('position:updated', position);
      const onTradeRecorded = (trade) => dashboardBus.emit('trade:recorded', trade);
      const onIntentProcessed = (intent) => {
        dashboardBus.emit('webhook:received', {
          signal_id: intent.signal_id,
          type: intent.type,
          symbol: intent.symbol,
        });
      };
      
      this.shadowState.on('position:opened', onPositionOpened);
      this.shadowState.on('position:closed', onPositionClosed);
      this.shadowState.on('position:updated', onPositionUpdated);
      this.shadowState.on('trade:recorded', onTradeRecorded);
      this.shadowState.on('intent:processed', onIntentProcessed);
      
      this._cleanupFns.push(() => {
        this.shadowState.off('position:opened', onPositionOpened);
        this.shadowState.off('position:closed', onPositionClosed);
        this.shadowState.off('position:updated', onPositionUpdated);
        this.shadowState.off('trade:recorded', onTradeRecorded);
        this.shadowState.off('intent:processed', onIntentProcessed);
      });
    }
    
    // Bridge Heartbeat events
    if (this.heartbeat) {
      const onHeartbeatReceived = (data) => dashboardBus.emit('heartbeat:received', data);
      const onHeartbeatMissed = (data) => dashboardBus.emit('heartbeat:missed', data);
      const onEmergencyFlatten = (data) => dashboardBus.emit('emergency_flatten', data);
      const onReset = () => dashboardBus.emit('reset');
      
      this.heartbeat.on('heartbeat_received', onHeartbeatReceived);
      this.heartbeat.on('heartbeat_missed', onHeartbeatMissed);
      this.heartbeat.on('emergency_flatten', onEmergencyFlatten);
      this.heartbeat.on('reset', onReset);
      
      this._cleanupFns.push(() => {
        this.heartbeat.off('heartbeat_received', onHeartbeatReceived);
        this.heartbeat.off('heartbeat_missed', onHeartbeatMissed);
        this.heartbeat.off('emergency_flatten', onEmergencyFlatten);
        this.heartbeat.off('reset', onReset);
      });
    }
    
    // Bridge ZScoreDrift events
    if (this.zScoreDrift) {
      const onSafetyStop = (data) => dashboardBus.emit('safety_stop', data);
      const onHardKill = (data) => dashboardBus.emit('hard_kill', data);
      const onReset = () => dashboardBus.emit('reset');
      
      this.zScoreDrift.on('safety_stop', onSafetyStop);
      this.zScoreDrift.on('hard_kill', onHardKill);
      this.zScoreDrift.on('reset', onReset);
      
      this._cleanupFns.push(() => {
        this.zScoreDrift.off('safety_stop', onSafetyStop);
        this.zScoreDrift.off('hard_kill', onHardKill);
        this.zScoreDrift.off('reset', onReset);
      });
    }
    
    // Bridge Reconciliation events
    if (this.reconciliation) {
      const onMismatch = (data) => {
        dashboardBus.emit('log', { 
          level: 'WARN', 
          message: `Reconciliation mismatch: ${data.symbol}`,
          data,
        });
      };
      const onEmergencyFlatten = (data) => dashboardBus.emit('emergency_flatten', data);
      
      this.reconciliation.on('mismatch', onMismatch);
      this.reconciliation.on('emergency_flatten', onEmergencyFlatten);
      
      this._cleanupFns.push(() => {
        this.reconciliation.off('mismatch', onMismatch);
        this.reconciliation.off('emergency_flatten', onEmergencyFlatten);
      });
    }
  }
  
  /**
   * Log a message to the dashboard
   * 
   * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
   * @param {string} message - Log message
   * @param {Object} [data] - Additional data
   */
  log(level, message, data = {}) {
    dashboardBus.emit('log', { level, message, data });
  }
  
  /**
   * Update regime display
   * 
   * @param {Object} regime - Regime data
   */
  updateRegime(regime) {
    dashboardBus.emit('regime:update', regime);
  }
  
  /**
   * Update health display
   * 
   * @param {Object} health - Health data
   */
  updateHealth(health) {
    dashboardBus.emit('health:update', health);
  }
  
  /**
   * Update stats display
   * 
   * @param {Object} stats - Stats data
   */
  updateStats(stats) {
    dashboardBus.emit('stats:update', stats);
  }
  
  /**
   * Update price for a symbol
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} price - Current price
   */
  updatePrice(symbol, price) {
    dashboardBus.emit('price:update', { symbol, price });
  }
  
  /**
   * Notify webhook received
   * Requirement 49.7: Flash notification on webhook receive
   * 
   * @param {Object} webhook - Webhook data
   */
  notifyWebhook(webhook) {
    dashboardBus.emit('webhook:received', webhook);
  }
  
  /**
   * Check if dashboard is running
   * 
   * @returns {boolean} True if running
   */
  isRunning() {
    return this._isRunning;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// EXPORTS
//─────────────────────────────────────────────────────────────────────────────

export { Dashboard };
export default DashboardManager;
