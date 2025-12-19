/**
 * EventEmitter Unit Tests
 * 
 * Tests the event system for TitanTrap engine.
 */

import { EventEmitter, EventType } from '../../src/events/EventEmitter.js';

describe('EventEmitter', () => {
  let emitter: EventEmitter;
  
  beforeEach(() => {
    emitter = new EventEmitter();
  });
  
  describe('Event Registration', () => {
    it('should register event listeners', () => {
      const handler = jest.fn();
      emitter.on('TRAP_MAP_UPDATED', handler);
      
      emitter.emit('TRAP_MAP_UPDATED', { symbolCount: 20 });
      
      expect(handler).toHaveBeenCalledWith({ symbolCount: 20 });
      expect(handler).toHaveBeenCalledTimes(1);
    });
    
    it('should support multiple listeners for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('TRAP_SPRUNG', handler1);
      emitter.on('TRAP_SPRUNG', handler2);
      
      emitter.emit('TRAP_SPRUNG', { symbol: 'BTCUSDT' });
      
      expect(handler1).toHaveBeenCalledWith({ symbol: 'BTCUSDT' });
      expect(handler2).toHaveBeenCalledWith({ symbol: 'BTCUSDT' });
    });
  });
  
  describe('Event Emission', () => {
    it('should emit TRAP_MAP_UPDATED event', () => {
      const handler = jest.fn();
      emitter.on('TRAP_MAP_UPDATED', handler);
      
      const data = {
        symbolCount: 20,
        duration: 5000,
        symbols: ['BTCUSDT', 'ETHUSDT']
      };
      
      emitter.emit('TRAP_MAP_UPDATED', data);
      
      expect(handler).toHaveBeenCalledWith(data);
    });
    
    it('should emit TRAP_SPRUNG event', () => {
      const handler = jest.fn();
      emitter.on('TRAP_SPRUNG', handler);
      
      const data = {
        symbol: 'BTCUSDT',
        price: 50000,
        trapType: 'LIQUIDATION',
        direction: 'LONG',
        confidence: 95
      };
      
      emitter.emit('TRAP_SPRUNG', data);
      
      expect(handler).toHaveBeenCalledWith(data);
    });
    
    it('should emit EXECUTION_COMPLETE event', () => {
      const handler = jest.fn();
      emitter.on('EXECUTION_COMPLETE', handler);
      
      const data = {
        symbol: 'BTCUSDT',
        fillPrice: 50100,
        positionSize: 0.1,
        leverage: 20
      };
      
      emitter.emit('EXECUTION_COMPLETE', data);
      
      expect(handler).toHaveBeenCalledWith(data);
    });
    
    it('should emit ERROR event', () => {
      const handler = jest.fn();
      emitter.on('ERROR', handler);
      
      const data = {
        message: 'API call failed',
        error: 'Network timeout'
      };
      
      emitter.emit('ERROR', data);
      
      expect(handler).toHaveBeenCalledWith(data);
    });
    
    it('should not throw if no listeners registered', () => {
      expect(() => {
        emitter.emit('TRAP_MAP_UPDATED', { symbolCount: 20 });
      }).not.toThrow();
    });
  });
  
  describe('Event Unregistration', () => {
    it('should unregister specific listener', () => {
      const handler = jest.fn();
      emitter.on('TRAP_MAP_UPDATED', handler);
      
      emitter.off('TRAP_MAP_UPDATED', handler);
      emitter.emit('TRAP_MAP_UPDATED', { symbolCount: 20 });
      
      expect(handler).not.toHaveBeenCalled();
    });
    
    it('should remove all listeners for an event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('TRAP_SPRUNG', handler1);
      emitter.on('TRAP_SPRUNG', handler2);
      
      emitter.removeAllListeners('TRAP_SPRUNG');
      emitter.emit('TRAP_SPRUNG', { symbol: 'BTCUSDT' });
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
    
    it('should remove all listeners for all events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      emitter.on('TRAP_MAP_UPDATED', handler1);
      emitter.on('TRAP_SPRUNG', handler2);
      
      emitter.removeAllListeners();
      
      emitter.emit('TRAP_MAP_UPDATED', { symbolCount: 20 });
      emitter.emit('TRAP_SPRUNG', { symbol: 'BTCUSDT' });
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    it('should catch and log errors in event handlers', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const throwingHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      
      const normalHandler = jest.fn();
      
      emitter.on('TRAP_MAP_UPDATED', throwingHandler);
      emitter.on('TRAP_MAP_UPDATED', normalHandler);
      
      emitter.emit('TRAP_MAP_UPDATED', { symbolCount: 20 });
      
      expect(throwingHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Event handler error'),
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
  
  describe('Type Safety', () => {
    it('should support all event types', () => {
      const events: EventType[] = [
        'TRAP_MAP_UPDATED',
        'TRAP_SPRUNG',
        'EXECUTION_COMPLETE',
        'ERROR'
      ];
      
      events.forEach(eventType => {
        const handler = jest.fn();
        emitter.on(eventType, handler);
        emitter.emit(eventType, { test: true });
        expect(handler).toHaveBeenCalledWith({ test: true });
      });
    });
  });
});
