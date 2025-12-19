/**
 * Deployment Validation System
 * 
 * Validates service startup, WebSocket connections, and Redis connectivity.
 * Implements Requirements 7.1, 7.2, 7.3 for comprehensive health checks.
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import WebSocket from 'ws';

export interface ValidationConfig {
  services: ServiceValidationConfig[];
  redis: RedisValidationConfig;
  websockets: WebSocketValidationConfig[];
  timeout: number; // Overall validation timeout in seconds
}

export interface ServiceValidationConfig {
  name: string;
  type: 'http' | 'tcp';
  endpoint?: string;
  port?: number;
  expectedResponse?: string;
  timeout: number;
}

export interface RedisValidationConfig {
  host: string;
  port: number;
  password?: string;
  timeout: number;
  testPubSub: boolean;
}

export interface WebSocketValidationConfig {
  name: string;
  url: string;
  timeout: number;
  expectedMessage?: string;
  testMessage?: string;
}

export interface ValidationResult {
  success: boolean;
  timestamp: Date;
  duration: number;
  results: {
    services: ServiceValidationResult[];
    redis: RedisValidationResult;
    websockets: WebSocketValidationResult[];
  };
  errors: ValidationError[];
}

export interface ServiceValidationResult {
  service: string;
  success: boolean;
  responseTime: number;
  error?: string;
}

export interface RedisValidationResult {
  success: boolean;
  responseTime: number;
  pubSubWorking: boolean;
  error?: string;
}

export interface WebSocketValidationResult {
  name: string;
  success: boolean;
  responseTime: number;
  connectionEstablished: boolean;
  messageExchangeWorking: boolean;
  error?: string;
}

export interface ValidationError {
  component: string;
  error: string;
  timestamp: Date;
}

/**
 * Deployment Validation System
 * 
 * Provides comprehensive validation of service startup, connectivity,
 * and functionality for production deployment verification.
 */
export class DeploymentValidator extends EventEmitter {
  private config: ValidationConfig;

  constructor(config?: Partial<ValidationConfig>) {
    super();
    
    // Default configuration for Titan services
    this.config = {
      services: [
        {
          name: 'titan-shared',
          type: 'tcp',
          port: 3001,
          timeout: 5
        },
        {
          name: 'titan-security',
          type: 'tcp',
          port: 3002,
          timeout: 5
        },
        {
          name: 'titan-brain',
          type: 'http',
          endpoint: 'http://localhost:3000/health',
          timeout: 5
        },
        {
          name: 'titan-execution',
          type: 'http',
          endpoint: 'http://localhost:3003/health',
          timeout: 5
        },
        {
          name: 'titan-phase1-scavenger',
          type: 'tcp',
          port: 3004,
          timeout: 5
        },
        {
          name: 'titan-ai-quant',
          type: 'tcp',
          port: 3005,
          timeout: 5
        },
        {
          name: 'titan-console',
          type: 'http',
          endpoint: 'http://localhost:3006/health',
          timeout: 5
        }
      ],
      redis: {
        host: 'localhost',
        port: 6379,
        timeout: 5,
        testPubSub: true
      },
      websockets: [
        {
          name: 'binance-spot',
          url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
          timeout: 10
        },
        {
          name: 'bybit-perps',
          url: 'wss://stream.bybit.com/v5/public/linear',
          timeout: 10
        }
      ],
      timeout: 30,
      ...config
    };
  }

