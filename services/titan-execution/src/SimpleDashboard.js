/**
 * Simple Terminal Dashboard
 * 
 * Minimal, clean UI that shows only what matters.
 * No fake broker connections, no overloaded features.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { EventEmitter } from 'events';

const h = React.createElement;

//─────────────────────────────────────────────────────────────────────────────
// EVENT BUS
//─────────────────────────────────────────────────────────────────────────────

export const dashboardBus = new EventEmitter();
dashboardBus.setMaxListeners(50);

//─────────────────────────────────────────────────────────────────────────────
// HELPERS
//─────────────────────────────────────────────────────────────────────────────

function formatTime(timestamp) {
  if (!timestamp) return '--:--:--';
  const date = new Date(timestamp);
  return date.toTimeString().split(' ')[0];
}

function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return Number(value).toFixed(decimals);
}

//─────────────────────────────────────────────────────────────────────────────
// SIMPLE DASHBOARD
//─────────────────────────────────────────────────────────────────────────────

function SimpleDashboard() {
  const { exit } = useApp();
  
  const [logs, setLogs] = useState([]);
  const [webhookCount, setWebhookCount] = useState(0);
  const [lastWebhook, setLastWebhook] = useState(null);
  const [mode, setMode] = useState('MOCK');
  
  const addLog = useCallback((level, message) => {
    setLogs(prev => {
      const newLogs = [...prev, {
        timestamp: new Date().toISOString(),
        level,
        message,
      }];
      return newLogs.slice(-20);
    });
  }, []);
  
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    } else if (input === 'c') {
      setLogs([]);
      addLog('INFO', 'Logs cleared');
    }
  });
  
  useEffect(() => {
    const handleLog = ({ level, message }) => addLog(level, message);
    
    const handleWebhook = (data) => {
      setWebhookCount(prev => prev + 1);
      setLastWebhook(data);
      addLog('INFO', `Webhook: ${data.type} ${data.symbol || ''}`);
    };
    
    dashboardBus.on('log', handleLog);
    dashboardBus.on('webhook:received', handleWebhook);
    
    addLog('INFO', 'Titan Execution Service started (MOCK MODE)');
    addLog('INFO', 'Listening for TradingView webhooks on port 3000');
    
    return () => {
      dashboardBus.off('log', handleLog);
      dashboardBus.off('webhook:received', handleWebhook);
    };
  }, [addLog]);
  
  return h(Box, { flexDirection: 'column', padding: 1 },
    // Header
    h(Box, { borderStyle: 'double', borderColor: 'cyan', paddingX: 1, flexDirection: 'column' },
      h(Text, { bold: true, color: 'cyan' }, '⚡ TITAN EXECUTION SERVICE'),
      h(Box, { justifyContent: 'space-between' },
        h(Text, { color: 'yellow' }, `Mode: ${mode}`),
        h(Text, { dimColor: true }, "Press 'q' to quit | 'c' to clear logs")
      )
    ),
    
    // Stats
    h(Box, { marginTop: 1, borderStyle: 'single', borderColor: 'blue', paddingX: 1, flexDirection: 'column' },
      h(Text, { bold: true, color: 'blue' }, '📊 STATUS'),
      h(Box, null,
        h(Text, null, 'Webhooks Received: '),
        h(Text, { color: 'green', bold: true }, webhookCount.toString())
      ),
      lastWebhook && h(Box, null,
        h(Text, null, 'Last: '),
        h(Text, { color: 'cyan' }, `${lastWebhook.type} ${lastWebhook.symbol || ''} @ ${formatTime(lastWebhook.timestamp)}`)
      )
    ),
    
    // Logs
    h(Box, { marginTop: 1, borderStyle: 'single', borderColor: 'gray', paddingX: 1, flexDirection: 'column', height: 15 },
      h(Text, { bold: true, color: 'white' }, '📋 LOGS'),
      logs.length === 0
        ? h(Text, { dimColor: true }, 'No logs yet...')
        : logs.map((entry, idx) => 
            h(Box, { key: idx },
              h(Text, { dimColor: true }, `[${formatTime(entry.timestamp)}] `),
              h(Text, { 
                color: entry.level === 'ERROR' ? 'red' : entry.level === 'WARN' ? 'yellow' : 'green' 
              }, `[${entry.level}] `),
              h(Text, null, entry.message)
            )
          )
    ),
    
    // Footer
    h(Box, { marginTop: 1 },
      h(Text, { dimColor: true }, 'Webhook endpoint: POST http://localhost:3000/webhook')
    )
  );
}

//─────────────────────────────────────────────────────────────────────────────
// DASHBOARD MANAGER
//─────────────────────────────────────────────────────────────────────────────

export class DashboardManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this._inkInstance = null;
    this._isRunning = false;
  }
  
  async start() {
    if (this._isRunning) {
      this.logger.warn?.({}, 'Dashboard already running');
      return;
    }
    
    this._inkInstance = render(h(SimpleDashboard));
    this._isRunning = true;
    
    this.logger.info?.({}, 'Dashboard started');
  }
  
  stop() {
    if (!this._isRunning) return;
    
    if (this._inkInstance) {
      this._inkInstance.unmount();
      this._inkInstance = null;
    }
    
    this._isRunning = false;
    this.logger.info?.({}, 'Dashboard stopped');
  }
  
  log(level, message, data = {}) {
    dashboardBus.emit('log', { level, message, data });
  }
  
  notifyWebhook(webhook) {
    dashboardBus.emit('webhook:received', {
      ...webhook,
      timestamp: new Date().toISOString(),
    });
  }
  
  isRunning() {
    return this._isRunning;
  }
}

export default DashboardManager;
