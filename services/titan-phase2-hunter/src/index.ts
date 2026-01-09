/**
 * Titan Phase 2 - The Hunter
 * Holographic Market Structure Engine for Institutional-Grade Swing Trading
 * 
 * Main Application Loop - Task 23
 * 
 * Responsibilities:
 * - Initialize all components (HologramEngine, SessionProfiler, InefficiencyMapper, CVDValidator)
 * - Start Hologram Scan Cycle (5-minute interval)
 * - Start Session Monitoring (real-time)
 * - Start POI Detection Cycle (1-minute interval)
 * - Start CVD Monitoring (real-time WebSocket)
 * - Render Hunter HUD dashboard
 * - Handle keyboard input (F1, F2, SPACE, Q)
 * 
 * Requirements: All requirements (Integration)
 */

import { config } from 'dotenv';
import { ConfigManager } from './config/ConfigManager';
import { HologramEngine } from './engine/HologramEngine';
import { HologramScanner } from './engine/HologramScanner';
import { SessionProfiler } from './engine/SessionProfiler';
import { InefficiencyMapper } from './engine/InefficiencyMapper';
import { CVDValidator } from './engine/CVDValidator';
import { BybitPerpsClient } from './exchanges/BybitPerpsClient';
import { BinanceSpotClient } from './exchanges/BinanceSpotClient';
import { startHunterApp } from './console/HunterApp';
import { hunterEvents } from './events';
import { HologramState, SessionState, POI, SignalData } from './types';
import { getLogger, logError } from './logging/Logger';

// Load environment variables
config();

/**
 * Main Hunter Application Class
 * Orchestrates all components and manages the application lifecycle
 */
class HunterApplication {
  private configManager: ConfigManager;
  private bybitClient: BybitPerpsClient;
  private binanceClient: BinanceSpotClient;
  private hologramEngine: HologramEngine;
  private hologramScanner: HologramScanner;
  private sessionProfiler: SessionProfiler;
  private inefficiencyMapper: InefficiencyMapper;
  private cvdValidator: CVDValidator;
  private logger = getLogger();
  
  // Application state
  private isRunning = false;
  private isPaused = false;
  private currentHolograms: HologramState[] = [];
  private currentSession: SessionState | null = null;
  private activePOIs: POI[] = [];
  
  // Interval timers
  private hologramScanInterval: NodeJS.Timeout | null = null;
  private sessionMonitorInterval: NodeJS.Timeout | null = null;
  private poiDetectionInterval: NodeJS.Timeout | null = null;
  
  // Constants
  private readonly HOLOGRAM_SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_MONITOR_INTERVAL = 1000; // 1 second (real-time)
  private readonly POI_DETECTION_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    // Initialize configuration manager
    this.configManager = new ConfigManager();
    
    // Initialize exchange clients
    this.bybitClient = new BybitPerpsClient();
    this.binanceClient = new BinanceSpotClient();
    
    // Initialize core engines
    this.hologramEngine = new HologramEngine(this.bybitClient);
    this.hologramScanner = new HologramScanner(this.bybitClient);
    this.sessionProfiler = new SessionProfiler();
    this.inefficiencyMapper = new InefficiencyMapper();
    this.cvdValidator = new CVDValidator();
    
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for all components
   */
  private setupEventListeners(): void {
    // Listen to our centralized event system
    hunterEvents.onEvent('HOLOGRAM_UPDATED', (payload) => {
      console.log(`🔍 Hologram updated for ${payload.symbol}: ${payload.hologramState.status}`);
    });

    hunterEvents.onEvent('SESSION_CHANGE', (payload) => {
      this.currentSession = payload.currentSession;
      console.log(`⏰ Session changed from ${payload.previousSession.type} to ${payload.currentSession.type}`);
    });

    hunterEvents.onEvent('CVD_ABSORPTION', (payload) => {
      console.log(`📈 CVD Absorption detected for ${payload.symbol} at ${payload.absorption.price}`);
    });

    hunterEvents.onEvent('CVD_DISTRIBUTION', (payload) => {
      console.log(`📉 CVD Distribution detected for ${payload.symbol} at ${payload.distribution.price}`);
    });

    hunterEvents.onEvent('SIGNAL_GENERATED', (payload) => {
      console.log(`🎯 Signal generated: ${payload.signal.direction} ${payload.signal.symbol} at ${payload.signal.entryPrice}`);
    });

    hunterEvents.onEvent('EXECUTION_COMPLETE', (payload) => {
      const status = payload.success ? '✅' : '❌';
      console.log(`${status} Execution complete: ${payload.execution.side} ${payload.execution.symbol} at ${payload.execution.fillPrice}`);
    });

    hunterEvents.onEvent('ERROR', (payload) => {
      const severityIcon = {
        'LOW': '⚠️',
        'MEDIUM': '🟡',
        'HIGH': '🟠',
        'CRITICAL': '🔴'
      }[payload.severity];
      console.error(`${severityIcon} Error in ${payload.component}: ${payload.error.message}`);
      
      // Log to structured logger
      this.logger.logError(
        payload.severity === 'CRITICAL' ? 'CRITICAL' : payload.severity === 'HIGH' ? 'ERROR' : 'WARNING',
        payload.error.message,
        {
          component: payload.component,
          stack: payload.error.stack,
          data: payload
        }
      );
    });

    hunterEvents.onEvent('SCAN_COMPLETE', (payload) => {
      console.log(`🔍 Scan complete: ${payload.symbolsScanned} symbols, ${payload.aPlus} A+, ${payload.bAlignment} B, ${payload.duration}ms`);
    });

    hunterEvents.onEvent('JUDAS_SWING_DETECTED', (payload) => {
      console.log(`🎣 Judas Swing detected: ${payload.judasSwing.type} during ${payload.sessionType} session`);
    });

    hunterEvents.onEvent('POI_DETECTED', (payload) => {
      console.log(`🎯 POI detected: ${payload.poiType} for ${payload.symbol} at ${payload.price} (${payload.distance.toFixed(2)}% away)`);
    });

    hunterEvents.onEvent('RISK_WARNING', (payload) => {
      const severityIcon = payload.severity === 'CRITICAL' ? '🚨' : '⚠️';
      console.log(`${severityIcon} Risk Warning: ${payload.message} (${payload.value}/${payload.threshold})`);
    });
  }

