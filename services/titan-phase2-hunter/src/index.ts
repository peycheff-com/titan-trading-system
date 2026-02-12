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

import * as http from 'http';
import { config } from 'dotenv';
import { ConfigManager } from './config/ConfigManager';
import { HologramEngine } from './engine/HologramEngine';

import { HologramScanner } from './engine/HologramScanner';
import { SessionProfiler } from './engine/SessionProfiler';
import { InefficiencyMapper } from './engine/InefficiencyMapper';
import { CVDValidator } from './engine/CVDValidator';
import { InstitutionalFlowClassifier } from './flow/InstitutionalFlowClassifier';
import { BybitPerpsClient } from './exchanges/BybitPerpsClient';
import { BinanceSpotClient } from './exchanges/BinanceSpotClient';
// Console components loaded dynamically only in non-headless mode
import { hunterEvents } from './events';
import { SignalData } from './types';
import { HunterStateManager } from './state/HunterState';
import { getLogger, logError } from './logging/Logger';
/* eslint-disable functional/no-let */
import {
  getNatsClient,
  type IntentSignal,
  loadSecretsFromFiles,
  type PhaseDiagnostics,
  type PhasePosture,
  SignalClient,
  TitanSubject,
} from '@titan/shared';

// Load environment variables
config();
loadSecretsFromFiles();

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
  private institutionalFlowClassifier: InstitutionalFlowClassifier;
  private signalClient: SignalClient;
  private logger = getLogger();

  // Application state
  private stateManager: HunterStateManager;

  // Constants

  // Constants
  private readonly HOLOGRAM_SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_MONITOR_INTERVAL = 1000; // 1 second (real-time)
  private readonly POI_DETECTION_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    // Check for headless mode
    const headlessMode = process.env.HEADLESS_MODE === 'true' || process.env.LOG_FORMAT === 'json';

    this.stateManager = new HunterStateManager(headlessMode);
    this.configManager = new ConfigManager();

    // Initialize exchange clients
    this.bybitClient = new BybitPerpsClient();
    this.binanceClient = new BinanceSpotClient();

    // Initialize core engines
    this.institutionalFlowClassifier = new InstitutionalFlowClassifier();
    this.hologramEngine = new HologramEngine(this.bybitClient, this.institutionalFlowClassifier);

    this.hologramScanner = new HologramScanner(this.bybitClient);
    this.sessionProfiler = new SessionProfiler();
    this.inefficiencyMapper = new InefficiencyMapper();
    this.cvdValidator = new CVDValidator();

    // Initialize IPC client for execution (Now SignalClient)
    this.signalClient = new SignalClient({
      source: 'hunter',
    });

    // CRITICAL: Handle SignalClient error events to prevent Node.js crash
    this.signalClient.on('error', (error: Error) => {
      this.logEvent('WARN', `⚠️ [SignalClient] Client error (non-fatal): ${error.message}`, {
        error: error.message,
      });
    });

    this.setupEventListeners();
  }

  /**
   * Helper to log events to console or JSON depending on mode
   */
  private logEvent(
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'CRITICAL',
    message: string,
    data?: unknown
  ): void {
    if (this.stateManager.headlessMode) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          message,
          data,
        })
      );
    } else {
      // In interactive mode, use console methods with formatting
      switch (level) {
        case 'ERROR':
        case 'CRITICAL':
          console.error(message);
          break;
        case 'WARN':
          console.warn(message);
          break;
        case 'DEBUG':
          console.debug(message);
          break;
        default:
          console.log(message);
      }
    }
  }

  /**
   * Setup event listeners for all components
   */
  private setupEventListeners(): void {
    // Listen to our centralized event system
    hunterEvents.onEvent('HOLOGRAM_UPDATED', payload => {
      this.logEvent(
        'INFO',
        `🔍 Hologram updated for ${payload.symbol}: ${payload.hologramState.status}`,
        payload
      );
    });

    hunterEvents.onEvent('SESSION_CHANGE', payload => {
      this.stateManager.updateSession(payload.currentSession);
      this.logEvent(
        'INFO',
        `⏰ Session changed from ${payload.previousSession.type} to ${payload.currentSession.type}`,
        payload
      );
    });

    hunterEvents.onEvent('CVD_ABSORPTION', payload => {
      this.logEvent(
        'INFO',
        `📈 CVD Absorption detected for ${payload.symbol} at ${payload.absorption.price}`,
        payload
      );
    });

    hunterEvents.onEvent('CVD_DISTRIBUTION', payload => {
      this.logEvent(
        'INFO',
        `📉 CVD Distribution detected for ${payload.symbol} at ${payload.distribution.price}`,
        payload
      );
    });

    hunterEvents.onEvent('SIGNAL_GENERATED', async payload => {
      this.logEvent(
        'INFO',
        `🎯 Signal generated: ${payload.signal.direction} ${payload.signal.symbol} at ${payload.signal.entryPrice}`,
        payload
      );

      // Forward signal to execution engine via IPC
      await this.forwardSignalToExecution(payload.signal);
    });

    hunterEvents.onEvent('EXECUTION_COMPLETE', payload => {
      const status = payload.success ? '✅' : '❌';
      this.logEvent(
        'INFO',
        `${status} Execution complete: ${payload.execution.side} ${payload.execution.symbol} at ${payload.execution.fillPrice}`,
        payload
      );
    });

    hunterEvents.onEvent('ERROR', payload => {
      const severityIcon: Record<string, string> = {
        LOW: '⚠️',
        MEDIUM: '🟡',
        HIGH: '🟠',
        CRITICAL: '🔴',
      };

      const icon = severityIcon[payload.severity] || '🔴';

      this.logEvent(
        'ERROR',
        `${icon} Error in ${payload.component}: ${payload.error.message}`,
        {
          severity: payload.severity,
          component: payload.component,
          stack: payload.error.stack,
        }
      );

      // Log to structured logger
      this.logger.logError(
        payload.severity === 'CRITICAL'
          ? 'CRITICAL'
          : payload.severity === 'HIGH'
            ? 'ERROR'
            : 'WARNING',
        payload.error.message,
        {
          component: payload.component,
          stack: payload.error.stack,
          data: payload,
        }
      );
    });

    hunterEvents.onEvent('SCAN_COMPLETE', payload => {
      this.logEvent(
        'INFO',
        `🔍 Scan complete: ${payload.symbolsScanned} symbols, ${payload.aPlus} A+, ${payload.bAlignment} B, ${payload.duration}ms`,
        payload
      );
    });

    hunterEvents.onEvent('JUDAS_SWING_DETECTED', payload => {
      this.logEvent(
        'INFO',
        `🎣 Judas Swing detected: ${payload.judasSwing.type} during ${payload.sessionType} session`,
        payload
      );
    });

    hunterEvents.onEvent('POI_DETECTED', payload => {
      this.logEvent(
        'INFO',
        `🎯 POI detected: ${payload.poiType} for ${payload.symbol} at ${payload.price} (${payload.distance.toFixed(
          2
        )}% away)`,
        payload
      );
    });

    hunterEvents.onEvent('RISK_WARNING', payload => {
      const severityIcon = payload.severity === 'CRITICAL' ? '🚨' : '⚠️';
      this.logEvent(
        'WARN',
        `${severityIcon} Risk Warning: ${payload.message} (${payload.value}/${payload.threshold})`,
        payload
      );
    });
  }

  /**
   * Initialize all components
   */
  private async initializeComponents(): Promise<void> {
    this.logEvent('INFO', '🔧 Initializing components...');

    try {
      // Initialize exchange clients
      this.logEvent('INFO', '📡 Initializing exchange clients...');
      await this.bybitClient.initialize();
      await this.binanceClient.initialize();

      // Initialize IPC connection to execution engine
      this.logEvent('INFO', '🔗 Connecting to execution engine via NATS... VERIFIED UPDATE');
      this.logEvent('DEBUG', 'Env Check', {
        USER: process.env.NATS_USER,
        PASS: process.env.NATS_PASS ? 'YES' : 'NO',
        URL: process.env.NATS_URL,
      });
      try {
        await this.signalClient.connect();
        this.logEvent('INFO', '✅ SignalClient connection established');
      } catch (error) {
        this.logEvent('WARN', '⚠️ SignalClient connection failed, signals will be logged only:', {
          error: (error as Error).message,
        });
      }

      // Initialize NATS subscription for market regime
      this.logEvent('INFO', '🔗 Subscribing to Market Regime updates...');
      const nats = getNatsClient();
      if (!nats.isConnected()) {
        await nats.connect();
      }
      nats.subscribe(TitanSubject.EVT_REGIME_UPDATE, (data: unknown) => {
        // Dual Read Strategy
        const payload = (
          data && typeof data === 'object' && 'payload' in data
            ? (data as { readonly payload: any }).payload
            : data
        ) as { readonly regime: string; readonly alpha: number };

        this.logEvent('INFO', `🧠 Market Regime Update: ${payload.regime} (α=${payload.alpha})`);
        this.hologramEngine.updateMarketRegime(payload.regime, payload.alpha);
      });

      // Initialize NATS subscription for Budget updates
      this.logEvent('INFO', '🔗 Subscribing to Budget updates...');
      nats.subscribe(TitanSubject.EVT_BUDGET_UPDATE, (data: unknown) => {
        const payload = (
          data && typeof data === 'object' && 'payload' in data
            ? (data as { readonly payload: any }).payload
            : data
        ) as { readonly phaseId: string; readonly allocatedEquity?: number };

        if (payload.phaseId === 'phase2' && payload.allocatedEquity) {
          this.logEvent('INFO', `💰 Budget Updated: $${payload.allocatedEquity.toFixed(2)}`);
          // Dynamic Sizing: Set base position size to 10% of allocated equity
          // This ensures we scale with the budget provided by the Brain
          const newBaseSize = payload.allocatedEquity * 0.1;
          this.configManager.updateConfig({ maxPositionSize: newBaseSize });
        }
      });

      // Start configuration watching
      // await this.configManager.startWatching(); - Deprecated
      await this.configManager.initialize();
      console.log('✅ Configuration initialized and validated');

      this.logEvent('INFO', '✅ All components initialized successfully');
    } catch (error) {
      this.logEvent('ERROR', '❌ Failed to initialize components:', { error });
      this.logger.logError('CRITICAL', 'Failed to initialize components', {
        component: 'HunterApplication',
        function: 'initializeComponents',
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Start Hologram Scan Cycle (5-minute interval)
   * Requirements: 9.1-9.7 (Hologram Scanning Engine)
   */
  private startHologramScanCycle(): void {
    this.logEvent('INFO', '🔍 Starting hologram scan cycle (5-minute interval)...');

    // Run initial scan
    this.runHologramScan();

    // Setup recurring scan
    this.stateManager.setTimer(
      'hologramScan',
      setInterval(() => {
        if (!this.stateManager.isPaused) {
          this.runHologramScan();
        }
      }, this.HOLOGRAM_SCAN_INTERVAL)
    );
  }

  /**
   * Run a single hologram scan
   */
  private async runHologramScan(): Promise<void> {
    try {
      this.logEvent('INFO', '🔍 Running hologram scan...');
      const startTime = Date.now();
      const result = await this.hologramScanner.scan();
      const duration = Date.now() - startTime;

      // Update current holograms
      this.stateManager.updateHolograms(result.top20);

      // Count alignment types
      // Mapping: A+ -> A+, A -> A (new), B -> B, C -> C (new), VETO -> VETO (was CONFLICT/NO_PLAY)
      const aPlus = result.top20.filter(h => h.status === 'A+').length;
      const b = result.top20.filter(h => h.status === 'B').length;
      const conflicts = result.top20.filter(h => h.status === 'VETO').length;

      // Emit scan complete event
      hunterEvents.emitScanComplete(result.top20.length, aPlus, b, conflicts, duration);
    } catch (error) {
      this.logEvent('ERROR', '❌ Hologram scan failed:', { error });
      this.logger.logError('ERROR', 'Hologram scan failed', {
        component: 'HologramScanner',
        function: 'runHologramScan',
        stack: (error as Error).stack,
      });
      hunterEvents.emitError('HologramScanner', error as Error, 'HIGH');
    }
  }

  /**
   * Start Session Monitoring (real-time)
   * Requirements: 2.1-2.7 (Session Profiler)
   */
  private startSessionMonitoring(): void {
    this.logEvent('INFO', '⏰ Starting session monitoring (real-time)...');

    // Run initial session check
    this.updateSessionState();

    // Setup real-time monitoring
    this.stateManager.setTimer(
      'sessionMonitor',
      setInterval(() => {
        if (!this.stateManager.isPaused) {
          this.updateSessionState();
        }
      }, this.SESSION_MONITOR_INTERVAL)
    );
  }

  /**
   * Update current session state
   */
  private updateSessionState(): void {
    const newSession = this.sessionProfiler.getSessionState();

    // Check if session changed
    const currentSession = this.stateManager.currentSession;
    if (!currentSession || currentSession.type !== newSession.type) {
      const previousSession = currentSession || newSession;
      this.stateManager.updateSession(newSession);

      // Emit session change event
      hunterEvents.emitSessionChange(previousSession, newSession);
    }
  }

  /**
   * Start POI Detection Cycle (1-minute interval)
   * Requirements: 3.1-3.7 (Inefficiency Mapper), 10.1-10.7 (Liquidity Pool Detection)
   */
  private startPOIDetectionCycle(): void {
    this.logEvent('INFO', '🎯 Starting POI detection cycle (1-minute interval)...');

    // Run initial POI detection
    this.runPOIDetection();

    // Setup recurring detection
    this.stateManager.setTimer(
      'poiDetection',
      setInterval(() => {
        if (!this.stateManager.isPaused) {
          this.runPOIDetection();
        }
      }, this.POI_DETECTION_INTERVAL)
    );
  }

  /**
   * Run POI detection for current symbols
   */
  private async runPOIDetection(): Promise<void> {
    try {
      if (this.stateManager.currentHolograms.length === 0) {
        return; // No symbols to analyze
      }

      this.logEvent('INFO', '🎯 Running POI detection...');

      // Analyze top 5 symbols for POIs
      const topSymbols = this.stateManager.currentHolograms.slice(0, 5);

      const newPOIsNested = await Promise.all(
        topSymbols.map(async hologram => {
          try {
            // Fetch recent candles for POI detection
            const candles = await this.bybitClient.fetchOHLCV(hologram.symbol, '15m', 100);

            // Detect FVGs
            const fvgs = this.inefficiencyMapper.detectFVG(candles);

            // Detect Order Blocks
            const orderBlocks = this.inefficiencyMapper.detectOrderBlock(candles, hologram.m15.bos);

            // Detect Liquidity Pools
            const liquidityPools = this.inefficiencyMapper.detectLiquidityPools(
              candles,
              hologram.m15.fractals
            );

            return [...fvgs, ...orderBlocks, ...liquidityPools];
          } catch (error) {
            this.logEvent('ERROR', `❌ POI detection failed for ${hologram.symbol}:`, { error });
            this.logger.logError('WARNING', `POI detection failed for ${hologram.symbol}`, {
              symbol: hologram.symbol,
              component: 'InefficiencyMapper',
              function: 'runPOIDetection',
              stack: (error as Error).stack,
            });
            return [];
          }
        })
      );

      const newPOIs = newPOIsNested.flat();

      // Update active POIs
      this.stateManager.updatePOIs(newPOIs);
      this.logEvent('INFO', `🎯 POI detection complete: ${newPOIs.length} active POIs`, {
        count: newPOIs.length,
      });
    } catch (error) {
      this.logEvent('ERROR', '❌ POI detection cycle failed:', { error });
      this.logger.logError('ERROR', 'POI detection cycle failed', {
        component: 'InefficiencyMapper',
        function: 'runPOIDetection',
        stack: (error as Error).stack,
      });
    }
  }

  /**
   * Start CVD Monitoring (real-time WebSocket)
   * Requirements: 4.1-4.7 (Order Flow X-Ray)
   */
  private startCVDMonitoring(): void {
    this.logEvent('INFO', '📊 Starting CVD monitoring (real-time WebSocket)...');

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
    if (this.stateManager.currentHolograms.length === 0) {
      return;
    }

    // Subscribe to top 5 symbols for CVD monitoring
    const topSymbols = this.stateManager.currentHolograms.slice(0, 5);

    // Prepare batch subscriptions
    const subscriptions = topSymbols.map(hologram => ({
      symbol: hologram.symbol,
      callback: (trade: any) => {
        // Record trade for CVD calculation
        const cvdTrade = {
          symbol: hologram.symbol,
          price: trade.price,
          qty: trade.quantity,
          time: trade.timestamp,
          isBuyerMaker: trade.isBuyerMaker,
        };

        this.cvdValidator.recordTrade(cvdTrade);

        // Record trade for Institutional Flow Classification
        this.institutionalFlowClassifier.recordTrade(cvdTrade);
      },
    }));

    // Subscribe to Binance spot trades for CVD calculation in a single batch
    this.binanceClient.subscribeAggTradesBatch(subscriptions);
  }

  /**
   * Handle keyboard input
   * Requirements: F1, F2, SPACE, Q key handling
   */
  private setupKeyboardHandling(): void {
    // Disable keyboard hooks in headless mode
    if (this.stateManager.headlessMode) {
      this.logEvent('INFO', '⌨️ Headless mode active: Keyboard interaction disabled');
      return;
    }

    this.logEvent('INFO', '⌨️ Setting up keyboard handling...');

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
        this.logEvent('INFO', '👋 Shutting down Hunter...');
        this.shutdown();
        break;

      case '\u001b[11~': // F1
        this.logEvent('INFO', '⚙️ Opening configuration panel...');
        // Emit config panel request (would be handled by UI)
        break;

      case '\u001b[12~': // F2
        this.logEvent('INFO', '👁️ Toggling view mode...');
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
    const isPaused = this.stateManager.togglePause();
    const status = isPaused ? 'PAUSED' : 'RUNNING';
    this.logEvent('INFO', `⏸️ Hunter ${status}`);
    // Pause state change would be handled by UI components listening to events
  }

  /**
   * Start the Hunter application
   */
  public async start(): Promise<void> {
    if (this.stateManager.isRunning) {
      throw new Error('Hunter is already running');
    }

    this.logEvent('INFO', '🎯 Titan Phase 2 - The Hunter');
    this.logEvent('INFO', '📊 Holographic Market Structure Engine');
    this.logEvent('INFO', '💰 Capital Range: $2,500 → $50,000');
    this.logEvent('INFO', '⚡ Leverage: 3-5x');
    this.logEvent('INFO', '🎯 Target: 3:1 R:R (1.5% stop, 4.5% target)');
    this.logEvent('INFO', '📈 Win Rate: 55-65%');

    try {
      // Initialize all components
      await this.initializeComponents();

      // Start all monitoring cycles
      // Start all monitoring cycles
      this.startHologramScanCycle();
      this.startSessionMonitoring();
      this.startPOIDetectionCycle();
      this.startCVDMonitoring();
      this.startStateBroadcast();
      this.startHealthServer();

      // Setup keyboard handling
      this.setupKeyboardHandling();

      // Mark as running
      this.stateManager.setRunning(true);

      this.logEvent('INFO', '🚀 Hunter started successfully!');

      if (!this.stateManager.headlessMode) {
        console.log('');
        console.log('Keyboard Controls:');
        console.log('[F1] CONFIG  [F2] VIEW  [SPACE] PAUSE  [Q] QUIT');
        console.log('');

        // Start the Hunter HUD dashboard
        this.renderHunterHUD();
      } else {
        this.logEvent('INFO', 'Running in HEADLESS MODE. HUD disabled.');
      }
    } catch (error) {
      this.logEvent('ERROR', '❌ Failed to start Hunter:', { error });
      this.logger.logError('CRITICAL', 'Failed to start Hunter', {
        component: 'HunterApplication',
        function: 'start',
        stack: (error as Error).stack,
      });
      throw error;
    }
  }

  /**
   * Forward signal to Titan Brain via Webhook
   * Refactored to comply with Brain-Mediated Execution (Req 7.1)
   */
  private async forwardSignalToExecution(signal: SignalData): Promise<void> {
    // Use SignalClient (NATS) instead of Webhook for lower latency and Brain mediation
    try {
      const signalId = `hunter-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const intentSignal: IntentSignal = {
        signal_id: signalId,
        source: 'hunter',
        symbol: signal.symbol,
        direction: signal.direction as 'LONG' | 'SHORT',
        entry_zone: {
          min: signal.entryPrice * 0.999,
          max: signal.entryPrice * 1.001,
        }, // Expand slightly for zone
        stop_loss: signal.stopLoss,
        take_profits: [signal.takeProfit],
        confidence: signal.confidence || 0.7,
        leverage: signal.leverage || 5,
        timestamp: Date.now(),
      };

      this.logEvent('INFO', `📤 Sending Signal to Brain via NATS: ${signal.symbol}`, {
        signalId,
      });

      // Fire and Forget (Optimistic) or Wait for Brain Confirmation?
      // Brain will publish to EXEC subject, preventing double-execution requires Brain idemp check.
      // We start with Prepare -> Confirm sequence for local tracking if needed.

      await this.signalClient.sendPrepare(intentSignal);
      const confirmResponse = await this.signalClient.sendConfirm(signalId);

      if (confirmResponse.executed) {
        this.logEvent('INFO', `✅ Signal submitted to Brain: ${signalId}`);
      } else {
        this.logEvent('ERROR', `❌ Signal submission failed: ${confirmResponse.reason}`);
      }
    } catch (error) {
      this.logEvent('ERROR', `❌ Signal submission error: ${(error as Error).message}`);
    }
  }

  /**
   * Start state broadcast cycle
   */
  private startStateBroadcast(): void {
    this.logEvent('INFO', '📡 Starting state broadcast cycle...');
    this.stateManager.setTimer(
      'stateBroadcast',
      setInterval(() => {
        this.broadcastState();
      }, 5000)
    );
  }

  private async broadcastState(): Promise<void> {
    const nats = getNatsClient();
    if (!nats.isConnected()) return;

    // Posture
    const posturePayload: PhasePosture = {
      phase: 'hunter',
      status: this.stateManager.isPaused ? 'PAUSED' : 'RUNNING',
      regime: 'HOLOGRAPHIC',
      metrics: {
        activeHolograms: this.stateManager.currentHolograms.length,
        activePOIs: this.stateManager.activePOIs.length,
        session: this.stateManager.currentSession?.type || 'UNKNOWN',
      },
      timestamp: Date.now(),
    };
    nats.publish(`${TitanSubject.EVT_PHASE_POSTURE}.hunter`, posturePayload);

    // Diagnostics
    const memUsage = process.memoryUsage();
    const diagnosticsPayload: PhaseDiagnostics = {
      phase: 'hunter',
      health: 'HEALTHY',
      alerts: [],
      system: {
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
        },
        uptime: process.uptime(),
      },
      timestamp: Date.now(),
    };
    nats.publish(`${TitanSubject.EVT_PHASE_DIAGNOSTICS as string}.hunter`, diagnosticsPayload);
  }

  /**
   * Render Hunter HUD dashboard
   * Requirements: 8.1-8.7 (Hunter HUD)
   */
  private async renderHunterHUD(): Promise<void> {
    if (this.stateManager.headlessMode) return;

    console.log('🖥️ Rendering Hunter HUD dashboard...');

    // Dynamically load console components (ink/react) only when not headless
    // Use eval-based import to completely bypass TypeScript module resolution
    // This allows the console components (which use ink/react) to be omitted from production builds
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string
      ) => Promise<{ startHunterApp: () => void }>;
      const { startHunterApp } = await dynamicImport('./console/HunterApp.js');
      startHunterApp();
    } catch (error) {
      console.warn('⚠️ Failed to load console UI:', (error as Error).message);
    }
  }

  /**
   * Start HTTP Health Check Server
   */
  private startHealthServer(): void {
    const port = 8083;

    const server = http.createServer((req: any, res: any) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
          })
        );
      } else if (req.url === '/metrics') {
        // Prometheus metrics format
        const lines: string[] = [
          '# HELP hunter_uptime_seconds Process uptime in seconds',
          '# TYPE hunter_uptime_seconds gauge',
          `hunter_uptime_seconds ${process.uptime().toFixed(2)}`,
          '',
          '# HELP hunter_info Build and version info',
          '# TYPE hunter_info gauge',
          `hunter_info{version="1.0.0"} 1`,
        ];

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(lines.join('\n') + '\n');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, '0.0.0.0', () => {
      this.logEvent('INFO', `🏥 Health check server listening on port ${port}`);
    });
  }

  /**
   * Shutdown the Hunter application
   */
  public async shutdown(): Promise<void> {
    if (!this.stateManager.isRunning) {
      return;
    }

    this.logEvent('INFO', '🛑 Shutting down Hunter...');

    try {
      // Clear all intervals
      this.stateManager.clearAllTimers();

      // Stop configuration watching
      this.configManager.stopWatching();

      // Disconnect exchange clients
      await this.bybitClient.disconnect();
      await this.binanceClient.disconnect();

      // Mark as stopped
      this.stateManager.setRunning(false);

      this.logEvent('INFO', '✅ Hunter shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logEvent('ERROR', '❌ Error during shutdown:', { error });
      this.logger.logError('ERROR', 'Error during shutdown', {
        component: 'HunterApplication',
        function: 'shutdown',
        stack: (error as Error).stack,
      });
      process.exit(1);
    }
  }

  /**
   * Get current application state
   */
  public getState() {
    return {
      isRunning: this.stateManager.isRunning,
      isPaused: this.stateManager.isPaused,
      currentHolograms: this.stateManager.currentHolograms,
      currentSession: this.stateManager.currentSession,
      activePOIs: this.stateManager.activePOIs,
      config: this.configManager.getConfig(),
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
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  logError('CRITICAL', 'Uncaught Exception', {
    component: 'process',
    stack: error.stack,
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
    data: reason,
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

export { HunterApplication, main };
