/**
 * Titan Boot Sequence Manager
 * 
 * Handles ordered startup of Titan Core with dependency management.
 * Emits 'ready' signal for PM2 when all components are initialized.
 * 
 * Boot Order:
 * 1. Load config.json
 * 2. Decrypt API keys
 * 3. Initialize database
 * 4. Restore Shadow State from positions table
 * 5. Connect to Bybit WebSocket
 * 6. Load system_state from database
 * 7. Set status to WAITING_FOR_BRAIN
 * 8. Emit 'ready' signal for PM2
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

class BootSequence extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      configPath: options.configPath || './config/config.json',
      secretsPath: options.secretsPath || './config/secrets.enc',
      databasePath: options.databasePath || process.env.DATABASE_PATH || './titan_execution.db',
      masterPassword: options.masterPassword || process.env.TITAN_MASTER_PASSWORD,
      ...options
    };
    
    this.status = 'INITIALIZING';
    this.components = {
      config: false,
      credentials: false,
      database: false,
      shadowState: false,
      bybitWs: false,
      systemState: false
    };
    
    this.config = null;
    this.credentials = null;
    this.startTime = Date.now();
    this.errors = [];
  }

  /**
   * Execute the full boot sequence
   */
  async boot(dependencies = {}) {
    const { DatabaseManager, ShadowState, BrokerGateway, ConfigManager, StructuredLogger } = dependencies;
    
    this.logger = StructuredLogger || console;
    this.log('info', 'Starting Titan Core boot sequence...');
    
    try {
      // Step 1: Load configuration
      await this.loadConfig(ConfigManager);
      
      // Step 2: Decrypt API keys
      await this.decryptCredentials();
      
      // Step 3: Initialize database
      await this.initializeDatabase(DatabaseManager);
      
      // Step 4: Restore Shadow State
      await this.restoreShadowState(ShadowState);
      
      // Step 5: Connect to Bybit WebSocket
      await this.connectBroker(BrokerGateway);
      
      // Step 6: Load system state
      await this.loadSystemState();
      
      // Step 7: Set status to WAITING_FOR_BRAIN
      this.setStatus('WAITING_FOR_BRAIN');
      
      // Step 8: Emit ready signal for PM2
      this.emitReady();
      
      const bootTime = Date.now() - this.startTime;
      this.log('info', `Boot sequence completed in ${bootTime}ms`);
      
      return {
        success: true,
        bootTime,
        components: this.components,
        status: this.status
      };
      
    } catch (error) {
      this.log('error', `Boot sequence failed: ${error.message}`, { error: error.stack });
      this.setStatus('BOOT_FAILED');
      this.errors.push(error);
      
      return {
        success: false,
        error: error.message,
        components: this.components,
        status: this.status
      };
    }
  }

  /**
   * Step 1: Load configuration
   */
  async loadConfig(ConfigManager) {
    this.log('info', 'Step 1/8: Loading configuration...');
    
    try {
      if (ConfigManager) {
        this.configManager = new ConfigManager();
        this.config = this.configManager.getConfig();
      } else {
        // Fallback to direct file read
        const configPath = path.resolve(this.options.configPath);
        if (fs.existsSync(configPath)) {
          const configData = fs.readFileSync(configPath, 'utf8');
          this.config = JSON.parse(configData);
        } else {
          this.config = this.getDefaultConfig();
          this.log('warn', 'Config file not found, using defaults');
        }
      }
      
      this.components.config = true;
      this.log('info', 'Configuration loaded successfully');
      
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error.message}`);
    }
  }

  /**
   * Step 2: Decrypt API credentials
   */
  async decryptCredentials() {
    this.log('info', 'Step 2/8: Decrypting API credentials...');
    
    try {
      // Check for environment variables first (production)
      if (process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET) {
        this.credentials = {
          bybit: {
            apiKey: process.env.BYBIT_API_KEY,
            apiSecret: process.env.BYBIT_API_SECRET
          },
          mexc: {
            apiKey: process.env.MEXC_API_KEY || '',
            apiSecret: process.env.MEXC_API_SECRET || ''
          }
        };
        this.components.credentials = true;
        this.log('info', 'Credentials loaded from environment variables');
        return;
      }
      
      // Try to decrypt from secrets file
      const secretsPath = path.resolve(this.options.secretsPath);
      if (fs.existsSync(secretsPath)) {
        if (!this.options.masterPassword) {
          throw new Error('Master password required to decrypt credentials');
        }
        
        const encryptedData = fs.readFileSync(secretsPath, 'utf8');
        this.credentials = this.decrypt(encryptedData, this.options.masterPassword);
        this.components.credentials = true;
        this.log('info', 'Credentials decrypted successfully');
        
      } else {
        this.log('warn', 'No credentials found - running in read-only mode');
        this.credentials = { bybit: {}, mexc: {} };
        this.components.credentials = true;
      }
      
    } catch (error) {
      throw new Error(`Failed to decrypt credentials: ${error.message}`);
    }
  }

  /**
   * Step 3: Initialize database
   */
  async initializeDatabase(DatabaseManager) {
    this.log('info', 'Step 3/8: Initializing database...');
    
    try {
      if (DatabaseManager) {
        this.db = new DatabaseManager(this.options.databasePath);
        await this.db.initialize();
      } else {
        // Minimal database check
        const dbPath = path.resolve(this.options.databasePath);
        if (!fs.existsSync(dbPath)) {
          this.log('warn', 'Database file not found, will be created on first write');
        }
      }
      
      this.components.database = true;
      this.log('info', 'Database initialized successfully');
      
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }

  /**
   * Step 4: Restore Shadow State from positions table
   */
  async restoreShadowState(ShadowState) {
    this.log('info', 'Step 4/8: Restoring Shadow State...');
    
    try {
      if (ShadowState) {
        this.shadowState = new ShadowState();
        
        // Restore from database if available
        if (this.db) {
          const openPositions = await this.db.getOpenPositions();
          for (const position of openPositions) {
            this.shadowState.restorePosition(position);
          }
          this.log('info', `Restored ${openPositions.length} positions from database`);
        }
      }
      
      this.components.shadowState = true;
      this.log('info', 'Shadow State restored successfully');
      
    } catch (error) {
      throw new Error(`Failed to restore Shadow State: ${error.message}`);
    }
  }

  /**
   * Step 5: Connect to Bybit WebSocket
   */
  async connectBroker(BrokerGateway) {
    this.log('info', 'Step 5/8: Connecting to Bybit WebSocket...');
    
    try {
      if (BrokerGateway && this.credentials?.bybit?.apiKey) {
        this.broker = new BrokerGateway({
          exchange: 'bybit',
          apiKey: this.credentials.bybit.apiKey,
          apiSecret: this.credentials.bybit.apiSecret,
          testnet: this.config?.testnet || false
        });
        
        // Wait for WebSocket connection with timeout
        await Promise.race([
          this.broker.connect(),
          this.timeout(10000, 'Bybit WebSocket connection timeout')
        ]);
        
        this.components.bybitWs = true;
        this.log('info', 'Bybit WebSocket connected successfully');
        
      } else {
        this.log('warn', 'Skipping broker connection (no credentials or BrokerGateway)');
        this.components.bybitWs = true; // Mark as complete even if skipped
      }
      
    } catch (error) {
      throw new Error(`Failed to connect to Bybit: ${error.message}`);
    }
  }

  /**
   * Step 6: Load system state from database
   */
  async loadSystemState() {
    this.log('info', 'Step 6/8: Loading system state...');
    
    try {
      if (this.db) {
        this.systemState = await this.db.getSystemState();
        
        if (!this.systemState) {
          // Initialize default system state
          this.systemState = {
            nav: 200.0,
            active_phase: 1,
            high_watermark: 200.0,
            master_arm: false,
            circuit_breaker: false
          };
          await this.db.updateSystemState(this.systemState);
          this.log('info', 'Initialized default system state');
        }
      } else {
        this.systemState = {
          nav: 200.0,
          active_phase: 1,
          high_watermark: 200.0,
          master_arm: false,
          circuit_breaker: false
        };
      }
      
      this.components.systemState = true;
      this.log('info', `System state loaded: Phase ${this.systemState.active_phase}, NAV $${this.systemState.nav}`);
      
    } catch (error) {
      throw new Error(`Failed to load system state: ${error.message}`);
    }
  }

  /**
   * Set boot status
   */
  setStatus(status) {
    const oldStatus = this.status;
    this.status = status;
    this.emit('statusChange', { oldStatus, newStatus: status });
    this.log('info', `Status changed: ${oldStatus} → ${status}`);
  }

  /**
   * Emit ready signal for PM2
   */
  emitReady() {
    this.log('info', 'Step 8/8: Emitting ready signal...');
    
    // PM2 ready signal
    if (process.send) {
      process.send('ready');
      this.log('info', 'PM2 ready signal sent');
    }
    
    this.emit('ready', {
      status: this.status,
      components: this.components,
      systemState: this.systemState,
      bootTime: Date.now() - this.startTime
    });
  }

  /**
   * Get health status
   */
  getHealth() {
    const allComponentsReady = Object.values(this.components).every(v => v === true);
    
    return {
      status: this.status,
      healthy: allComponentsReady && this.status !== 'BOOT_FAILED',
      components: this.components,
      uptime: Date.now() - this.startTime,
      systemState: this.systemState ? {
        nav: this.systemState.nav,
        phase: this.systemState.active_phase,
        masterArm: this.systemState.master_arm,
        circuitBreaker: this.systemState.circuit_breaker
      } : null,
      errors: this.errors.map(e => e.message)
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decrypt(encryptedData, password) {
    const data = JSON.parse(encryptedData);
    const key = crypto.scryptSync(password, data.salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(data.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Timeout helper
   */
  timeout(ms, message) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    });
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      testnet: process.env.NODE_ENV !== 'production',
      maxLeverage: 20,
      maxDrawdown: 0.20,
      riskPerTrade: 0.02,
      exchanges: {
        bybit: { enabled: true },
        mexc: { enabled: false }
      }
    };
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'boot-sequence',
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

module.exports = BootSequence;