  /**
   * Validate all deployment components
   * Requirements 7.1, 7.2, 7.3: Comprehensive validation within timeouts
   */
  async validateDeployment(): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      success: true,
      timestamp: new Date(),
      duration: 0,
      results: {
        services: [],
        redis: {
          success: false,
          responseTime: 0,
          pubSubWorking: false
        },
        websockets: []
      },
      errors: []
    };

    this.emit('validation:started');

    try {
      // Set overall timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Validation timeout after ${this.config.timeout} seconds`));
        }, this.config.timeout * 1000);
      });

      // Run all validations concurrently with timeout
      await Promise.race([
        this.runAllValidations(result),
        timeoutPromise
      ]);

    } catch (error) {
      result.success = false;
      result.errors.push({
        component: 'validator',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }

    result.duration = Date.now() - startTime;
    this.emit('validation:completed', result);
    
    return result;
  }

  /**
   * Run all validation checks concurrently
   */
  private async runAllValidations(result: ValidationResult): Promise<void> {
    // Run all validations in parallel for speed
    const [serviceResults, redisResult, websocketResults] = await Promise.allSettled([
      this.validateServices(),
      this.validateRedis(),
      this.validateWebSockets()
    ]);

    // Process service validation results
    if (serviceResults.status === 'fulfilled') {
      result.results.services = serviceResults.value;
    } else {
      result.success = false;
      result.errors.push({
        component: 'services',
        error: serviceResults.reason instanceof Error ? serviceResults.reason.message : String(serviceResults.reason),
        timestamp: new Date()
      });
    }

    // Process Redis validation results
    if (redisResult.status === 'fulfilled') {
      result.results.redis = redisResult.value;
    } else {
      result.success = false;
      result.errors.push({
        component: 'redis',
        error: redisResult.reason instanceof Error ? redisResult.reason.message : String(redisResult.reason),
        timestamp: new Date()
      });
    }

    // Process WebSocket validation results
    if (websocketResults.status === 'fulfilled') {
      result.results.websockets = websocketResults.value;
    } else {
      result.success = false;
      result.errors.push({
        component: 'websockets',
        error: websocketResults.reason instanceof Error ? websocketResults.reason.message : String(websocketResults.reason),
        timestamp: new Date()
      });
    }

    // Check if any individual validations failed
    const hasFailedServices = result.results.services.some(s => !s.success);
    const hasFailedRedis = !result.results.redis.success;
    const hasFailedWebSockets = result.results.websockets.some(w => !w.success);

    if (hasFailedServices || hasFailedRedis || hasFailedWebSockets) {
      result.success = false;
    }
  }

  /**
   * Validate all services are running and responsive
   * Requirement 7.1: Validate all services are running and responsive within 5 seconds
   */
  private async validateServices(): Promise<ServiceValidationResult[]> {
    const results: ServiceValidationResult[] = [];

    // Validate all services concurrently
    const servicePromises = this.config.services.map(async (serviceConfig) => {
      const startTime = Date.now();
      
      try {
        if (serviceConfig.type === 'http') {
          await this.validateHttpService(serviceConfig);
        } else if (serviceConfig.type === 'tcp') {
          await this.validateTcpService(serviceConfig);
        }

        const responseTime = Date.now() - startTime;
        
        return {
          service: serviceConfig.name,
          success: true,
          responseTime
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        return {
          service: serviceConfig.name,
          success: false,
          responseTime,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

    const serviceResults = await Promise.allSettled(servicePromises);
    
    for (const result of serviceResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          service: 'unknown',
          success: false,
          responseTime: 0,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }

    this.emit('services:validated', results);
    return results;
  }

  /**
   * Validate HTTP service endpoint
   */
  private async validateHttpService(config: ServiceValidationConfig): Promise<void> {
    if (!config.endpoint) {
      throw new Error(`HTTP endpoint not configured for service: ${config.name}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      const response = await fetch(config.endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Titan-Deployment-Validator/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check expected response if configured
      if (config.expectedResponse) {
        const body = await response.text();
        if (!body.includes(config.expectedResponse)) {
          throw new Error(`Expected response not found: ${config.expectedResponse}`);
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate TCP service port
   */
  private async validateTcpService(config: ServiceValidationConfig): Promise<void> {
    if (!config.port) {
      throw new Error(`TCP port not configured for service: ${config.name}`);
    }

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP connection timeout after ${config.timeout} seconds`));
      }, config.timeout * 1000);

      socket.connect(config.port!, 'localhost', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve();
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`TCP connection failed: ${error.message}`));
      });
    });
  }

  /**
   * Validate Redis connectivity and pub/sub functionality
   * Requirement 7.3: Verify Redis connectivity and pub/sub functionality
   */
  private async validateRedis(): Promise<RedisValidationResult> {
    const startTime = Date.now();
    const result: RedisValidationResult = {
      success: false,
      responseTime: 0,
      pubSubWorking: false
    };

    try {
      // Import Redis client
      const redis = await import('redis');
      
      // Create Redis client
      const client = redis.createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          connectTimeout: this.config.redis.timeout * 1000
        },
        password: this.config.redis.password
      });

      // Connect to Redis
      await client.connect();

      // Test basic connectivity with PING
      const pingResult = await client.ping();
      if (pingResult !== 'PONG') {
        throw new Error(`Redis PING failed: expected PONG, got ${pingResult}`);
      }

      // Test pub/sub functionality if enabled
      if (this.config.redis.testPubSub) {
        result.pubSubWorking = await this.testRedisPubSub(client);
      } else {
        result.pubSubWorking = true; // Skip test
      }

      await client.disconnect();
      
      result.success = true;
      result.responseTime = Date.now() - startTime;
      
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.responseTime = Date.now() - startTime;
    }

    this.emit('redis:validated', result);
    return result;
  }

  /**
   * Test Redis pub/sub functionality
   */
  private async testRedisPubSub(client: any): Promise<boolean> {
    try {
      // Create subscriber client
      const subscriber = client.duplicate();
      await subscriber.connect();

      const testChannel = 'titan:deployment:test';
      const testMessage = 'deployment-validation-test';
      let messageReceived = false;

      // Set up message handler
      await subscriber.subscribe(testChannel, (message: string) => {
        if (message === testMessage) {
          messageReceived = true;
        }
      });

      // Wait a moment for subscription to be established
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish test message
      await client.publish(testChannel, testMessage);

      // Wait for message to be received
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clean up
      await subscriber.unsubscribe(testChannel);
      await subscriber.disconnect();

      return messageReceived;
    } catch {
      return false;
    }
  }

  /**
   * Validate WebSocket connections to exchanges
   * Requirement 7.2: Test WebSocket connections to all configured exchanges
   */
  private async validateWebSockets(): Promise<WebSocketValidationResult[]> {
    const results: WebSocketValidationResult[] = [];

    // Validate all WebSocket connections concurrently
    const websocketPromises = this.config.websockets.map(async (wsConfig) => {
      const startTime = Date.now();
      const result: WebSocketValidationResult = {
        name: wsConfig.name,
        success: false,
        responseTime: 0,
        connectionEstablished: false,
        messageExchangeWorking: false
      };

      try {
        const connectionResult = await this.testWebSocketConnection(wsConfig);
        
        result.connectionEstablished = connectionResult.connected;
        result.messageExchangeWorking = connectionResult.messageReceived;
        result.success = connectionResult.connected && connectionResult.messageReceived;
        result.responseTime = Date.now() - startTime;
        
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.responseTime = Date.now() - startTime;
      }

      return result;
    });

    const websocketResults = await Promise.allSettled(websocketPromises);
    
    for (const result of websocketResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          name: 'unknown',
          success: false,
          responseTime: 0,
          connectionEstablished: false,
          messageExchangeWorking: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason)
        });
      }
    }

    this.emit('websockets:validated', results);
    return results;
  }

  /**
   * Test individual WebSocket connection
   */
  private async testWebSocketConnection(config: WebSocketValidationConfig): Promise<{
    connected: boolean;
    messageReceived: boolean;
  }> {
    return new Promise((resolve, reject) => {
      let connected = false;
      let messageReceived = false;
      
      const ws = new WebSocket(config.url);
      
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve({ connected, messageReceived });
      }, config.timeout * 1000);

      ws.on('open', () => {
        connected = true;
        
        // Send test message if configured
        if (config.testMessage) {
          ws.send(config.testMessage);
        }
      });

      ws.on('message', (data: Buffer) => {
        messageReceived = true;
        
        // Check for expected message if configured
        if (config.expectedMessage) {
          const message = data.toString();
          if (message.includes(config.expectedMessage)) {
            clearTimeout(timeout);
            ws.close();
            resolve({ connected, messageReceived });
          }
        } else {
          // Any message received is considered success
          clearTimeout(timeout);
          ws.close();
          resolve({ connected, messageReceived });
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        resolve({ connected, messageReceived });
      });
    });
  }

  /**
   * Update validation configuration
   */
  updateConfig(config: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current validation configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  /**
   * Validate a single service
   */
  async validateSingleService(serviceName: string): Promise<ServiceValidationResult> {
    const serviceConfig = this.config.services.find(s => s.name === serviceName);
    if (!serviceConfig) {
      throw new Error(`Service configuration not found: ${serviceName}`);
    }

    const startTime = Date.now();
    
    try {
      if (serviceConfig.type === 'http') {
        await this.validateHttpService(serviceConfig);
      } else if (serviceConfig.type === 'tcp') {
        await this.validateTcpService(serviceConfig);
      }

      return {
        service: serviceName,
        success: true,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        service: serviceName,
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Quick health check (basic connectivity only)
   */
  async quickHealthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      // Quick TCP checks for critical services
      const criticalServices = ['titan-brain', 'titan-execution', 'shared'];
      
      for (const serviceName of criticalServices) {
        const serviceConfig = this.config.services.find(s => s.name === serviceName);
        if (serviceConfig && serviceConfig.port) {
          try {
            await this.validateTcpService({ ...serviceConfig, timeout: 2 });
          } catch (error) {
            issues.push(`${serviceName}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }

      // Quick Redis check
      try {
        const redis = await import('redis');
        const client = redis.createClient({
          socket: {
            host: this.config.redis.host,
            port: this.config.redis.port,
            connectTimeout: 2000
          }
        });
        
        await client.connect();
        await client.ping();
        await client.disconnect();
      } catch (error) {
        issues.push(`Redis: ${error instanceof Error ? error.message : String(error)}`);
      }

      return {
        healthy: issues.length === 0,
        issues
      };
    } catch (error) {
      return {
        healthy: false,
        issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}