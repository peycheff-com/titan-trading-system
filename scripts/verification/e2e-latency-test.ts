#!/usr/bin/env node
/**
 * End-to-End Latency Test
 *
 * Measures round-trip latency through the entire Titan system:
 * Signal Generation -> IPC -> Execution Engine -> Order Execution
 *
 * Usage:
 *   node scripts/verification/e2e-latency-test.js
 *
 * Environment Variables:
 *   TITAN_IPC_SOCKET     - Path to IPC socket (default: /tmp/titan-ipc.sock)
 *   TITAN_HMAC_SECRET    - HMAC secret for signing (default: titan-hmac-secret)
 *   NATS_URL             - NATS server URL (default: nats://localhost:4222)
 *   TEST_ITERATIONS      - Number of test iterations (default: 100)
 */

import { FastPathClient } from "@titan/shared";

// Configuration
const config = {
    socketPath: process.env.TITAN_IPC_SOCKET || "/tmp/titan-ipc.sock",
    hmacSecret: process.env.TITAN_HMAC_SECRET || "titan-hmac-secret",
    iterations: parseInt(process.env.TEST_ITERATIONS || "100", 10),
};

interface LatencyResult {
    iteration: number;
    prepareLatencyMs: number;
    confirmLatencyMs: number;
    totalLatencyMs: number;
    success: boolean;
    error?: string;
}

/**
 * Run a single latency test iteration
 */
async function runIteration(
    client: FastPathClient,
    iteration: number,
): Promise<LatencyResult> {
    const signalId = `e2e-test-${Date.now()}-${iteration}`;
    const startTime = process.hrtime.bigint();

    const signal = {
        signal_id: signalId,
        source: "brain" as const,
        symbol: "BTCUSDT",
        direction: "LONG" as const,
        entry_zone: { min: 50000, max: 50100 },
        stop_loss: 49500,
        take_profits: [50500, 51000],
        confidence: 0.85,
        leverage: 1,
        timestamp: Date.now(),
    };

    try {
        // PREPARE phase
        const prepareStart = process.hrtime.bigint();
        const prepareResult = await client.sendPrepare(signal);
        const prepareEnd = process.hrtime.bigint();
        const prepareLatencyMs = Number(prepareEnd - prepareStart) / 1e6;

        if (!prepareResult.prepared) {
            return {
                iteration,
                prepareLatencyMs,
                confirmLatencyMs: 0,
                totalLatencyMs: prepareLatencyMs,
                success: false,
                error: prepareResult.reason || "PREPARE rejected",
            };
        }

        // CONFIRM phase
        const confirmStart = process.hrtime.bigint();
        const confirmResult = await client.sendConfirm(signalId);
        const confirmEnd = process.hrtime.bigint();
        const confirmLatencyMs = Number(confirmEnd - confirmStart) / 1e6;

        const totalLatencyMs = Number(confirmEnd - startTime) / 1e6;

        return {
            iteration,
            prepareLatencyMs,
            confirmLatencyMs,
            totalLatencyMs,
            success: confirmResult.executed || false,
            error: confirmResult.executed ? undefined : confirmResult.reason,
        };
    } catch (error) {
        const endTime = process.hrtime.bigint();
        return {
            iteration,
            prepareLatencyMs: 0,
            confirmLatencyMs: 0,
            totalLatencyMs: Number(endTime - startTime) / 1e6,
            success: false,
            error: (error as Error).message,
        };
    }
}

/**
 * Calculate statistics from results
 */
function calculateStats(results: LatencyResult[]) {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length === 0) {
        return {
            successRate: 0,
            totalLatency: { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 },
            prepareLatency: { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 },
            confirmLatency: { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 },
        };
    }

    const calcPercentile = (arr: number[], p: number) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * p);
        return sorted[Math.min(idx, sorted.length - 1)];
    };

    const calcStats = (values: number[]) => ({
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        p50: calcPercentile(values, 0.5),
        p95: calcPercentile(values, 0.95),
        p99: calcPercentile(values, 0.99),
    });

    return {
        successRate: (successful.length / results.length) * 100,
        failedCount: failed.length,
        totalLatency: calcStats(successful.map((r) => r.totalLatencyMs)),
        prepareLatency: calcStats(successful.map((r) => r.prepareLatencyMs)),
        confirmLatency: calcStats(successful.map((r) => r.confirmLatencyMs)),
    };
}

/**
 * Main test runner
 */
async function main() {
    console.log("🚀 Titan End-to-End Latency Test");
    console.log("================================");
    console.log(`Socket: ${config.socketPath}`);
    console.log(`Iterations: ${config.iterations}`);
    console.log("");

    // Create client
    const client = new FastPathClient({
        source: "brain",
        socketPath: config.socketPath,
        hmacSecret: config.hmacSecret,
    });

    // Connect
    console.log("📡 Connecting to IPC socket...");
    try {
        await client.connect();
        console.log("✅ Connected");
    } catch (error) {
        console.error("❌ Connection failed:", (error as Error).message);
        console.log("");
        console.log("Make sure titan-execution-rs is running:");
        console.log("  cd services/titan-execution-rs && cargo run");
        process.exit(1);
    }

    // Warm-up
    console.log("");
    console.log("🔥 Warming up (10 iterations)...");
    for (let i = 0; i < 10; i++) {
        await runIteration(client, -i);
    }

    // Run test
    console.log("");
    console.log(`📊 Running ${config.iterations} test iterations...`);
    const results: LatencyResult[] = [];

    for (let i = 0; i < config.iterations; i++) {
        const result = await runIteration(client, i);
        results.push(result);

        // Progress indicator
        if ((i + 1) % 10 === 0) {
            process.stdout.write(`  ${i + 1}/${config.iterations}\r`);
        }
    }
    console.log("");

    // Calculate and display stats
    const stats = calculateStats(results);

    console.log("");
    console.log("📈 Results");
    console.log("================================");
    console.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
    console.log("");

    console.log("Total Latency (ms):");
    console.log(`  Avg: ${stats.totalLatency.avg.toFixed(3)}`);
    console.log(`  Min: ${stats.totalLatency.min.toFixed(3)}`);
    console.log(`  Max: ${stats.totalLatency.max.toFixed(3)}`);
    console.log(`  P50: ${stats.totalLatency.p50.toFixed(3)}`);
    console.log(`  P95: ${stats.totalLatency.p95.toFixed(3)}`);
    console.log(`  P99: ${stats.totalLatency.p99.toFixed(3)}`);
    console.log("");

    console.log("PREPARE Latency (ms):");
    console.log(`  Avg: ${stats.prepareLatency.avg.toFixed(3)}`);
    console.log(`  P99: ${stats.prepareLatency.p99.toFixed(3)}`);
    console.log("");

    console.log("CONFIRM Latency (ms):");
    console.log(`  Avg: ${stats.confirmLatency.avg.toFixed(3)}`);
    console.log(`  P99: ${stats.confirmLatency.p99.toFixed(3)}`);
    console.log("");

    // Pass/Fail criteria
    const targetP99 = 1.0; // 1ms target
    const passed = stats.totalLatency.p99 < targetP99;

    if (passed) {
        console.log(
            `✅ PASSED: P99 latency (${
                stats.totalLatency.p99.toFixed(3)
            }ms) < ${targetP99}ms target`,
        );
    } else {
        console.log(
            `❌ FAILED: P99 latency (${
                stats.totalLatency.p99.toFixed(3)
            }ms) > ${targetP99}ms target`,
        );
    }

    // Cleanup
    await client.disconnect();

    process.exit(passed ? 0 : 1);
}

main().catch(console.error);
