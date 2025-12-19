/**
 * Fast Path IPC Server
 * 
 * Provides sub-millisecond signal delivery from Scavenger to Execution Service
 * via Unix Domain Socket (localhost only).
 * 
 * Features:
 * - HMAC signature verification for authentication
 * - Immediate reply to minimize latency
 * - Graceful socket cleanup on shutdown
 * - Routes signals to existing SignalRouter
 * - Message framing for large payloads
 * - Connection limits and backpressure handling
 * - Metrics collection for observability
 */

import net from 'net';
import fs from 'fs';
import crypto from 'crypto';

class FastPathServer {
  constructor(socketPath, hmacSecret, signalRouter, maxConnections = 10) {
    this.socketPath = socketPath;
    this.hmacSecret = hmacSecret;
    this.signalRouter = signalRouter;
    this.server = null;
    this.connections = new Set();
    this.maxConnections = maxConnections;
    this.MESSAGE_DELIMITER = '\n';
    this.metrics = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      invalidSignatures: 0,
      totalLatencyMs: 0,
      minLatencyMs: Infinity,
      maxLatencyMs: 0
    };
  }

  /**
   * Start the IPC server
   */
  start() {
    // Remove existing socket file if it exists
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (error) {
        console.error(`❌ Failed to remove existing socket: ${error.message}`);
        throw error;
      }
    }

    // Create server
    this.server = net.createServer((socket) => {
      // Enforce connection limit
      if (this.connections.size >= this.maxConnections) {
        console.warn(`⚠️ Connection limit reached (${this.maxConnections}), rejecting new connection`);
        socket.end(JSON.stringify({ 
          rejected: true, 
          reason: 'MAX_CONNECTIONS_REACHED' 
        }));
        return;
      }

      this.connections.add(socket);
      let buffer = ''; // Buffer for incomplete messages

      socket.on('data', async (data) => {
        buffer += data.toString();
        
        // Process complete messages
        let delimiterIndex;
        while ((delimiterIndex = buffer.indexOf(this.MESSAGE_DELIMITER)) !== -1) {
          const messageStr = buffer.slice(0, delimiterIndex);
          buffer = buffer.slice(delimiterIndex + 1);
          
          await this._handleMessage(socket, messageStr);
        }
      });

      socket.on('error', (error) => {
        console.error(`❌ Socket error: ${error.message}`);
      });

      socket.on('close', () => {
        this.connections.delete(socket);
      });
    });

    // Listen on Unix Domain Socket
    this.server.listen(this.socketPath, () => {
      console.log(`✅ Fast Path IPC listening on ${this.socketPath}`);
    });

    // Handle server errors
    this.server.on('error', (error) => {
      console.error(`❌ Fast Path IPC Server error: ${error.message}`);
      throw error;
    });
  }

  /**
   * Handle individual message
   * @param {net.Socket} socket - Client socket
   * @param {string} messageStr - Message string
   * @private
   */
  async _handleMessage(socket, messageStr) {
    const startTime = process.hrtime.bigint();
    this.metrics.messagesReceived++;

    try {
      // Parse message
      const message = JSON.parse(messageStr);

      // Verify HMAC signature
      if (!this.verifySignature(message)) {
        this.metrics.invalidSignatures++;
        this._sendReply(socket, { 
          rejected: true, 
          reason: 'INVALID_SIGNATURE' 
        });
        return;
      }

      // Route signal to SignalRouter
      const result = await this.signalRouter.route(message.signal);

      // Calculate latency
      const endTime = process.hrtime.bigint();
      const latencyNs = Number(endTime - startTime);
      const latencyMs = latencyNs / 1_000_000;

      // Update metrics
      this.metrics.messagesProcessed++;
      this.metrics.totalLatencyMs += latencyMs;
      this.metrics.minLatencyMs = Math.min(this.metrics.minLatencyMs, latencyMs);
      this.metrics.maxLatencyMs = Math.max(this.metrics.maxLatencyMs, latencyMs);

      // Add latency to result
      result.ipc_latency_ms = latencyMs;

      // Reply immediately
      this._sendReply(socket, result);

    } catch (error) {
      this.metrics.messagesFailed++;
      console.error(`❌ Fast Path IPC error: ${error.message}`);
      this._sendReply(socket, { 
        rejected: true, 
        reason: 'IPC_ERROR', 
        error: error.message 
      });
    }
  }

  /**
   * Send reply with backpressure handling
   * @param {net.Socket} socket - Client socket
   * @param {Object} data - Data to send
   * @private
   */
  _sendReply(socket, data) {
    const reply = JSON.stringify(data) + this.MESSAGE_DELIMITER;
    if (!socket.write(reply)) {
      // Backpressure - wait for drain
      socket.once('drain', () => {
        console.log('Socket drained after backpressure');
      });
    }
  }

  /**
   * Verify HMAC signature
   * @param {Object} message - Message with signal and signature
   * @returns {boolean} - True if signature is valid
   */
  verifySignature(message) {
    const { signal, signature } = message;

    if (!signal || !signature) {
      return false;
    }

    try {
      const signatureBuffer = Buffer.from(signature, 'hex');
      
      // Validate hex string length (SHA256 = 64 hex chars = 32 bytes)
      if (signatureBuffer.length !== 32) {
        return false;
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(JSON.stringify(signal))
        .digest();

      // Constant-time comparison to prevent timing attacks
      return crypto.timingSafeEqual(signatureBuffer, expectedSignature);
    } catch (error) {
      console.error(`❌ Signature verification error: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop the IPC server with graceful shutdown
   * @param {number} timeout - Max wait time in ms (default: 5000)
   */
  async stop(timeout = 5000) {
    if (!this.server) {
      return;
    }

    console.log('🛑 Stopping Fast Path IPC Server...');

    // Stop accepting new connections
    this.server.close();

    // Wait for active connections to finish or timeout
    const shutdownPromise = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.connections.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });

    await Promise.race([shutdownPromise, timeoutPromise]);

    // Force close remaining connections
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    // Remove socket file
    if (fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
      } catch (error) {
        console.error(`❌ Failed to remove socket file: ${error.message}`);
      }
    }

    this.server = null;
    console.log('✅ Fast Path IPC Server stopped');
  }

  /**
   * Get server status with metrics
   * @returns {Object} - Server status and metrics
   */
  getStatus() {
    const avgLatency = this.metrics.messagesProcessed > 0
      ? this.metrics.totalLatencyMs / this.metrics.messagesProcessed
      : 0;

    return {
      running: this.server !== null,
      socketPath: this.socketPath,
      activeConnections: this.connections.size,
      maxConnections: this.maxConnections,
      metrics: {
        messagesReceived: this.metrics.messagesReceived,
        messagesProcessed: this.metrics.messagesProcessed,
        messagesFailed: this.metrics.messagesFailed,
        invalidSignatures: this.metrics.invalidSignatures,
        avgLatencyMs: avgLatency,
        minLatencyMs: this.metrics.minLatencyMs === Infinity ? 0 : this.metrics.minLatencyMs,
        maxLatencyMs: this.metrics.maxLatencyMs
      }
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      messagesReceived: 0,
      messagesProcessed: 0,
      messagesFailed: 0,
      invalidSignatures: 0,
      totalLatencyMs: 0,
      minLatencyMs: Infinity,
      maxLatencyMs: 0
    };
  }

  /**
   * Check if server is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this.server !== null;
  }
}

export default FastPathServer;
