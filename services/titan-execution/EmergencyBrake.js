/**
 * Titan Emergency Brake System
 * 
 * Monitors Bybit connection and implements emergency procedures:
 * - Pauses Scavenger (SIGSTOP) when Bybit disconnects
 * - Resumes Scavenger (SIGCONT) when Bybit reconnects
 * - Emergency flatten endpoint to close all positions
 * - Disables Master Arm after emergency flatten
 */

const EventEmitter = require('events');
const { exec } = require('child_process');

class EmergencyBrake extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      scavengerProcessName: options.scavengerProcessName || 'titan-scavenger',
      flattenTimeoutMs: options.flattenTimeoutMs || 5000,
      reconnectGracePeriodMs: options.reconnectGracePeriodMs || 3000,
      ...options
    };
    
    // Dependencies (injected)
    this.shadowState = null;
    this.brokerGateway = null;
    this.databaseManager = null;
    this.logger = options.logger || console;
    
    // State
    this.bybitConnected = false;
    this.scavengerPaused = false;
    this.scavengerPid = null;
    this.emergencyFlattenInProgress = false;
    this.reconnectTimer = null;
  }

  /**
   * Initialize with dependencies
   */
  initialize(dependencies) {
    this.shadowState = dependencies.shadowState;
    this.brokerGateway = dependencies.brokerGateway;
    this.databaseManager = dependencies.databaseManager;
    this.systemState = dependencies.systemState;
    
    this.log('info', 'Emergency Brake initialized');
  }

  /**
   * Start monitoring Bybit connection
   */
  startMonitoring(bybitWs) {
    if (!bybitWs) {
      this.log('warn', 'No Bybit WebSocket provided for monitoring');
      return;
    }
    
    this.bybitWs = bybitWs;
    
    // Monitor connection close
    bybitWs.on('close', () => this.onBybitDisconnect());
    bybitWs.on('error', (error) => this.onBybitError(error));
    bybitWs.on('open', () => this.onBybitReconnect());
    
    // Initial state
    this.bybitConnected = bybitWs.readyState === 1; // WebSocket.OPEN
    
    this.log('info', 'Bybit connection monitoring started');
  }

  /**
   * Handle Bybit disconnect
   */
  async onBybitDisconnect() {
    this.bybitConnected = false;
    this.log('warn', 'Bybit WebSocket disconnected');
    
    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    // Wait for grace period before pausing Scavenger
    this.reconnectTimer = setTimeout(async () => {
      if (!this.bybitConnected) {
        await this.pauseScavenger();
      }
    }, this.options.reconnectGracePeriodMs);
    
    // Log event
    await this.logSystemEvent('BYBIT_DISCONNECTED', 'warn', {
      message: 'Bybit WebSocket connection lost'
    });
    
    this.emit('bybitDisconnected');
  }

  /**
   * Handle Bybit reconnect
   */
  async onBybitReconnect() {
    this.bybitConnected = true;
    this.log('info', 'Bybit WebSocket reconnected');
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Resume Scavenger if it was paused
    if (this.scavengerPaused) {
      await this.resumeScavenger();
    }
    
    // Log event
    await this.logSystemEvent('BYBIT_RECONNECTED', 'info', {
      message: 'Bybit WebSocket connection restored'
    });
    
    this.emit('bybitReconnected');
  }

  /**
   * Handle Bybit error
   */
  onBybitError(error) {
    this.log('error', `Bybit WebSocket error: ${error.message}`);
    this.emit('bybitError', error);
  }

  /**
   * Pause Scavenger process (SIGSTOP)
   */
  async pauseScavenger() {
    if (this.scavengerPaused) {
      this.log('info', 'Scavenger already paused');
      return;
    }
    
    try {
      // Find Scavenger PID
      const pid = await this.findScavengerPid();
      
      if (pid) {
        this.scavengerPid = pid;
        
        // Send SIGSTOP
        process.kill(pid, 'SIGSTOP');
        this.scavengerPaused = true;
        
        this.log('warn', `Scavenger paused (PID: ${pid})`);
        
        // Log event
        await this.logSystemEvent('SCAVENGER_PAUSED', 'warn', {
          message: 'Scavenger paused due to Bybit disconnect',
          pid
        });
        
        this.emit('scavengerPaused', { pid });
        
      } else {
        this.log('warn', 'Scavenger process not found');
      }
      
    } catch (error) {
      this.log('error', `Failed to pause Scavenger: ${error.message}`);
    }
  }

  /**
   * Resume Scavenger process (SIGCONT)
   */
  async resumeScavenger() {
    if (!this.scavengerPaused) {
      this.log('info', 'Scavenger not paused');
      return;
    }
    
    try {
      const pid = this.scavengerPid || await this.findScavengerPid();
      
      if (pid) {
        // Send SIGCONT
        process.kill(pid, 'SIGCONT');
        this.scavengerPaused = false;
        
        this.log('info', `Scavenger resumed (PID: ${pid})`);
        
        // Log event
        await this.logSystemEvent('SCAVENGER_RESUMED', 'info', {
          message: 'Scavenger resumed after Bybit reconnect',
          pid
        });
        
        this.emit('scavengerResumed', { pid });
        
      } else {
        this.log('warn', 'Scavenger process not found');
      }
      
    } catch (error) {
      this.log('error', `Failed to resume Scavenger: ${error.message}`);
    }
  }

  /**
   * Find Scavenger process PID
   */
  findScavengerPid() {
    return new Promise((resolve) => {
      exec(`pgrep -f "${this.options.scavengerProcessName}"`, (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
        } else {
          // Get first PID if multiple
          const pid = parseInt(stdout.trim().split('\n')[0], 10);
          resolve(isNaN(pid) ? null : pid);
        }
      });
    });
  }

  /**
   * Emergency flatten - close all positions immediately
   */
  async emergencyFlatten(reason = 'manual') {
    if (this.emergencyFlattenInProgress) {
      this.log('warn', 'Emergency flatten already in progress');
      return { success: false, error: 'Already in progress' };
    }
    
    this.emergencyFlattenInProgress = true;
    const startTime = Date.now();
    const results = [];
    
    try {
      this.log('warn', `Emergency flatten triggered: ${reason}`);
      
      // Get all open positions from Shadow State
      const positions = this.shadowState ? this.shadowState.getAllPositions() : [];
      
      if (positions.length === 0) {
        this.log('info', 'No open positions to flatten');
        return { success: true, closedCount: 0, results: [] };
      }
      
      this.log('warn', `Flattening ${positions.length} positions...`);
      
      // Close all positions with Market orders
      const closePromises = positions.map(async (position) => {
        try {
          const result = await this.closePosition(position);
          results.push({
            position_id: position.position_id,
            symbol: position.symbol,
            success: true,
            ...result
          });
        } catch (error) {
          results.push({
            position_id: position.position_id,
            symbol: position.symbol,
            success: false,
            error: error.message
          });
        }
      });
      
      // Wait for all closes with timeout
      await Promise.race([
        Promise.all(closePromises),
        this.timeout(this.options.flattenTimeoutMs)
      ]);
      
      // Disable Master Arm
      await this.disableMasterArm();
      
      // Log event
      const duration = Date.now() - startTime;
      await this.logSystemEvent('EMERGENCY_FLATTEN', 'critical', {
        message: `Emergency flatten completed in ${duration}ms`,
        reason,
        closedCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        results
      });
      
      this.emit('emergencyFlatten', {
        reason,
        results,
        duration
      });
      
      return {
        success: true,
        closedCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        duration,
        results
      };
      
    } catch (error) {
      this.log('error', `Emergency flatten failed: ${error.message}`);
      
      await this.logSystemEvent('EMERGENCY_FLATTEN_FAILED', 'critical', {
        message: `Emergency flatten failed: ${error.message}`,
        reason,
        error: error.stack
      });
      
      return {
        success: false,
        error: error.message,
        results
      };
      
    } finally {
      this.emergencyFlattenInProgress = false;
    }
  }

  /**
   * Close a single position
   */
  async closePosition(position) {
    if (!this.brokerGateway) {
      throw new Error('BrokerGateway not available');
    }
    
    const closeSide = position.side === 'Buy' ? 'Sell' : 'Buy';
    
    const result = await this.brokerGateway.sendOrder({
      symbol: position.symbol,
      side: closeSide,
      orderType: 'MARKET',
      qty: position.size,
      reduceOnly: true
    });
    
    // Update Shadow State
    if (this.shadowState) {
      this.shadowState.closePosition(position.position_id, result.fill_price);
    }
    
    return result;
  }

  /**
   * Disable Master Arm
   */
  async disableMasterArm() {
    if (this.systemState) {
      this.systemState.master_arm = false;
    }
    
    if (this.databaseManager) {
      await this.databaseManager.updateSystemState({ master_arm: false });
    }
    
    this.log('warn', 'Master Arm disabled');
    this.emit('masterArmDisabled');
  }

  /**
   * Log system event to database
   */
  async logSystemEvent(eventType, severity, context) {
    if (this.databaseManager) {
      try {
        await this.databaseManager.logSystemEvent({
          event_type: eventType,
          severity,
          service: 'core',
          message: context.message || eventType,
          context: JSON.stringify(context)
        });
      } catch (error) {
        this.log('error', `Failed to log system event: ${error.message}`);
      }
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      bybitConnected: this.bybitConnected,
      scavengerPaused: this.scavengerPaused,
      scavengerPid: this.scavengerPid,
      emergencyFlattenInProgress: this.emergencyFlattenInProgress
    };
  }

  /**
   * Timeout helper
   */
  timeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), ms);
    });
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'emergency-brake',
      level,
      message,
      ...context
    };
    
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log(level, message, context);
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
}

module.exports = EmergencyBrake;