  /**
   * Initialize all components
   */
  private async initializeComponents(): Promise<void> {
    console.log('🔧 Initializing components...');
    
    try {
      // Initialize exchange clients
      console.log('📡 Initializing exchange clients...');
      await this.bybitClient.initialize();
      await this.binanceClient.initialize();
      
      // Start configuration watching
      this.configManager.startWatching();
      
      console.log('✅ All components initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize components:', error);
      this.logger.logError('CRITICAL', 'Failed to initialize components', {
        component: 'HunterApplication',
        function: 'initializeComponents',
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  /**
   * Start Hologram Scan Cycle (5-minute interval)
   * Requirements: 9.1-9.7 (Hologram Scanning Engine)
   */
  private startHologramScanCycle(): void {
    console.log('🔍 Starting hologram scan cycle (5-minute interval)...');
    
    // Run initial scan
    this.runHologramScan();
    
    // Setup recurring scan
    this.hologramScanInterval = setInterval(() => {
      if (!this.isPaused) {
        this.runHologramScan();
      }
    }, this.HOLOGRAM_SCAN_INTERVAL);
  }

  /**
   * Run a single hologram scan
   */
  private async runHologramScan(): Promise<void> {
    try {
      console.log('🔍 Running hologram scan...');
      const startTime = Date.now();
      const result = await this.hologramScanner.scan();
      const duration = Date.now() - startTime;
      
      // Update current holograms
      this.currentHolograms = result.top20;
      
      // Count alignment types
      const aPlus = result.top20.filter(h => h.status === 'A+').length;
      const b = result.top20.filter(h => h.status === 'B').length;
      const conflicts = result.top20.filter(h => h.status === 'CONFLICT').length;
      
      // Emit scan complete event
      hunterEvents.emitScanComplete(result.top20.length, aPlus, b, conflicts, duration);
      
    } catch (error) {
      console.error('❌ Hologram scan failed:', error);
      this.logger.logError('ERROR', 'Hologram scan failed', {
        component: 'HologramScanner',
        function: 'runHologramScan',
        stack: (error as Error).stack
      });
      hunterEvents.emitError('HologramScanner', error as Error, 'HIGH');
    }
  }

  /**
   * Start Session Monitoring (real-time)
   * Requirements: 2.1-2.7 (Session Profiler)
   */
  private startSessionMonitoring(): void {
    console.log('⏰ Starting session monitoring (real-time)...');
    
    // Run initial session check
    this.updateSessionState();
    
    // Setup real-time monitoring
    this.sessionMonitorInterval = setInterval(() => {
      if (!this.isPaused) {
        this.updateSessionState();
      }
    }, this.SESSION_MONITOR_INTERVAL);
  }

  /**
   * Update current session state
   */
  private updateSessionState(): void {
    const newSession = this.sessionProfiler.getSessionState();
    
    // Check if session changed
    if (!this.currentSession || this.currentSession.type !== newSession.type) {
      const previousSession = this.currentSession || newSession;
      this.currentSession = newSession;
      
      // Emit session change event
      hunterEvents.emitSessionChange(previousSession, newSession);
    }
  }

  /**
   * Start POI Detection Cycle (1-minute interval)
   * Requirements: 3.1-3.7 (Inefficiency Mapper), 10.1-10.7 (Liquidity Pool Detection)
   */
  private startPOIDetectionCycle(): void {
    console.log('🎯 Starting POI detection cycle (1-minute interval)...');
    
    // Run initial POI detection
    this.runPOIDetection();
    
    // Setup recurring detection
    this.poiDetectionInterval = setInterval(() => {
      if (!this.isPaused) {
        this.runPOIDetection();
      }
    }, this.POI_DETECTION_INTERVAL);
  }

  /**
   * Run POI detection for current symbols
   */
  private async runPOIDetection(): Promise<void> {
    try {
      if (this.currentHolograms.length === 0) {
        return; // No symbols to analyze
      }

      console.log('🎯 Running POI detection...');
      const newPOIs: POI[] = [];

      // Analyze top 5 symbols for POIs
      const topSymbols = this.currentHolograms.slice(0, 5);
      
      for (const hologram of topSymbols) {
        try {
          // Fetch recent candles for POI detection
          const candles = await this.bybitClient.fetchOHLCV(hologram.symbol, '15m', 100);
          
          // Detect FVGs
          const fvgs = this.inefficiencyMapper.detectFVG(candles);
          newPOIs.push(...fvgs);
          
          // Detect Order Blocks
          const orderBlocks = this.inefficiencyMapper.detectOrderBlock(candles, hologram.m15.bos);
          newPOIs.push(...orderBlocks);
          
          // Detect Liquidity Pools
          const liquidityPools = this.inefficiencyMapper.detectLiquidityPools(candles, hologram.m15.fractals);
          newPOIs.push(...liquidityPools);
          
        } catch (error) {
          console.error(`❌ POI detection failed for ${hologram.symbol}:`, error);
          this.logger.logError('WARNING', `POI detection failed for ${hologram.symbol}`, {
            symbol: hologram.symbol,
            component: 'InefficiencyMapper',
            function: 'runPOIDetection',
            stack: (error as Error).stack
          });
        }
      }

      // Update active POIs
      this.activePOIs = newPOIs;
      console.log(`🎯 POI detection complete: ${newPOIs.length} active POIs`);
      
    } catch (error) {
      console.error('❌ POI detection cycle failed:', error);
      this.logger.logError('ERROR', 'POI detection cycle failed', {
        component: 'InefficiencyMapper',
        function: 'runPOIDetection',
        stack: (error as Error).stack
      });
    }
  }

  /**
   * Start CVD Monitoring (real-time WebSocket)
   * Requirements: 4.1-4.7 (Order Flow X-Ray)
   */
  private startCVDMonitoring(): void {
    console.log('📊 Starting CVD monitoring (real-time WebSocket)...');
    
    // Subscribe to trade streams for top symbols
    this.updateCVDSubscriptions();
    
    // Update subscriptions when holograms change
    hunterEvents.onEvent('SCAN_COMPLETE', () => {
      this.updateCVDSubscriptions();
    });
  }

  /**
   * Update CVD WebSocket subscriptions
   */
  private updateCVDSubscriptions(): void {
    if (this.currentHolograms.length === 0) {
      return;
    }

    // Subscribe to top 5 symbols for CVD monitoring
    const topSymbols = this.currentHolograms.slice(0, 5);
    
    for (const hologram of topSymbols) {
      // Subscribe to Binance spot trades for CVD calculation
      this.binanceClient.subscribeAggTrades(hologram.symbol, (trade) => {
        // Record trade for CVD calculation
        this.cvdValidator.recordTrade({
          symbol: hologram.symbol,
          price: trade.price,
          qty: trade.quantity,
          time: trade.timestamp,
          isBuyerMaker: trade.isBuyerMaker
        });
      });
    }
  }

  /**
   * Handle keyboard input
   * Requirements: F1, F2, SPACE, Q key handling
   */
  private setupKeyboardHandling(): void {
    console.log('⌨️ Setting up keyboard handling...');
    
    // Enable raw mode for immediate key capture
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.on('data', (key: string) => {
        this.handleKeyPress(key);
      });
    }
  }

  /**
   * Handle individual key presses
   */
  private handleKeyPress(key: string): void {
    switch (key) {
      case '\u0003': // Ctrl+C
      case 'q':
      case 'Q':
        console.log('👋 Shutting down Hunter...');
        this.shutdown();
        break;
        
      case '\u001b[11~': // F1
        console.log('⚙️ Opening configuration panel...');
        // Emit config panel request (would be handled by UI)
        break;
        
      case '\u001b[12~': // F2
        console.log('👁️ Toggling view mode...');
        // Emit view toggle request (would be handled by UI)
        break;
        
      case ' ': // Space
        this.togglePause();
        break;
        
      default:
        // Ignore other keys
        break;
    }
  }

  /**
   * Toggle pause state
   */
  private togglePause(): void {
    this.isPaused = !this.isPaused;
    const status = this.isPaused ? 'PAUSED' : 'RUNNING';
    console.log(`⏸️ Hunter ${status}`);
    // Pause state change would be handled by UI components listening to events
  }

  /**
   * Start the Hunter application
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Hunter is already running');
    }

    console.log('🎯 Titan Phase 2 - The Hunter');
    console.log('📊 Holographic Market Structure Engine');
    console.log('💰 Capital Range: $2,500 → $50,000');
    console.log('⚡ Leverage: 3-5x');
    console.log('🎯 Target: 3:1 R:R (1.5% stop, 4.5% target)');
    console.log('📈 Win Rate: 55-65%');
    console.log('');

    try {
      // Initialize all components
      await this.initializeComponents();
      
      // Start all monitoring cycles
      this.startHologramScanCycle();
      this.startSessionMonitoring();
      this.startPOIDetectionCycle();
      this.startCVDMonitoring();
      
      // Setup keyboard handling
      this.setupKeyboardHandling();
      
      // Mark as running
      this.isRunning = true;
      
      console.log('🚀 Hunter started successfully!');
      console.log('');
      console.log('Keyboard Controls:');
      console.log('[F1] CONFIG  [F2] VIEW  [SPACE] PAUSE  [Q] QUIT');
      console.log('');
      
      // Start the Hunter HUD dashboard
      this.renderHunterHUD();
      
    } catch (error) {
      console.error('❌ Failed to start Hunter:', error);
      this.logger.logError('CRITICAL', 'Failed to start Hunter', {
        component: 'HunterApplication',
        function: 'start',
        stack: (error as Error).stack
      });
      throw error;
    }
  }

  /**
   * Render Hunter HUD dashboard
   * Requirements: 8.1-8.7 (Hunter HUD)
   */
  private renderHunterHUD(): void {
    console.log('🖥️ Rendering Hunter HUD dashboard...');
    
    // Start the React-based Hunter Application
    startHunterApp();
  }

  /**
   * Shutdown the Hunter application
   */
  public async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Shutting down Hunter...');
    
    try {
      // Clear all intervals
      if (this.hologramScanInterval) {
        clearInterval(this.hologramScanInterval);
        this.hologramScanInterval = null;
      }
      
      if (this.sessionMonitorInterval) {
        clearInterval(this.sessionMonitorInterval);
        this.sessionMonitorInterval = null;
      }
      
      if (this.poiDetectionInterval) {
        clearInterval(this.poiDetectionInterval);
        this.poiDetectionInterval = null;
      }
      
      // Stop configuration watching
      this.configManager.stopWatching();
      
      // Disconnect exchange clients
      await this.bybitClient.disconnect();
      await this.binanceClient.disconnect();
      
      // Mark as stopped
      this.isRunning = false;
      
      console.log('✅ Hunter shutdown complete');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      this.logger.logError('ERROR', 'Error during shutdown', {
        component: 'HunterApplication',
        function: 'shutdown',
        stack: (error as Error).stack
      });
      process.exit(1);
    }
  }

  /**
   * Get current application state
   */
  public getState() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentHolograms: this.currentHolograms,
      currentSession: this.currentSession,
      activePOIs: this.activePOIs,
      config: this.configManager.getConfig()
    };
  }
}

/**
 * Global Hunter application instance
 */
let hunterApp: HunterApplication | null = null;

/**
 * Main entry point for Titan Phase 2 - The Hunter
 */
async function main(): Promise<void> {
  try {
    // Create and start Hunter application
    hunterApp = new HunterApplication();
    await hunterApp.start();
    
  } catch (error) {
    console.error('❌ Failed to start Hunter:', error);
    logError('CRITICAL', 'Failed to start Hunter in main', {
      component: 'main',
      function: 'main',
      stack: (error as Error).stack
    });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  logError('CRITICAL', 'Uncaught Exception', {
    component: 'process',
    stack: error.stack
  });
  if (hunterApp) {
    hunterApp.shutdown();
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ Unhandled Rejection:', reason);
  logError('CRITICAL', 'Unhandled Rejection', {
    component: 'process',
    data: reason
  });
  if (hunterApp) {
    hunterApp.shutdown();
  } else {
    process.exit(1);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  if (hunterApp) {
    hunterApp.shutdown();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (hunterApp) {
    hunterApp.shutdown();
  } else {
    process.exit(0);
  }
});

// Start the application
if (require.main === module) {
  main();
}

export { main, HunterApplication };