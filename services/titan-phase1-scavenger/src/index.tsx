/**
 * Titan Phase 1 - Scavenger (Predestination Engine)
 * Main Application Entry Point
 * 
 * Initializes all components and orchestrates the three-layer trap system:
 * 1. Pre-Computation Layer (The Web): Calculates tripwires every 1 minute
 * 2. Detection Layer (The Spider): Monitors Binance WebSocket for tripwire hits
 * 3. Execution Layer (The Bite): Fires orders on Bybit when traps spring
 * 
 * Requirements: 1.1-1.7 (Three-Layer Trap Architecture)
 */

import React from 'react';
import { render } from 'ink';
import { TitanTrap } from './engine/TitanTrap.js';
import { BinanceSpotClient } from './exchanges/BinanceSpotClient.js';
import { BybitPerpsClient } from './exchanges/BybitPerpsClient.js';
import { ConfigManager } from './config/ConfigManager.js';
import { CredentialManager } from './config/CredentialManager.js';
import { TripwireCalculators } from './calculators/TripwireCalculators.js';
import { VelocityCalculator } from './calculators/VelocityCalculator.js';
import { PositionSizeCalculator } from './calculators/PositionSizeCalculator.js';
import { CVDCalculator } from './calculators/CVDCalculator.js';
import { VolumeValidator } from './validators/VolumeValidator.js';
import { OIWipeoutDetector } from './detectors/OIWipeoutDetector.js';
import { FundingSqueezeDetector } from './detectors/FundingSqueezeDetector.js';
import { BasisArbDetector } from './detectors/BasisArbDetector.js';
import { UltimateBulgariaProtocol } from './detectors/UltimateBulgariaProtocol.js';
import { TrapMonitor, type SensorStatus, type LiveEvent, type Tripwire } from './console/TrapMonitor.js';
import { ConsoleClient } from './console/ConsoleClient.js';
import { Logger } from './logging/Logger.js';
import { EventEmitter } from './events/EventEmitter.js';
import { HealthServer, type HealthStatus } from './server/HealthServer.js';

/**
 * Application state
 */
interface AppState {
  trapMap: Map<string, Tripwire[]>;
  sensorStatus: SensorStatus;
  liveFeed: LiveEvent[];
  equity: number;
  pnlPct: number;
  isPaused: boolean;
  showConfig: boolean;
}

/**
 * Main Application Class
 */
class TitanScavengerApp {
  // Core components
  private titanTrap!: TitanTrap;
  private binanceClient!: BinanceSpotClient;
  private bybitClient!: BybitPerpsClient;
  private configManager!: ConfigManager;
  private credentialManager!: CredentialManager;
  private logger!: Logger;
  private eventEmitter!: EventEmitter;
  private consoleClient!: ConsoleClient;
  
  // Calculators
  private tripwireCalculators!: TripwireCalculators;
  private velocityCalculator!: VelocityCalculator;
  private positionSizeCalculator!: PositionSizeCalculator;
  private cvdCalculator!: CVDCalculator;
  private volumeValidator!: VolumeValidator;
  
  // Detectors
  private oiDetector!: OIWipeoutDetector;
  private fundingDetector!: FundingSqueezeDetector;
  private basisDetector!: BasisArbDetector;
  private ultimateProtocol!: UltimateBulgariaProtocol;
  
  // Application state
  private state: AppState = {
    trapMap: new Map(),
    sensorStatus: {
      binanceHealth: 'DOWN',
      binanceTickRate: 0,
      bybitStatus: 'DOWN',
      bybitPing: 0,
      slippage: 0
    },
    liveFeed: [],
    equity: 0,
    pnlPct: 0,
    isPaused: false,
    showConfig: false
  };
  
  // Ink render instance
  private inkInstance: any;
  
  // Health server
  private healthServer!: HealthServer;
  
  // Sensor monitoring intervals
  private sensorMonitorInterval?: NodeJS.Timeout;
  private binanceTickCounter = 0;
  private lastTickTime = Date.now();
  private lastTrapSprungTime: number | null = null;
  
  // Headless mode flag
  private headless: boolean;
  
  // Health server port
  private healthPort: number;
  
  constructor(headless: boolean = false, healthPort: number = 8081) {
    this.headless = headless;
    this.healthPort = healthPort;
  }
  
  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Titan Phase 1 - Scavenger (Predestination Engine)...\n');
    
