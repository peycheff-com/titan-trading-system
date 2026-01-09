/**
 * WebSocket Mock for Testing
 * 
 * Provides a mock WebSocket implementation that prevents actual
 * network connections during testing while maintaining the same API.
 */

class MockWebSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen({ type: 'open' });
      }
    }, 0);
  }
  
  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock sending - do nothing in tests
  }
  
  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ type: 'close', code, reason });
      }
    }, 0);
  }
  
  addEventListener(type, listener) {
    this[`on${type}`] = listener;
  }
  
  removeEventListener(type, listener) {
    if (this[`on${type}`] === listener) {
      this[`on${type}`] = null;
    }
  }
  
  // Simulate receiving a message (for testing)
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ type: 'message', data });
    }
  }
  
  // Simulate an error (for testing)
  simulateError(error) {
    if (this.onerror) {
      this.onerror({ type: 'error', error });
    }
  }
}

// WebSocket constants
MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;

module.exports = MockWebSocket;