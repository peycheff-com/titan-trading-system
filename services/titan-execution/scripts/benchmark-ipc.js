/**
 * IPC Performance Benchmark Script
 * 
 * Measures Fast Path IPC latency by sending 1000 PREPARE signals
 * and calculating statistics (avg, min, max, P95, P99).
 * 
 * Requirements: 5.1-5.7
 * 
 * Usage:
 *   node scripts/benchmark-ipc.js
 * 
 * Environment Variables:
 *   IPC_SOCKET_PATH - Path to IPC socket (default: /tmp/titan-ipc.sock)
 *   HMAC_SECRET - HMAC secret for signing messages
 *   ITERATIONS - Number of iterations (default: 1000)
 */

import net from 'net';
import crypto from 'crypto';
import fs from 'fs';

const SOCKET_PATH = process.env.IPC_SOCKET_PATH || '/tmp/titan-ipc.sock';
const HMAC_SECRET = process.env.HMAC_SECRET || process.env.TITAN_HMAC_SECRET;
const ITERATIONS = parseInt(process.env.ITERATIONS || '1000');

if (!HMAC_SECRET) {
  console.error('❌ HMAC_SECRET environment variable not set');
  process.exit(1);
}

/**
 * Property 1: PREPARE Signal Transmission
 * For any trap detection event, sending a PREPARE signal via Fast Path IPC should always succeed or return an error
 */
async function benchmarkIPC() {
  console.log(`\n🚀 Starting IPC Latency Benchmark`);
  console.log(`   Socket: ${SOCKET_PATH}`);
  console.log(`   Iterations: ${ITERATIONS}`);
  console.log(`   Target: < 0.1ms average\n`);

  const latencies = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < ITERATIONS; i++) {
    const signal = createTestSignal(i);
    
    try {
      const latencyMs = await measureIPCLatency(signal);
      latencies.push(latencyMs);
      successCount++;
      
      // Progress indicator
      if ((i + 1) % 100 === 0) {
        process.stdout.write(`\r   Progress: ${i + 1}/${ITERATIONS} (${((i + 1) / ITERATIONS * 100).toFixed(1)}%)`);
      }
    } catch (error) {
      errorCount++;
      console.error(`\n   ❌ Error on iteration ${i}: ${error.message}`);
    }
  }

  console.log(`\n\n✅ Benchmark Complete`);
  console.log(`   Success: ${successCount}/${ITERATIONS}`);
  console.log(`   Errors: ${errorCount}/${ITERATIONS}`);

  if (latencies.length === 0) {
    console.error('\n❌ No successful measurements');
    process.exit(1);
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  
  const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  console.log(`\n📊 IPC Latency Statistics:`);
  console.log(`   Average:  ${avg.toFixed(4)}ms`);
  console.log(`   Min:      ${min.toFixed(4)}ms`);
  console.log(`   Max:      ${max.toFixed(4)}ms`);
  console.log(`   P50:      ${p50.toFixed(4)}ms`);
  console.log(`   P95:      ${p95.toFixed(4)}ms`);
  console.log(`   P99:      ${p99.toFixed(4)}ms`);

  // Property 3: Average Fast Path IPC latency should be < 0.1ms
  if (avg > 0.1) {
    console.warn(`\n⚠️  Average latency (${avg.toFixed(4)}ms) exceeds target (0.1ms)`);
    console.warn(`   Consider optimizing IPC communication`);
  } else {
    console.log(`\n✅ Latency target met (< 0.1ms)`);
  }

  // Generate performance report
  generateReport({
    iterations: ITERATIONS,
    successCount,
    errorCount,
    latencies: {
      avg,
      min,
      max,
      p50,
      p95,
      p99
    },
    timestamp: new Date().toISOString()
  });
}

/**
 * Measure IPC latency for a single PREPARE signal
 */
async function measureIPCLatency(signal) {
  return new Promise((resolve, reject) => {
    const startTime = process.hrtime.bigint();
    
    const socket = net.connect(SOCKET_PATH, () => {
      const message = {
        signal: { ...signal, signal_type: 'PREPARE' },
        signature: signMessage(signal, HMAC_SECRET)
      };
      
      socket.write(JSON.stringify(message) + '\n');
      
      socket.once('data', (data) => {
        const endTime = process.hrtime.bigint();
        const latencyNs = Number(endTime - startTime);
        const latencyMs = latencyNs / 1_000_000;
        
        socket.end();
        resolve(latencyMs);
      });
      
      socket.on('error', (error) => {
        socket.end();
        reject(error);
      });
    });
    
    socket.on('error', reject);
    
    // Timeout after 5 seconds
    setTimeout(() => {
      socket.end();
      reject(new Error('IPC timeout'));
    }, 5000);
  });
}

/**
 * Create test signal for benchmarking
 */
function createTestSignal(iteration) {
  return {
    signal_id: `bench_${Date.now()}_${iteration}`,
    source: 'scavenger',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entry_zone: { min: 50000, max: 50100 },
    stop_loss: 49500,
    take_profits: [51500],
    confidence: 90,
    leverage: 20,
    velocity: 0.002,
    trap_type: 'LIQUIDATION',
    timestamp: Date.now()
  };
}

/**
 * Sign message with HMAC-SHA256
 */
function signMessage(message, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(message))
    .digest('hex');
}

/**
 * Property 7: Generate performance report
 */
function generateReport(data) {
  const report = {
    benchmark: 'IPC Latency',
    timestamp: data.timestamp,
    iterations: data.iterations,
    success_rate: (data.successCount / data.iterations * 100).toFixed(2) + '%',
    latency_ms: {
      average: data.latencies.avg.toFixed(4),
      min: data.latencies.min.toFixed(4),
      max: data.latencies.max.toFixed(4),
      p50: data.latencies.p50.toFixed(4),
      p95: data.latencies.p95.toFixed(4),
      p99: data.latencies.p99.toFixed(4)
    },
    target_met: data.latencies.avg <= 0.1,
    errors: data.errorCount
  };

  const reportPath = `./benchmark-report-${Date.now()}.json`;
  
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Performance report saved to: ${reportPath}`);
  } catch (error) {
    console.error(`\n❌ Failed to save report: ${error.message}`);
  }
}

// Run benchmark
benchmarkIPC().catch((error) => {
  console.error(`\n❌ Benchmark failed: ${error.message}`);
  process.exit(1);
});
