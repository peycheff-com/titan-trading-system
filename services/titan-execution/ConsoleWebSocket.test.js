/**
 * Tests for ConsoleWebSocket
 * 
 * Requirements: 89.6, 95.3-95.6
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WebSocket } from 'ws';
import { ConsoleWebSocket, generateClientId } from './ConsoleWebSocket.js';

describe('ConsoleWebSocket', () => {
  let consoleWs;
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });
  
  afterEach(() => {
    if (consoleWs) {
      consoleWs.close();
    }
  });
  
  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      consoleWs = new ConsoleWebSocket({ 
        port: 3002,
        logger: mockLogger,
      });
      
      expect(consoleWs.path).toBe('/ws/console');
      expect(consoleWs.maxClients).toBe(10);
      expect(consoleWs.heartbeatIntervalMs).toBe(30000);
      expect(consoleWs.stateBroadcastIntervalMs).toBe(1000);
    });
    
    it('should initialize with custom configuration', () => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        path: '/custom/console',
        maxClients: 5,
        heartbeatIntervalMs: 15000,
        stateBroadcastIntervalMs: 500,
        logger: mockLogger,
      });
      
      expect(consoleWs.path).toBe('/custom/console');
      expect(consoleWs.maxClients).toBe(5);
      expect(consoleWs.heartbeatIntervalMs).toBe(15000);
      expect(consoleWs.stateBroadcastIntervalMs).toBe(500);
    });
  });
  
  describe('Client Connection', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        logger: mockLogger,
      });
    });
    
    it('should accept client connections', (done) => {
      consoleWs.on('client:connected', ({ client_id }) => {
        expect(client_id).toBeDefined();
        expect(client_id).toMatch(/^console_/);
        done();
      });
      
      const client = new WebSocket('ws://localhost:3002/ws/console');
      client.on('error', done);
    });
    
    it('should send welcome message on connection', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('CONNECTED');
        expect(message.client_id).toBeDefined();
        expect(message.message).toBe('Connected to Titan Command Console');
        expect(message.timestamp).toBeDefined();
        client.close();
        done();
      });
      
      client.on('error', done);
    });
    
    it('should reject connections when max clients reached', (done) => {
      consoleWs.close();
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        maxClients: 1,
        logger: mockLogger,
      });
      
      const client1 = new WebSocket('ws://localhost:3002/ws/console');
      
      client1.on('open', () => {
        // First client should connect
        expect(consoleWs.getConnectedClients().length).toBe(1);
        
        // Now try to connect second client after first is established
        const client2 = new WebSocket('ws://localhost:3002/ws/console');
        
        client2.on('close', (code) => {
          // Second client should be rejected (code 1013 or 1001 depending on timing)
          expect(code).toBeGreaterThanOrEqual(1001);
          expect(consoleWs.getConnectedClients().length).toBe(1);
          client1.close();
          done();
        });
        
        client2.on('error', () => {}); // Ignore error, we expect close
      });
      
      client1.on('error', done);
    });
  });
  
  describe('Client Disconnection', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        logger: mockLogger,
      });
    });
    
    it('should handle client disconnection gracefully', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('open', () => {
        // Wait a bit for connection to be fully established
        setTimeout(() => {
          consoleWs.on('client:disconnected', ({ client_id }) => {
            expect(client_id).toBeDefined();
            expect(consoleWs.getConnectedClients().length).toBe(0);
            done();
          });
          
          client.close();
        }, 50);
      });
      
      client.on('error', done);
    });
  });
  
  describe('State Broadcasting', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        stateBroadcastIntervalMs: 100, // Fast for testing
        logger: mockLogger,
      });
    });
    
    it('should set state provider', () => {
      const provider = async () => ({ equity: 1000 });
      consoleWs.setStateProvider(provider);
      
      const status = consoleWs.getStatus();
      expect(status.has_state_provider).toBe(true);
    });
    
    it('should throw error if state provider is not a function', () => {
      expect(() => {
        consoleWs.setStateProvider('not a function');
      }).toThrow(TypeError);
    });
    
    it('should broadcast state to connected clients', (done) => {
      const testState = {
        equity: 1234.56,
        daily_pnl: 45.67,
        daily_pnl_pct: 3.84,
        active_positions: 2,
        phase: 1,
        phase_label: 'PHASE 1: KICKSTARTER',
      };
      
      consoleWs.setStateProvider(async () => testState);
      
      const client = new WebSocket('ws://localhost:3002/ws/console');
      let messageCount = 0;
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        // Skip welcome message
        if (message.type === 'CONNECTED') {
          return;
        }
        
        // Check state update
        if (message.type === 'STATE_UPDATE') {
          expect(message.equity).toBe(testState.equity);
          expect(message.daily_pnl).toBe(testState.daily_pnl);
          expect(message.phase).toBe(testState.phase);
          client.close();
          done();
        }
      });
      
      client.on('error', done);
    });
    
    it('should not broadcast when no clients connected', async () => {
      const provider = jest.fn(async () => ({ equity: 1000 }));
      consoleWs.setStateProvider(provider);
      
      // Wait for broadcast interval
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Provider should not be called when no clients
      expect(provider).not.toHaveBeenCalled();
    });
  });
  
  describe('Push Methods', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        logger: mockLogger,
      });
    });
    
    it('should push equity update', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'EQUITY_UPDATE') {
          expect(message.equity).toBe(1500.50);
          expect(message.daily_pnl).toBe(50.25);
          expect(message.daily_pnl_pct).toBe(3.46);
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushEquityUpdate({
          equity: 1500.50,
          daily_pnl: 50.25,
          daily_pnl_pct: 3.46,
        });
      });
      
      client.on('error', done);
    });
    
    it('should push position update', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'POSITION_UPDATE') {
          expect(message.active_positions).toBe(3);
          expect(message.positions).toHaveLength(3);
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushPositionUpdate({
          active_positions: 3,
          positions: [
            { symbol: 'BTCUSDT', side: 'LONG', size: 0.5 },
            { symbol: 'ETHUSDT', side: 'LONG', size: 1.0 },
            { symbol: 'SOLUSDT', side: 'SHORT', size: 10.0 },
          ],
        });
      });
      
      client.on('error', done);
    });
    
    it('should push phase change', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'PHASE_CHANGE') {
          expect(message.phase).toBe(2);
          expect(message.phase_label).toBe('PHASE 2: TREND RIDER');
          expect(message.equity).toBe(1000.00);
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushPhaseChange({
          phase: 2,
          phase_label: 'PHASE 2: TREND RIDER',
          equity: 1000.00,
        });
      });
      
      client.on('error', done);
    });
    
    it('should push regime change', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'REGIME_CHANGE') {
          expect(message.regime.state).toBe(1);
          expect(message.regime.label).toBe('Risk-On');
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushRegimeChange({
          regime: { state: 1, label: 'Risk-On' },
        });
      });
      
      client.on('error', done);
    });
    
    it('should push master arm change', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'MASTER_ARM_CHANGE') {
          expect(message.master_arm).toBe(false);
          expect(message.changed_by).toBe('operator');
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushMasterArmChange({
          master_arm: false,
          changed_by: 'operator',
        });
      });
      
      client.on('error', done);
    });
    
    it('should push emergency flatten', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'EMERGENCY_FLATTEN') {
          expect(message.closed_count).toBe(5);
          expect(message.reason).toBe('PANIC_BUTTON');
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        consoleWs.pushEmergencyFlatten({
          closed_count: 5,
          reason: 'PANIC_BUTTON',
        });
      });
      
      client.on('error', done);
    });
  });
  
  describe('Client Messages', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        logger: mockLogger,
      });
    });
    
    it('should respond to PING with PONG', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      let receivedPong = false;
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'PONG') {
          receivedPong = true;
          expect(message.timestamp).toBeDefined();
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        client.send(JSON.stringify({ type: 'PING' }));
      });
      
      client.on('error', done);
    });
    
    it('should respond to REQUEST_STATE with current state', (done) => {
      const testState = {
        equity: 2000,
        phase: 1,
      };
      
      consoleWs.setStateProvider(async () => testState);
      
      // Manually set last state
      consoleWs._lastState = testState;
      
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'STATE_UPDATE') {
          expect(message.equity).toBe(2000);
          expect(message.phase).toBe(1);
          client.close();
          done();
        }
      });
      
      client.on('open', () => {
        client.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      });
      
      client.on('error', done);
    });
  });
  
  describe('Status and Management', () => {
    beforeEach(() => {
      consoleWs = new ConsoleWebSocket({
        port: 3002,
        logger: mockLogger,
      });
    });
    
    it('should return status', () => {
      const status = consoleWs.getStatus();
      
      expect(status.path).toBe('/ws/console');
      expect(status.connected_clients).toBe(0);
      expect(status.total_connections).toBe(0);
      expect(status.messages_broadcast).toBe(0);
      expect(status.max_clients).toBe(10);
      expect(status.has_state_provider).toBe(false);
    });
    
    it('should return connected clients info', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('open', () => {
        setTimeout(() => {
          const clients = consoleWs.getConnectedClients();
          expect(clients).toHaveLength(1);
          expect(clients[0].id).toBeDefined();
          expect(clients[0].connected_at).toBeDefined();
          expect(clients[0].last_ping).toBeDefined();
          client.close();
          done();
        }, 100);
      });
      
      client.on('error', done);
    });
    
    it('should disconnect specific client', (done) => {
      const client = new WebSocket('ws://localhost:3002/ws/console');
      
      client.on('open', () => {
        setTimeout(() => {
          const clients = consoleWs.getConnectedClients();
          const clientId = clients[0].id;
          
          const disconnected = consoleWs.disconnectClient(clientId);
          expect(disconnected).toBe(true);
          
          setTimeout(() => {
            expect(consoleWs.getConnectedClients()).toHaveLength(0);
            done();
          }, 100);
        }, 100);
      });
      
      client.on('error', done);
    });
  });
  
  describe('Helper Functions', () => {
    it('should generate unique client IDs', () => {
      const id1 = generateClientId();
      const id2 = generateClientId();
      
      expect(id1).toMatch(/^console_/);
      expect(id2).toMatch(/^console_/);
      expect(id1).not.toBe(id2);
    });
  });
});
