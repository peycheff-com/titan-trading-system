/**
 * WebSocketService - Real-time WebSocket server for Titan Brain
 *
 * Provides real-time updates to connected clients (Console, monitoring tools).
 * Broadcasts state updates, signals, trades, and alerts.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { TitanBrain } from '../engine/TitanBrain.js';
import { getLogger } from '../monitoring/index.js';

/**
 * WebSocket message types
 */
export type WSMessageType =
  | 'CONNECTED'
  | 'STATE_UPDATE'
  | 'SIGNAL'
  | 'TRADE'
  | 'ALERT'
  | 'PHASE1_UPDATE'
  | 'ping'
  | 'pong';

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSMessageType;
  timestamp: number;
  // State fields
  equity?: number;
  daily_pnl?: number;
  daily_pnl_pct?: number;
  master_arm?: boolean;
  positions?: Position[];
  allocation?: { w1: number; w2: number; w3: number };
  // Initial state on connect
  state?: {
    equity: number;
    daily_pnl: number;
    daily_pnl_pct: number;
    master_arm: boolean;
  };
  // Phase 1 specific
  tripwires?: Tripwire[];
  sensorStatus?: SensorStatus;
  // Generic data payload
  data?: Record<string, unknown>;
}

/**
 * Position data structure
 */
export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
  phase: string;
}

/**
 * Tripwire data structure (Phase 1)
 */
export interface Tripwire {
  id: string;
  symbol: string;
  type: string;
  price: number;
  status: 'ARMED' | 'TRIGGERED' | 'EXPIRED';
  confidence: number;
}

/**
 * Sensor status (Phase 1)
 */
export interface SensorStatus {
  binanceConnected: boolean;
  bybitConnected: boolean;
  lastUpdate: number;
  activeSymbols: number;
}

/**
 * Client connection info
 */
interface ClientInfo {
  id: string;
  connectedAt: number;
  lastPing: number;
  endpoint: string;
}

/**
 * WebSocket service configuration
 */
export interface WebSocketServiceConfig {
  pingInterval: number; // ms between pings
  pingTimeout: number; // ms to wait for pong
  stateUpdateInterval: number; // ms between state broadcasts
}

const DEFAULT_CONFIG: WebSocketServiceConfig = {
  pingInterval: 30000,
  pingTimeout: 10000,
  stateUpdateInterval: 1000,
};

/**
 * WebSocketService manages real-time connections to the Brain
 */