    try {
      // 1. Initialize configuration
      this.addLiveEvent('INFO', 'Loading configuration...');
      this.configManager = new ConfigManager();
      const config = this.configManager.getConfig();
      console.log('✅ Configuration loaded');
      
      // 2. Initialize credential manager
      this.addLiveEvent('INFO', 'Loading credentials...');
      this.credentialManager = new CredentialManager();
      const credentials = await this.credentialManager.loadCredentials();
      console.log('✅ Credentials loaded');
      
      // 3. Initialize logger
      this.addLiveEvent('INFO', 'Initializing logger...');
      this.logger = new Logger();
      console.log('✅ Logger initialized');
      
      // 4. Initialize event emitter
      this.eventEmitter = new EventEmitter();
      this.setupEventListeners();
      console.log('✅ Event emitter initialized');
      
      // 4.5. Initialize Console Client (for pushing real-time updates)
      const consoleUrl = process.env.CONSOLE_URL || '';
      this.consoleClient = new ConsoleClient({
        consoleUrl,
        enabled: !!consoleUrl,
        retryAttempts: 3,
        retryDelayMs: 1000
      });
      
      if (consoleUrl) {
        await this.consoleClient.connect();
      }
      
      // 5. Initialize exchange clients
      this.addLiveEvent('INFO', 'Connecting to Binance Spot...');
      
      // Binance Spot Client (Signal Validator)
      this.binanceClient = new BinanceSpotClient();
      // Note: Trade callbacks will be set up after trap map is initialized
      console.log('✅ Binance Spot client initialized');
      
      // NOTE: Bybit/MEXC execution is now handled by titan-execution service via Fast Path IPC,
      // but TitanTrap still needs BybitPerpsClient for read-only market data and equity checks.
      this.bybitClient = new BybitPerpsClient(
        credentials.bybit.apiKey,
        credentials.bybit.apiSecret
      );
      console.log('✅ Bybit Perps client initialized (Read-Only Mode)');
      console.log('✅ Execution will be handled by titan-execution service');
      
      // 6. Initialize calculators
      this.addLiveEvent('INFO', 'Initializing calculators...');
      this.tripwireCalculators = new TripwireCalculators();
      this.velocityCalculator = new VelocityCalculator();
      this.positionSizeCalculator = new PositionSizeCalculator();
      this.cvdCalculator = new CVDCalculator();
      this.volumeValidator = new VolumeValidator();
      console.log('✅ Calculators initialized');
      
      // 7. Initialize detectors
      this.addLiveEvent('INFO', 'Initializing structural flaw detectors...');
      // NOTE: Detectors now use null for bybitClient since execution is handled by titan-execution
      this.oiDetector = new OIWipeoutDetector(this.bybitClient, this.cvdCalculator);
      this.fundingDetector = new FundingSqueezeDetector(this.bybitClient, this.cvdCalculator);
      this.basisDetector = new BasisArbDetector(this.binanceClient, this.bybitClient);
      this.ultimateProtocol = new UltimateBulgariaProtocol(
        this.bybitClient,
        this.binanceClient,
        this.oiDetector
      );
      console.log('✅ Structural flaw detectors initialized');
      
      // 8. Initialize TitanTrap engine
      this.addLiveEvent('INFO', 'Initializing TitanTrap engine...');
      this.titanTrap = new TitanTrap({
        binanceClient: this.binanceClient,
        bybitClient: this.bybitClient, // Execution handled by titan-execution service
        logger: this.logger,
        config: this.configManager,
        eventEmitter: this.eventEmitter,
        tripwireCalculators: this.tripwireCalculators,
        velocityCalculator: this.velocityCalculator,
        positionSizeCalculator: this.positionSizeCalculator,
        oiDetector: this.oiDetector,
        fundingDetector: this.fundingDetector,
        basisDetector: this.basisDetector,
        ultimateProtocol: this.ultimateProtocol
      });
      console.log('✅ TitanTrap engine initialized');
      
      // 9. Initialize Health Server (port 8081)
      // Requirements: System Integration 11.2, 22.3
      this.addLiveEvent('INFO', 'Initializing Health Server...');
      this.healthServer = new HealthServer({
        port: this.healthPort,
        getStatus: () => this.getHealthStatus()
      });
      await this.healthServer.start();
      console.log(`✅ Health server initialized on port ${this.healthPort}`);
      
      console.log('\n✅ All components initialized successfully\n');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.addLiveEvent('ERROR', `Initialization failed: ${error}`);
      throw error;
    }
  }
  
  /**
   * Start the application
   */
  async start(): Promise<void> {
    try {
      console.log('🕸️ Starting Titan Predestination Engine...\n');
      
      // 1. Start TitanTrap engine (Pre-Computation Layer + Background loops)
      this.addLiveEvent('INFO', 'Starting Pre-Computation Layer...');
      await this.titanTrap.start();
      this.updateSensorStatus('bybitStatus', 'ARMED');
      
      // 2. Setup Binance trade callbacks for symbols in trap map
      this.setupBinanceCallbacks();
      
      // 3. Start Detection Layer (Binance WebSocket already subscribed by TitanTrap)
      this.addLiveEvent('INFO', 'Detection Layer active (Binance WebSocket)');
      this.updateSensorStatus('binanceHealth', 'OK');
      
      // 4. Start sensor monitoring
      this.startSensorMonitoring();
      
      // 5. Render Trap Monitor dashboard (skip in headless mode)
      if (!this.headless) {
        this.addLiveEvent('INFO', 'Rendering Trap Monitor dashboard...');
        this.renderDashboard();
        
        // 6. Setup keyboard input handlers
        this.setupKeyboardHandlers();
      } else {
        console.log('🤖 Running in headless mode - UI disabled');
        
        // Setup signal handlers for graceful shutdown
        this.setupSignalHandlers();
      }
      
      console.log('✅ Titan Predestination Engine started\n');
      console.log('🎯 Waiting for traps to spring...\n');
      
      this.addLiveEvent('INFO', '🕸️ Predestination Engine ARMED - Traps are set');
      
    } catch (error) {
      console.error('❌ Start failed:', error);
      this.addLiveEvent('ERROR', `Start failed: ${error}`);
      throw error;
    }
  }
  
  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    console.log('\n🛑 Stopping Titan Predestination Engine...');
    
    try {
      // Stop sensor monitoring
      if (this.sensorMonitorInterval) {
        clearInterval(this.sensorMonitorInterval);
      }
      
      // Stop TitanTrap engine
      await this.titanTrap.stop();
      
      // Stop health server
      if (this.healthServer) {
        await this.healthServer.stop();
      }
      
      // Unmount Ink UI
      if (this.inkInstance) {
        this.inkInstance.unmount();
      }
      
      console.log('✅ Titan Predestination Engine stopped');
      
    } catch (error) {
      console.error('❌ Stop failed:', error);
    }
  }
  
  /**
   * Get health status for health server
   * Requirements: System Integration 11.2
   */
  private getHealthStatus(): HealthStatus {
    const binanceConnected = this.state.sensorStatus.binanceHealth === 'OK';
    const executionConnected = this.consoleClient?.isConnectedToConsole() || false;
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!binanceConnected) {
      status = 'unhealthy';
    } else if (!executionConnected) {
      status = 'degraded';
    }
    
    return {
      status,
      service: 'titan-scavenger',
      version: '1.0.0',
      uptime: Math.floor((Date.now() - (this.lastTickTime - this.binanceTickCounter * 1000)) / 1000),
      connections: {
        binance: binanceConnected ? 'connected' : 'disconnected',
        executionService: executionConnected ? 'connected' : 'unknown'
      },
      metrics: {
        activeTraps: this.state.trapMap.size,
        tickRate: this.state.sensorStatus.binanceTickRate,
        lastTrapSprung: this.lastTrapSprungTime
      },
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // TRAP_MAP_UPDATED event
    this.eventEmitter.on('TRAP_MAP_UPDATED', (data: any) => {
      this.state.trapMap = this.titanTrap.getTrapMap();
      this.addLiveEvent('INFO', `Trap Map updated: ${data.symbolCount} symbols`);
      
      // Refresh Binance callbacks for new symbols
      this.setupBinanceCallbacks();
      
      // Push to Console
      // Requirements: 12.1 - Push trap_map_updated message via WebSocket
      this.consoleClient.pushTrapMapUpdate({
        symbolCount: data.symbolCount,
        symbols: Array.from(this.state.trapMap.keys()),
        timestamp: Date.now()
      }).catch(err => {
        console.warn('Failed to push trap map update to Console:', err.message);
      });
      
      this.rerender();
    });
    
    // TRAP_SPRUNG event
    this.eventEmitter.on('TRAP_SPRUNG', (data: any) => {
      this.addLiveEvent('TRAP_SPRUNG', `⚡ ${data.symbol} ${data.trapType} @ ${data.price.toFixed(2)}`);
      
      // Track last trap sprung time for health status
      this.lastTrapSprungTime = Date.now();
      
      // Push to Console
      // Requirements: 12.3 - Push trap_sprung message with trap details
      this.consoleClient.pushTrapSprung({
        symbol: data.symbol,
        trapType: data.trapType,
        price: data.price,
        direction: data.direction || 'LONG',
        confidence: data.confidence || 0,
        timestamp: Date.now()
      }).catch(err => {
        console.warn('Failed to push trap sprung to Console:', err.message);
      });
      
      this.rerender();
    });
    
    // EXECUTION_COMPLETE event
    this.eventEmitter.on('EXECUTION_COMPLETE', (data: any) => {
      this.addLiveEvent('EXECUTION_COMPLETE', `✅ ${data.symbol} filled @ ${data.fillPrice.toFixed(2)}`);
      
      // Push to Console
      this.consoleClient.pushExecutionComplete({
        symbol: data.symbol,
        fillPrice: data.fillPrice,
        fillSize: data.fillSize || 0,
        side: data.side || 'BUY',
        timestamp: Date.now()
      }).catch(err => {
        console.warn('Failed to push execution complete to Console:', err.message);
      });
      
      this.rerender();
    });
    
    // ERROR event
    this.eventEmitter.on('ERROR', (data: any) => {
      this.addLiveEvent('ERROR', `❌ ${data.message}`);
      this.rerender();
    });
  }
  
  /**
   * Setup Binance trade callbacks for all symbols in trap map
   */
  private setupBinanceCallbacks(): void {
    const trapMap = this.titanTrap.getTrapMap();
    
    for (const symbol of trapMap.keys()) {
      this.binanceClient.onTrade(symbol, (trades: any[]) => {
        // Get current price from first trade
        const price = trades[0].price;
        
        // Forward to onBinanceTick handler
        this.onBinanceTick(symbol, price, trades);
      });
    }
  }
  
  /**
   * Handle Binance tick (Detection Layer)
   */
  private onBinanceTick(symbol: string, price: number, trades: any[]): void {
    // Update tick counter for sensor monitoring
    this.binanceTickCounter++;
    
    // Skip if paused
    if (this.state.isPaused) return;
    
    // Forward to TitanTrap engine
    this.titanTrap.onBinanceTick(symbol, price, trades);
  }
  
  /**
   * Start sensor monitoring (update sensor status every second)
   */
  private startSensorMonitoring(): void {
    this.sensorMonitorInterval = setInterval(() => {
      this.updateSensorMetrics();
    }, 1000);
  }
  
  /**
   * Update sensor metrics
   */
  private async updateSensorMetrics(): Promise<void> {
    try {
      // Calculate Binance tick rate
      const now = Date.now();
      const elapsed = (now - this.lastTickTime) / 1000;
      const tickRate = Math.round(this.binanceTickCounter / elapsed);
      
      this.updateSensorStatus('binanceTickRate', tickRate);
      
      // Reset counter
      this.binanceTickCounter = 0;
      this.lastTickTime = now;
      
      // NOTE: Bybit ping is now handled by titan-execution service
      // Set default values for now
      this.updateSensorStatus('bybitPing', 0);
      this.updateSensorStatus('slippage', 0);
      
      // Update equity and P&L
      this.state.equity = this.titanTrap.getCachedEquity();
      
      // Push sensor status to Console
      // Requirements: 12.2 - Push sensor_status_updated message
      this.consoleClient.pushSensorStatusUpdate({
        binanceHealth: this.state.sensorStatus.binanceHealth,
        binanceTickRate: this.state.sensorStatus.binanceTickRate,
        bybitStatus: this.state.sensorStatus.bybitStatus,
        bybitPing: this.state.sensorStatus.bybitPing,
        slippage: this.state.sensorStatus.slippage,
        timestamp: Date.now()
      }).catch(err => {
        // Silently fail - don't spam console
      });
      
      // Rerender dashboard
      this.rerender();
      
    } catch (error) {
      console.error('⚠️ Sensor monitoring error:', error);
      this.updateSensorStatus('bybitStatus', 'DEGRADED');
    }
  }
  
  /**
   * Update sensor status field
   */
  private updateSensorStatus(field: keyof SensorStatus, value: any): void {
    this.state.sensorStatus = {
      ...this.state.sensorStatus,
      [field]: value
    };
  }
  
  /**
   * Add live event to feed
   */
  private addLiveEvent(type: LiveEvent['type'], message: string): void {
    const event: LiveEvent = {
      timestamp: Date.now(),
      type,
      message
    };
    
    // In headless mode, log to stdout as JSON
    if (this.headless) {
      console.log(JSON.stringify({
        timestamp: event.timestamp,
        type: event.type,
        message: event.message,
        source: 'scavenger'
      }));
    }
    
    this.state.liveFeed.push(event);
    
    // Keep only last 50 events
    if (this.state.liveFeed.length > 50) {
      this.state.liveFeed = this.state.liveFeed.slice(-50);
    }
  }
  
  /**
   * Render Trap Monitor dashboard
   */
  private renderDashboard(): void {
    this.inkInstance = render(
      <TrapMonitor
        trapMap={this.state.trapMap}
        sensorStatus={this.state.sensorStatus}
        liveFeed={this.state.liveFeed}
        equity={this.state.equity}
        pnlPct={this.state.pnlPct}
      />
    );
  }
  
  /**
   * Rerender dashboard (update state)
   */
  private rerender(): void {
    // Skip rendering in headless mode
    if (this.headless) return;
    
    if (this.inkInstance) {
      this.inkInstance.rerender(
        <TrapMonitor
          trapMap={this.state.trapMap}
          sensorStatus={this.state.sensorStatus}
          liveFeed={this.state.liveFeed}
          equity={this.state.equity}
          pnlPct={this.state.pnlPct}
        />
      );
    }
  }
  
  /**
   * Setup keyboard input handlers
   */
  private setupKeyboardHandlers(): void {
    // Handle stdin input
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', (key: string) => {
      // Q - Quit
      if (key === 'q' || key === 'Q' || key === '\u0003') {  // Ctrl+C
        this.handleQuit();
      }
      
      // SPACE - Pause/Resume
      if (key === ' ') {
        this.handlePause();
      }
      
      // F1 - Config (not implemented in this task)
      if (key === '\u001bOP') {  // F1 key
        this.handleConfig();
      }
    });
  }
  
  /**
   * Setup signal handlers for graceful shutdown (headless mode)
   */
  private setupSignalHandlers(): void {
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      this.handleQuit();
    });
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      this.handleQuit();
    });
  }
  
  /**
   * Handle quit command
   */
  private async handleQuit(): Promise<void> {
    console.log('\n👋 Shutting down gracefully...');
    await this.stop();
    process.exit(0);
  }
  
  /**
   * Handle pause/resume command
   */
  private handlePause(): void {
    this.state.isPaused = !this.state.isPaused;
    
    if (this.state.isPaused) {
      this.addLiveEvent('INFO', '⏸️  PAUSED - Detection Layer suspended');
      console.log('\n⏸️  PAUSED - Press SPACE to resume');
    } else {
      this.addLiveEvent('INFO', '▶️  RESUMED - Detection Layer active');
      console.log('\n▶️  RESUMED');
    }
    
    this.rerender();
  }
  
  /**
   * Handle config command (placeholder)
   */
  private handleConfig(): void {
    this.addLiveEvent('INFO', 'Config panel not implemented in this task');
    console.log('\n⚠️  Config panel not implemented yet (Task 25)');
  }
}

/**
 * Parse command line arguments
 * 
 * --headless: Run without Ink UI (default: true)
 * --ui: Run with Ink UI (legacy mode)
 */
function parseArgs(): { headless: boolean } {
  const args = process.argv.slice(2);
  // Default to headless mode - use --ui flag to enable Ink UI
  const useUI = args.includes('--ui');
  return {
    headless: !useUI
  };
}

/**
 * Main entry point
 * 
 * Scavenger now runs headless by default.

 * Use --ui flag to enable legacy Ink terminal UI.
 */
async function main() {
  const { headless } = parseArgs();
  
  if (headless) {
    console.log('🤖 Running in headless mode (default)');
    console.log('📺 Monitor via Console at http://localhost:3000');
  } else {
    console.log('🖥️ Running with Ink UI (legacy mode)');
    console.log('💡 Tip: Use headless mode (default) for production');
  }
  
  const app = new TitanScavengerApp(headless);
  
  try {
    // Initialize all components
    await app.initialize();
    
    // Start the application
    await app.start();
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
