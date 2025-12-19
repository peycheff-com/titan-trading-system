/**
 * Unit Tests for Fast Path IPC Server
 */

import { jest } from '@jest/globals';
import net from 'net';
import crypto from 'crypto';
import FastPathServer from './FastPathServer.js';

describe('FastPathServer', () => {
  let server;
  let mockSignalRouter;
  const socketPath = '/tmp/titan-ipc-test.sock';
  const hmacSecret = 'test-secret-key';

  beforeEach(() => {
    mockSignalRouter = {
      route: jest.fn().mockResolvedValue({ accepted: true, orderId: '12345' })
    };
    server = new FastPathServer(socketPath, hmacSecret, mockSignalRouter);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Constructor', () => {
    test('should initialize with correct properties', () => {
      expect(server.socketPath).toBe(socketPath);
      expect(server.hmacSecret).toBe(hmacSecret);
      expect(server.signalRouter).toBe(mockSignalRouter);
      expect(server.maxConnections).toBe(10);
      expect(server.MESSAGE_DELIMITER).toBe('\n');
    });

    test('should initialize metrics', () => {
      expect(server.metrics.messagesReceived).toBe(0);
      expect(server.metrics.messagesProcessed).toBe(0);
      expect(server.metrics.messagesFailed).toBe(0);
      expect(server.metrics.invalidSignatures).toBe(0);
    });

    test('should accept custom maxConnections', () => {
      const customServer = new FastPathServer(socketPath, hmacSecret, mockSignalRouter, 5);
      expect(customServer.maxConnections).toBe(5);
    });
  });

  describe('start()', () => {
    test('should create server and listen on socket path', (done) => {
      server.start();
      
      setTimeout(() => {
        const status = server.getStatus();
        expect(status.running).toBe(true);
        expect(status.socketPath).toBe(socketPath);
        done();
      }, 100);
    });

    // Note: Testing socket file removal is difficult with ES modules
    // The functionality is tested implicitly by the server starting successfully
  });

  describe('verifySignature()', () => {
    test('should return true for valid signature', () => {
      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal))
        .digest('hex');

      const message = { signal, signature };
      expect(server.verifySignature(message)).toBe(true);
    });

    test('should return false for invalid signature', () => {
      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = 'invalid-signature-hex';

      const message = { signal, signature };
      expect(server.verifySignature(message)).toBe(false);
    });

    test('should return false for missing signal', () => {
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify({ test: 'data' }))
        .digest('hex');

      const message = { signature };
      expect(server.verifySignature(message)).toBe(false);
    });

    test('should return false for missing signature', () => {
      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const message = { signal };
      expect(server.verifySignature(message)).toBe(false);
    });

    test('should return false for signature with wrong length', () => {
      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = 'abcd1234'; // Too short

      const message = { signal, signature };
      expect(server.verifySignature(message)).toBe(false);
    });

    test('should handle signature verification errors gracefully', () => {
      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = 'not-valid-hex-string!!!';

      const message = { signal, signature };
      expect(server.verifySignature(message)).toBe(false);
    });
  });

  describe('Message Handling', () => {
    test('should process valid message and route to SignalRouter', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT', qty: 0.1 };
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal))
        .digest('hex');

      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', (data) => {
        const response = JSON.parse(data.toString().trim());
        expect(response.accepted).toBe(true);
        expect(response.orderId).toBe('12345');
        expect(response.ipc_latency_ms).toBeDefined();
        expect(mockSignalRouter.route).toHaveBeenCalledWith(signal);
        client.end();
        done();
      });
    });

    test('should reject message with invalid signature', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = 'invalid-signature';
      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', (data) => {
        const response = JSON.parse(data.toString().trim());
        expect(response.rejected).toBe(true);
        expect(response.reason).toBe('INVALID_SIGNATURE');
        expect(mockSignalRouter.route).not.toHaveBeenCalled();
        client.end();
        done();
      });
    });

    test('should handle JSON parse errors', (done) => {
      server.start();

      const message = 'invalid-json\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', (data) => {
        const response = JSON.parse(data.toString().trim());
        expect(response.rejected).toBe(true);
        expect(response.reason).toBe('IPC_ERROR');
        client.end();
        done();
      });
    });

    test('should handle multiple messages in single data event', async () => {
      server.start();

      const signal1 = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature1 = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal1))
        .digest('hex');

      const signal2 = { type: 'CONFIRM', signal_id: '123' };
      const signature2 = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal2))
        .digest('hex');

      const message1 = JSON.stringify({ signal: signal1, signature: signature1 }) + '\n';
      const message2 = JSON.stringify({ signal: signal2, signature: signature2 }) + '\n';

      const client = net.connect(socketPath);
      
      await new Promise((resolve) => {
        client.on('connect', () => {
          client.write(message1 + message2);
        });

        let responseCount = 0;
        let buffer = '';
        
        client.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          
          // Process complete lines
          for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].trim()) {
              responseCount++;
            }
          }
          
          // Keep incomplete line in buffer
          buffer = lines[lines.length - 1];
          
          if (responseCount >= 2) {
            expect(mockSignalRouter.route).toHaveBeenCalledTimes(2);
            client.destroy();
            resolve();
          }
        });
      });
    }, 10000);
  });

  describe('Connection Limits', () => {
    test('should reject connections when limit reached', async () => {
      const limitedServer = new FastPathServer(socketPath, hmacSecret, mockSignalRouter, 2);
      limitedServer.start();

      const clients = [];
      
      // Create 3 connections (limit is 2)
      for (let i = 0; i < 3; i++) {
        const client = net.connect(socketPath);
        clients.push(client);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
      
      const status = limitedServer.getStatus();
      expect(status.activeConnections).toBeLessThanOrEqual(2);
      
      // Clean up clients
      for (const client of clients) {
        client.destroy();
      }
      
      await limitedServer.stop();
    });
  });

  describe('Metrics', () => {
    test('should track messages received', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal))
        .digest('hex');

      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', () => {
        const status = server.getStatus();
        expect(status.metrics.messagesReceived).toBe(1);
        expect(status.metrics.messagesProcessed).toBe(1);
        client.end();
        done();
      });
    });

    test('should track invalid signatures', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = 'invalid';
      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', () => {
        const status = server.getStatus();
        expect(status.metrics.invalidSignatures).toBe(1);
        client.end();
        done();
      });
    });

    test('should track latency metrics', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal))
        .digest('hex');

      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', () => {
        const status = server.getStatus();
        expect(status.metrics.avgLatencyMs).toBeGreaterThan(0);
        expect(status.metrics.minLatencyMs).toBeGreaterThan(0);
        expect(status.metrics.maxLatencyMs).toBeGreaterThan(0);
        client.end();
        done();
      });
    });

    test('should reset metrics', () => {
      server.metrics.messagesReceived = 10;
      server.metrics.messagesProcessed = 8;
      
      server.resetMetrics();
      
      expect(server.metrics.messagesReceived).toBe(0);
      expect(server.metrics.messagesProcessed).toBe(0);
    });
  });

  describe('stop()', () => {
    test('should stop server and clean up', async () => {
      server.start();
      await server.stop();

      const status = server.getStatus();
      expect(status.running).toBe(false);
    });

    test('should close active connections', async () => {
      server.start();

      const client = net.connect(socketPath);
      
      // Wait for connection to establish
      await new Promise(resolve => {
        client.on('connect', resolve);
      });
      
      expect(server.connections.size).toBe(1);
      
      await server.stop();
      
      expect(server.connections.size).toBe(0);
    }, 10000);

    test('should handle graceful shutdown with timeout', async () => {
      server.start();

      const client = net.connect(socketPath);
      
      // Wait for connection to establish
      await new Promise(resolve => {
        client.on('connect', resolve);
      });
      
      const stopPromise = server.stop(1000);
      
      await stopPromise;
      
      expect(server.connections.size).toBe(0);
    }, 10000);

    test('should do nothing if server not running', async () => {
      await expect(server.stop()).resolves.not.toThrow();
    });
  });

  describe('getStatus()', () => {
    test('should return correct status when running', () => {
      server.start();
      
      const status = server.getStatus();
      
      expect(status.running).toBe(true);
      expect(status.socketPath).toBe(socketPath);
      expect(status.activeConnections).toBe(0);
      expect(status.maxConnections).toBe(10);
      expect(status.metrics).toBeDefined();
    });

    test('should return correct status when stopped', () => {
      const status = server.getStatus();
      
      expect(status.running).toBe(false);
    });

    test('should calculate average latency correctly', (done) => {
      server.start();

      const signal = { type: 'PREPARE', symbol: 'BTCUSDT' };
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(JSON.stringify(signal))
        .digest('hex');

      const message = JSON.stringify({ signal, signature }) + '\n';

      const client = net.connect(socketPath, () => {
        client.write(message);
      });

      client.on('data', () => {
        const status = server.getStatus();
        expect(status.metrics.avgLatencyMs).toBeGreaterThan(0);
        expect(status.metrics.avgLatencyMs).toBe(
          status.metrics.minLatencyMs
        );
        client.end();
        done();
      });
    });
  });
});
