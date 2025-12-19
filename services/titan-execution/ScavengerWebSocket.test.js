/**
 * ScavengerWebSocket Tests
 * 
 * Unit tests for Scavenger WebSocket server
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WebSocketServer } from 'ws';
import { ScavengerWebSocket } from './ScavengerWebSocket.js';

describe('ScavengerWebSocket', () => {
  let scavengerWs;
  let mockServer;
  let mockLogger;

  beforeEach(() => {
    mockServer = {
      on: jest.fn(),
      removeListener: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    scavengerWs = new ScavengerWebSocket({
      server: mockServer,
      path: '/ws/scavenger',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    if (scavengerWs) {
      scavengerWs.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize with correct path', () => {
      expect(scavengerWs.path).toBe('/ws/scavenger');
    });

    it('should initialize with empty client set', () => {
      expect(scavengerWs.clients.size).toBe(0);
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        { path: '/ws/scavenger' },
        'Scavenger WebSocket server initialized'
      );
    });
  });

  describe('State Provider', () => {
    it('should set state provider', () => {
      const provider = async () => ({ test: 'data' });
      scavengerWs.setStateProvider(provider);
      expect(scavengerWs.stateProvider).toBe(provider);
    });
  });

  describe('Event Broadcasting', () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        readyState: 1, // WebSocket.OPEN
        send: jest.fn(),
      };
      scavengerWs.clients.add(mockClient);
    });

    it('should broadcast trap map update', async () => {
      const tripwires = [
        {
          symbol: 'BTCUSDT',
          currentPrice: 50000,
          triggerPrice: 49500,
          trapType: 'LIQUIDATION',
          direction: 'LONG',
          confidence: 95,
          leadTime: 150,
        },
      ];

      scavengerWs.pushTrapMapUpdate(tripwires);
      
      // Wait for batch to flush (trap_map_updated is batched)
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(mockClient.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockClient.send.mock.calls[0][0]);
      expect(sentData.type).toBe('trap_map_updated');
      expect(sentData.data.tripwires).toHaveLength(1);
      expect(sentData.data.tripwires[0].symbol).toBe('BTCUSDT');
      expect(sentData.data.count).toBe(1);
    });

    it('should broadcast sensor status update', async () => {
      const status = {
        binanceHealth: 'OK',
        binanceTickRate: 1500,
        bybitStatus: 'ARMED',
        bybitPing: 45,
        slippage: 0.08,
      };

      scavengerWs.pushSensorStatusUpdate(status);
      
      // Sensor status is sent immediately (not batched)
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockClient.send.mock.calls[0][0]);
      expect(sentData.type).toBe('sensor_status_updated');
      expect(sentData.data.binanceHealth).toBe('OK');
      expect(sentData.data.bybitStatus).toBe('ARMED');
    });

    it('should broadcast trap sprung event', async () => {
      const trap = {
        symbol: 'BTCUSDT',
        trapType: 'LIQUIDATION',
        triggerPrice: 49500,
        actualPrice: 49485,
        direction: 'LONG',
        confidence: 95,
      };

      scavengerWs.pushTrapSprung(trap);
      
      // Trap sprung is sent immediately (not batched)
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockClient.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockClient.send.mock.calls[0][0]);
      expect(sentData.type).toBe('trap_sprung');
      expect(sentData.data.symbol).toBe('BTCUSDT');
      expect(sentData.data.trapType).toBe('LIQUIDATION');
    });

    it('should calculate proximity in trap map update', async () => {
      const tripwires = [
        {
          symbol: 'BTCUSDT',
          currentPrice: 50000,
          triggerPrice: 49500,
          trapType: 'LIQUIDATION',
          direction: 'LONG',
          confidence: 95,
          leadTime: 150,
        },
      ];

      scavengerWs.pushTrapMapUpdate(tripwires);
      
      // Wait for batch to flush
      await new Promise(resolve => setTimeout(resolve, 150));

      const sentData = JSON.parse(mockClient.send.mock.calls[0][0]);
      const proximity = sentData.data.tripwires[0].proximity;
      expect(proximity).toBeCloseTo(0.0101, 4); // (50000 - 49500) / 49500
    });
  });

  describe('Client Count', () => {
    it('should return correct client count', () => {
      expect(scavengerWs.getClientCount()).toBe(0);

      const mockClient1 = { readyState: 1, send: jest.fn() };
      const mockClient2 = { readyState: 1, send: jest.fn() };

      scavengerWs.clients.add(mockClient1);
      expect(scavengerWs.getClientCount()).toBe(1);

      scavengerWs.clients.add(mockClient2);
      expect(scavengerWs.getClientCount()).toBe(2);
    });
  });

  describe('Close', () => {
    it('should close all clients and clear set', () => {
      const mockClient = {
        readyState: 1,
        send: jest.fn(),
        close: jest.fn(),
      };

      scavengerWs.clients.add(mockClient);
      scavengerWs.close();

      expect(mockClient.close).toHaveBeenCalled();
      expect(scavengerWs.clients.size).toBe(0);
    });
  });
});

