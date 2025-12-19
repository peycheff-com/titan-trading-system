#!/usr/bin/env node

/**
 * Webhook Testing Utility
 * 
 * Comprehensive testing tool for Titan webhook endpoints including:
 * - HMAC signature generation and validation
 * - Signal payload validation
 * - Response handling and error scenarios
 * - Performance benchmarking
 * - Batch testing capabilities
 * 
 * Usage: 
 *   node webhook-tester.js --help
 *   node webhook-tester.js test-signal
 *   node webhook-tester.js benchmark --count 100
 *   node webhook-tester.js validate-config
 */

const axios = require('axios');
const crypto = require('crypto');
const { Command } = require('commander');

class WebhookTester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.EXECUTION_URL || 'http://localhost:3002';
    this.brainUrl = options.brainUrl || process.env.BRAIN_URL || 'http://localhost:3100';
    this.webhookSecret = options.webhookSecret || process.env.WEBHOOK_SECRET || 'your-webhook-secret';
    this.verbose = options.verbose || false;
    
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: []
    };
  }

  /**
   * Generate HMAC signature
   */
  generateSignature(body) {
    if (!this.webhookSecret) return null;
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(body))
      .digest('hex');
  }

  /**
   * Generate unique signal ID
   */
  generateSignalId(prefix = 'test') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Create test signal payload
   */
  createTestSignal(type = 'PREPARE', overrides = {}) {
    const baseSignal = {
      type,
      signal_id: this.generateSignalId('webhook_test'),
      timestamp: Date.now(),
      ...overrides
    };

    switch (type) {
      case 'PREPARE':
        return {
          ...baseSignal,
          symbol: 'BTCUSDT',
          direction: 'LONG',
          size: 100,
          leverage: 15,
          ...overrides
        };

      case 'CONFIRM':
        return {
          ...baseSignal,
          symbol: 'BTCUSDT',
          direction: 'LONG',
          size: 100,
          entry_price: 43250.50,
          stop_loss: 42800.00,
          take_profit: 44000.00,
          ...overrides
        };

      case 'ABORT':
        return {
          ...baseSignal,
          reason: 'Test abort',
          ...overrides
        };

      case 'HEARTBEAT':
        return {
          ...baseSignal,
          equity: 2500.00,
          ...overrides
        };

      default:
        throw new Error(`Unknown signal type: ${type}`);
    }
  }

  /**
   * Send webhook request
   */
  async sendWebhook(payload, options = {}) {
    const startTime = Date.now();
    
    const headers = {
      'Content-Type': 'application/json',
      'x-source': 'titan_dashboard',
      ...options.headers
    };

    // Generate HMAC signature
    const signature = this.generateSignature(payload);
    if (signature) {
      headers['x-signature'] = signature;
    }

    const url = `${this.baseUrl}/webhook`;

    try {
      if (this.verbose) {
        console.log(`📤 Sending ${payload.type} signal: ${payload.signal_id}`);
        console.log(`   URL: ${url}`);
        console.log(`   Payload:`, JSON.stringify(payload, null, 2));
      }

      const response = await axios.post(url, payload, { 
        headers,
        timeout: options.timeout || 10000
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.updateStats(true, duration);

      if (this.verbose) {
        console.log(`✅ Response (${duration}ms):`, response.data);
      }

      return {
        success: true,
        status: response.status,
        data: response.data,
        duration,
        headers: response.headers
      };

    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.updateStats(false, duration, error);

      if (this.verbose) {
        console.log(`❌ Error (${duration}ms):`, error.response?.data || error.message);
      }

      return {
        success: false,
        status: error.response?.status,
        error: error.response?.data || { error: error.message },
        duration
      };
    }
  }

  /**
   * Update statistics
   */
  updateStats(success, duration, error = null) {
    this.stats.totalRequests++;
    this.stats.totalTime += duration;
    this.stats.minTime = Math.min(this.stats.minTime, duration);
    this.stats.maxTime = Math.max(this.stats.maxTime, duration);

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
      if (error) {
        this.stats.errors.push({
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
      }
    }
  }

  /**
   * Test single signal
   */
  async testSignal(type = 'PREPARE', options = {}) {
    console.log(`🧪 Testing ${type} signal...`);
    
    const payload = this.createTestSignal(type, options.payload);
    const result = await this.sendWebhook(payload, options);

    if (result.success) {
      console.log(`✅ ${type} signal test passed (${result.duration}ms)`);
      console.log(`   Response: ${result.data.message || 'Success'}`);
    } else {
      console.log(`❌ ${type} signal test failed (${result.duration}ms)`);
      console.log(`   Error: ${result.error.error || 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Test signal flow (PREPARE -> CONFIRM)
   */
  async testSignalFlow(options = {}) {
    console.log('🔄 Testing complete signal flow...');
    
    const signalId = this.generateSignalId('flow_test');
    
    // Step 1: PREPARE
    console.log('📋 Step 1: PREPARE signal');
    const preparePayload = this.createTestSignal('PREPARE', { 
      signal_id: signalId,
      ...options.prepare 
    });
    const prepareResult = await this.sendWebhook(preparePayload, options);
    
    if (!prepareResult.success) {
      console.log('❌ PREPARE failed - aborting flow test');
      return { success: false, step: 'PREPARE', result: prepareResult };
    }

    // Wait between signals
    await this.sleep(options.delay || 1000);

    // Step 2: CONFIRM
    console.log('✅ Step 2: CONFIRM signal');
    const confirmPayload = this.createTestSignal('CONFIRM', { 
      signal_id: signalId,
      ...options.confirm 
    });
    const confirmResult = await this.sendWebhook(confirmPayload, options);

    if (confirmResult.success) {
      console.log('✅ Signal flow test completed successfully');
      return { success: true, prepare: prepareResult, confirm: confirmResult };
    } else {
      console.log('❌ CONFIRM failed');
      return { success: false, step: 'CONFIRM', result: confirmResult };
    }
  }

  /**
   * Test error scenarios
   */
  async testErrorScenarios() {
    console.log('🚨 Testing error scenarios...');
    
    const tests = [
      {
        name: 'Invalid signature',
        payload: this.createTestSignal('PREPARE'),
        options: { headers: { 'x-signature': 'invalid_signature' } },
        expectedStatus: 401
      },
      {
        name: 'Missing x-source header',
        payload: this.createTestSignal('PREPARE'),
        options: { headers: { 'x-source': undefined } },
        expectedStatus: 401
      },
      {
        name: 'Invalid signal type',
        payload: { ...this.createTestSignal('PREPARE'), type: 'INVALID' },
        options: {},
        expectedStatus: 400
      },
      {
        name: 'Missing required fields',
        payload: { type: 'PREPARE', signal_id: this.generateSignalId() },
        options: {},
        expectedStatus: 400
      },
      {
        name: 'Duplicate signal ID',
        payload: this.createTestSignal('PREPARE', { signal_id: 'duplicate_test_123' }),
        options: {},
        expectedStatus: 409,
        runTwice: true
      }
    ];

    const results = [];

    for (const test of tests) {
      console.log(`   Testing: ${test.name}`);
      
      let result = await this.sendWebhook(test.payload, test.options);
      
      // For duplicate test, send the same signal twice
      if (test.runTwice) {
        await this.sendWebhook(test.payload, test.options); // First request
        result = await this.sendWebhook(test.payload, test.options); // Second request (should fail)
      }
      
      const passed = result.status === test.expectedStatus;
      
      if (passed) {
        console.log(`   ✅ ${test.name} - Expected status ${test.expectedStatus}, got ${result.status}`);
      } else {
        console.log(`   ❌ ${test.name} - Expected status ${test.expectedStatus}, got ${result.status}`);
      }
      
      results.push({ ...test, passed, actualStatus: result.status });
    }

    const passedTests = results.filter(r => r.passed).length;
    console.log(`\n📊 Error scenario tests: ${passedTests}/${results.length} passed`);
    
    return results;
  }

  /**
   * Performance benchmark
   */
  async benchmark(options = {}) {
    const count = options.count || 100;
    const concurrency = options.concurrency || 10;
    const signalType = options.signalType || 'PREPARE';
    
    console.log(`🏃 Running performance benchmark...`);
    console.log(`   Requests: ${count}`);
    console.log(`   Concurrency: ${concurrency}`);
    console.log(`   Signal Type: ${signalType}`);
    
    this.resetStats();
    
    const startTime = Date.now();
    const batches = [];
    
    // Create batches for concurrent execution
    for (let i = 0; i < count; i += concurrency) {
      const batchSize = Math.min(concurrency, count - i);
      const batch = [];
      
      for (let j = 0; j < batchSize; j++) {
        const payload = this.createTestSignal(signalType, {
          signal_id: this.generateSignalId(`bench_${i + j}`)
        });
        batch.push(this.sendWebhook(payload, { timeout: 5000 }));
      }
      
      batches.push(batch);
    }
    
    // Execute batches
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      await Promise.all(batch);
      
      const progress = ((i + 1) * concurrency / count * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${progress}%`);
    }
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    
    console.log('\n\n📊 Benchmark Results:');
    console.log(`   Total Requests: ${this.stats.totalRequests}`);
    console.log(`   Successful: ${this.stats.successfulRequests}`);
    console.log(`   Failed: ${this.stats.failedRequests}`);
    console.log(`   Success Rate: ${(this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)}%`);
    console.log(`   Total Time: ${totalDuration}ms`);
    console.log(`   Requests/sec: ${(this.stats.totalRequests / totalDuration * 1000).toFixed(2)}`);
    console.log(`   Avg Response Time: ${(this.stats.totalTime / this.stats.totalRequests).toFixed(2)}ms`);
    console.log(`   Min Response Time: ${this.stats.minTime}ms`);
    console.log(`   Max Response Time: ${this.stats.maxTime}ms`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errors (${this.stats.errors.length}):`);
      const errorCounts = {};
      this.stats.errors.forEach(error => {
        const key = `${error.status}: ${error.message}`;
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
      
      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`   ${error} (${count}x)`);
      });
    }
    
    return this.stats;
  }

  /**
   * Validate webhook configuration
   */
  async validateConfig() {
    console.log('🔧 Validating webhook configuration...');
    
    const tests = [
      {
        name: 'Execution service health',
        test: async () => {
          const response = await axios.get(`${this.baseUrl}/health`);
          return { success: true, data: response.data };
        }
      },
      {
        name: 'Brain service health',
        test: async () => {
          const response = await axios.get(`${this.brainUrl}/health`);
          return { success: true, data: response.data };
        }
      },
      {
        name: 'HMAC signature validation',
        test: async () => {
          const payload = this.createTestSignal('HEARTBEAT');
          const result = await this.sendWebhook(payload);
          return result;
        }
      },
      {
        name: 'Master Arm status',
        test: async () => {
          const response = await axios.get(`${this.baseUrl}/api/console/master-arm`);
          return { success: true, data: response.data };
        }
      }
    ];

    const results = [];

    for (const test of tests) {
      console.log(`   Checking: ${test.name}`);
      
      try {
        const result = await test.test();
        
        if (result.success) {
          console.log(`   ✅ ${test.name} - OK`);
          if (test.name === 'Master Arm status' && !result.data.master_arm) {
            console.log(`      ⚠️  Warning: Master Arm is DISABLED`);
          }
        } else {
          console.log(`   ❌ ${test.name} - Failed`);
        }
        
        results.push({ name: test.name, success: result.success, data: result.data });
      } catch (error) {
        console.log(`   ❌ ${test.name} - Error: ${error.message}`);
        results.push({ name: test.name, success: false, error: error.message });
      }
    }

    const passedTests = results.filter(r => r.success).length;
    console.log(`\n📊 Configuration validation: ${passedTests}/${results.length} checks passed`);
    
    return results;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTime: 0,
      minTime: Infinity,
      maxTime: 0,
      errors: []
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log('\n📊 Session Statistics:');
    console.log(`   Total Requests: ${this.stats.totalRequests}`);
    console.log(`   Successful: ${this.stats.successfulRequests}`);
    console.log(`   Failed: ${this.stats.failedRequests}`);
    
    if (this.stats.totalRequests > 0) {
      console.log(`   Success Rate: ${(this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2)}%`);
      console.log(`   Avg Response Time: ${(this.stats.totalTime / this.stats.totalRequests).toFixed(2)}ms`);
    }
  }
}

// CLI Interface
const program = new Command();

program
  .name('webhook-tester')
  .description('Titan Webhook Testing Utility')
  .version('1.0.0');

program
  .option('-u, --url <url>', 'Execution service URL', 'http://localhost:3002')
  .option('-b, --brain-url <url>', 'Brain service URL', 'http://localhost:3100')
  .option('-s, --secret <secret>', 'Webhook secret for HMAC signing')
  .option('-v, --verbose', 'Verbose output')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    global.tester = new WebhookTester({
      baseUrl: options.url,
      brainUrl: options.brainUrl,
      webhookSecret: options.secret,
      verbose: options.verbose
    });
  });

program
  .command('test-signal')
  .description('Test a single signal')
  .option('-t, --type <type>', 'Signal type (PREPARE, CONFIRM, ABORT, HEARTBEAT)', 'PREPARE')
  .action(async (options) => {
    await global.tester.testSignal(options.type);
    global.tester.printStats();
  });

program
  .command('test-flow')
  .description('Test complete signal flow (PREPARE -> CONFIRM)')
  .option('-d, --delay <ms>', 'Delay between signals in ms', '1000')
  .action(async (options) => {
    await global.tester.testSignalFlow({ delay: parseInt(options.delay) });
    global.tester.printStats();
  });

program
  .command('test-errors')
  .description('Test error scenarios')
  .action(async () => {
    await global.tester.testErrorScenarios();
    global.tester.printStats();
  });

program
  .command('benchmark')
  .description('Run performance benchmark')
  .option('-c, --count <count>', 'Number of requests', '100')
  .option('--concurrency <concurrency>', 'Concurrent requests', '10')
  .option('-t, --type <type>', 'Signal type', 'PREPARE')
  .action(async (options) => {
    await global.tester.benchmark({
      count: parseInt(options.count),
      concurrency: parseInt(options.concurrency),
      signalType: options.type
    });
  });

program
  .command('validate-config')
  .description('Validate webhook configuration')
  .action(async () => {
    await global.tester.validateConfig();
  });

program
  .command('interactive')
  .description('Interactive testing mode')
  .action(async () => {
    console.log('🎮 Interactive Webhook Testing Mode');
    console.log('Available commands: test-signal, test-flow, test-errors, benchmark, validate-config, quit');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prompt = () => {
      rl.question('webhook-tester> ', async (input) => {
        const args = input.trim().split(' ');
        const command = args[0];

        try {
          switch (command) {
            case 'test-signal':
              const type = args[1] || 'PREPARE';
              await global.tester.testSignal(type);
              break;
            case 'test-flow':
              await global.tester.testSignalFlow();
              break;
            case 'test-errors':
              await global.tester.testErrorScenarios();
              break;
            case 'benchmark':
              const count = parseInt(args[1]) || 50;
              await global.tester.benchmark({ count });
              break;
            case 'validate-config':
              await global.tester.validateConfig();
              break;
            case 'stats':
              global.tester.printStats();
              break;
            case 'quit':
            case 'exit':
              console.log('👋 Goodbye!');
              rl.close();
              return;
            case 'help':
              console.log('Commands: test-signal [type], test-flow, test-errors, benchmark [count], validate-config, stats, quit');
              break;
            default:
              if (command) {
                console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
              }
          }
        } catch (error) {
          console.error('❌ Command failed:', error.message);
        }

        prompt();
      });
    };

    prompt();
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  if (global.tester) {
    global.tester.printStats();
  }
  process.exit(0);
});

// Run CLI
if (require.main === module) {
  program.parse();
}

module.exports = WebhookTester;