export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private brain: TitanBrain;
  private config: WebSocketServiceConfig;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private stateUpdateIntervalId: NodeJS.Timeout | null = null;
  private masterArm: boolean = false;
  private positions: Position[] = [];
  private logger = getLogger();

  constructor(brain: TitanBrain, config: Partial<WebSocketServiceConfig> = {}) {
    this.brain = brain;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Attach WebSocket server to an existing HTTP server
   */
  attachToServer(server: { server: unknown }): void {
    // Create WebSocket server attached to the HTTP server
    this.wss = new WebSocketServer({
      server: server.server as import('http').Server,
      path: '/ws/console',
    });

    this.setupWebSocketServer();
    this.startPingInterval();
    this.startStateUpdateInterval();

    this.logger.info('WebSocket service attached to server on /ws/console');
  }

  /**
   * Create standalone WebSocket server on a specific port
   */
  listen(port: number, host: string = '0.0.0.0'): void {
    this.wss = new WebSocketServer({ port, host });

    this.setupWebSocketServer();
    this.startPingInterval();
    this.startStateUpdateInterval();

    this.logger.info(`WebSocket service listening on ws://${host}:${port}`);
    console.log(`📡 WebSocket server listening on ws://${host}:${port}`);
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const endpoint = req.url || '/ws/console';

      const clientInfo: ClientInfo = {
        id: clientId,
        connectedAt: Date.now(),
        lastPing: Date.now(),
        endpoint,
      };

      this.clients.set(ws, clientInfo);
      this.logger.info(`WebSocket client connected: ${clientId} on ${endpoint}`);

      // Send initial state
      this.sendInitialState(ws);

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        this.handleMessage(ws, data);
      });

      // Handle client disconnect
      ws.on('close', () => {
        const info = this.clients.get(ws);
        if (info) {
          this.logger.info(`WebSocket client disconnected: ${info.id}`);
        }
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        const info = this.clients.get(ws);
        this.logger.error(`WebSocket error for client ${info?.id}:`, error);
      });
    });

    this.wss.on('error', (error) => {
      this.logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Send initial state to newly connected client
   */
  private sendInitialState(ws: WebSocket): void {
    const equity = this.brain.getEquity();
    const allocation = this.brain.getAllocation();

    const message: WSMessage = {
      type: 'CONNECTED',
      timestamp: Date.now(),
      state: {
        equity,
        daily_pnl: 0, // TODO: Get from performance tracker
        daily_pnl_pct: 0,
        master_arm: this.masterArm,
      },
      allocation: {
        w1: allocation.w1,
        w2: allocation.w2,
        w3: allocation.w3,
      },
      positions: this.positions,
    };

    this.sendToClient(ws, message);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const clientInfo = this.clients.get(ws);

      switch (message.type) {
        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
          if (clientInfo) {
            clientInfo.lastPing = Date.now();
          }
          break;

        case 'pong':
          if (clientInfo) {
            clientInfo.lastPing = Date.now();
          }
          break;

        case 'subscribe':
          // Handle subscription requests (future enhancement)
          this.logger.debug(`Client ${clientInfo?.id} subscribed to: ${message.channels}`);
          break;

        default:
          this.logger.debug(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Broadcast state update to all connected clients
   */
  broadcastStateUpdate(data?: Partial<WSMessage>): void {
    const equity = this.brain.getEquity();
    const allocation = this.brain.getAllocation();

    const message: WSMessage = {
      type: 'STATE_UPDATE',
      timestamp: Date.now(),
      equity,
      daily_pnl: 0, // TODO: Get from performance tracker
      daily_pnl_pct: 0,
      master_arm: this.masterArm,
      positions: this.positions,
      allocation: {
        w1: allocation.w1,
        w2: allocation.w2,
        w3: allocation.w3,
      },
      ...data, // Override/Merge with provided data
    };

    this.broadcast(message);
  }

  /**
   * Broadcast signal event to all clients
   */
  broadcastSignal(signalData: Record<string, unknown>): void {
    const message: WSMessage = {
      type: 'SIGNAL',
      timestamp: Date.now(),
      data: signalData,
    };

    this.broadcast(message);
  }

  /**
   * Broadcast trade event to all clients
   */
  broadcastTrade(tradeData: Record<string, unknown>): void {
    const message: WSMessage = {
      type: 'TRADE',
      timestamp: Date.now(),
      data: tradeData,
    };

    this.broadcast(message);
  }

  /**
   * Broadcast alert to all clients
   */
  broadcastAlert(level: 'info' | 'warning' | 'error', alertMessage: string): void {
    const message: WSMessage = {
      type: 'ALERT',
      timestamp: Date.now(),
      data: { level, message: alertMessage },
    };

    this.broadcast(message);
  }

  /**
   * Broadcast Phase 1 update to all clients
   */
  broadcastPhase1Update(tripwires: Tripwire[], sensorStatus: SensorStatus): void {
    const message: WSMessage = {
      type: 'PHASE1_UPDATE',
      timestamp: Date.now(),
      tripwires,
      sensorStatus,
    };

    this.broadcast(message);
  }

  /**
   * Update master arm state
   */
  setMasterArm(enabled: boolean): void {
    this.masterArm = enabled;
    this.broadcastStateUpdate();
  }

  /**
   * Update positions
   */
  setPositions(positions: Position[]): void {
    this.positions = positions;
    this.broadcastStateUpdate();
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: WSMessage): void {
    if (!this.wss) return;

    const data = JSON.stringify(message);

    this.clients.forEach((info, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  /**
   * Send message to specific client
   */
  private sendToClient(
    ws: WebSocket,
    message: WSMessage | { type: string; timestamp: number },
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingIntervalId = setInterval(() => {
      const now = Date.now();

      this.clients.forEach((info, ws) => {
        // Check if client has timed out
        if (now - info.lastPing > this.config.pingTimeout + this.config.pingInterval) {
          this.logger.warn(`Client ${info.id} timed out, closing connection`);
          ws.terminate();
          this.clients.delete(ws);
          return;
        }

        // Send ping
        if (ws.readyState === WebSocket.OPEN) {
          this.sendToClient(ws, { type: 'ping', timestamp: now });
        }
      });
    }, this.config.pingInterval);
  }

  /**
   * Start state update broadcast interval
   */
  private startStateUpdateInterval(): void {
    if (this.config.stateUpdateInterval <= 0) {
      this.logger.info('WebSocket state update interval disabled (NATS mode)');
      return;
    }

    this.stateUpdateIntervalId = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcastStateUpdate();
      }
    }, this.config.stateUpdateInterval);
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Shutdown WebSocket service
   */
  async shutdown(): Promise<void> {
    // Stop intervals
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    if (this.stateUpdateIntervalId) {
      clearInterval(this.stateUpdateIntervalId);
      this.stateUpdateIntervalId = null;
    }

    // Close all client connections
    this.clients.forEach((info, ws) => {
      ws.close(1000, 'Server shutting down');
    });
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    this.logger.info('WebSocket service shut down');
  }
}
