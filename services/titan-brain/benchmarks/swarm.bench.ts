/**
 * Swarm Benchmarks
 *
 * Performance benchmarks for SwarmOrchestrator and SwarmChangePointIntegration.
 * Run with: npx ts-node benchmarks/swarm.bench.ts
 *
 * @module titan-brain/benchmarks
 */

import { performance } from "perf_hooks";
import {
    type MarketAnalysisTask,
    SwarmChangePointIntegration,
    SwarmOrchestrator,
} from "../src/services/swarm/index.js";

// ============================================================================
// Types
// ============================================================================

interface BenchmarkResult {
    name: string;
    iterations: number;
    totalMs: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    opsPerSec: number;
}

// ============================================================================
// Benchmark Runner
// ============================================================================

async function runBenchmark(
    name: string,
    fn: () => Promise<void>,
    iterations: number = 100,
): Promise<BenchmarkResult> {
    const times: number[] = [];

    // Warmup
    for (let i = 0; i < 5; i++) {
        await fn();
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fn();
        const end = performance.now();
        times.push(end - start);
    }

    const totalMs = times.reduce((a, b) => a + b, 0);
    const avgMs = totalMs / iterations;
    const minMs = Math.min(...times);
    const maxMs = Math.max(...times);
    const opsPerSec = 1000 / avgMs;

    return {
        name,
        iterations,
        totalMs,
        avgMs,
        minMs,
        maxMs,
        opsPerSec,
    };
}

function printResult(result: BenchmarkResult): void {
    console.log(`\n📊 ${result.name}`);
    console.log(`   Iterations: ${result.iterations}`);
    console.log(`   Average:    ${result.avgMs.toFixed(3)}ms`);
    console.log(`   Min:        ${result.minMs.toFixed(3)}ms`);
    console.log(`   Max:        ${result.maxMs.toFixed(3)}ms`);
    console.log(`   Ops/sec:    ${result.opsPerSec.toFixed(2)}`);
}

// ============================================================================
// Benchmarks
// ============================================================================

async function benchmarkChangePointIntegration(): Promise<BenchmarkResult> {
    const integration = new SwarmChangePointIntegration({
        enableSwarmEnhancement: false, // Pure statistical for benchmark
    });

    let price = 50000;

    return runBenchmark(
        "SwarmChangePointIntegration.update (statistical only)",
        async () => {
            // Simulate price movement
            price *= 1 + (Math.random() - 0.5) * 0.001;
            await integration.update("BTCUSDT", price, Date.now());
        },
        1000,
    );
}

async function benchmarkMultiAssetAnalysisPrepare(): Promise<BenchmarkResult> {
    const orchestrator = new SwarmOrchestrator({
        fallbackToSimple: false, // Don't actually call AI
    });

    const tasks: MarketAnalysisTask[] = [
        { symbol: "BTCUSDT", timeframe: "1h", analysisType: "full" },
        { symbol: "ETHUSDT", timeframe: "1h", analysisType: "technical" },
        { symbol: "SOLUSDT", timeframe: "4h", analysisType: "sentiment" },
    ];

    return runBenchmark(
        "SwarmOrchestrator task preparation (no AI call)",
        async () => {
            // Just measure task preparation overhead
            // (can't actually call AI in benchmark without API)
            orchestrator.getStatus();
            tasks.forEach((t) => {
                // Simulate task preparation
                JSON.stringify(t);
            });
        },
        5000,
    );
}

async function benchmarkSwarmResultParsing(): Promise<BenchmarkResult> {
    const mockResponse = {
        orchestratorSummary: JSON.stringify({
            technicalScore: 75,
            sentimentScore: 60,
            regimeState: "trending",
            signals: [
                {
                    type: "entry",
                    direction: "long",
                    strength: 0.8,
                    trigger: "RSI oversold",
                },
            ],
            confidence: 0.85,
            reasoning: "Strong uptrend with momentum confirmation",
        }),
        subAgentResults: [],
        totalTokensUsed: 1500,
    };

    return runBenchmark(
        "Swarm response JSON parsing",
        async () => {
            const jsonMatch = mockResponse.orchestratorSummary.match(
                /\{[\s\S]*\}/,
            );
            if (jsonMatch) {
                JSON.parse(jsonMatch[0]);
            }
        },
        10000,
    );
}

async function benchmarkConsensusCalculation(): Promise<BenchmarkResult> {
    const integration = new SwarmChangePointIntegration({
        enableSwarmEnhancement: false,
        aiWeight: 0.3,
    });

    // Prime the detector
    let price = 50000;
    for (let i = 0; i < 100; i++) {
        price *= 1 + (Math.random() - 0.5) * 0.002;
        await integration.update("BTCUSDT", price, Date.now());
    }

    return runBenchmark(
        "Regime consensus calculation",
        async () => {
            price *= 1 + (Math.random() - 0.5) * 0.001;
            const result = await integration.update(
                "BTCUSDT",
                price,
                Date.now(),
            );
            // Access consensus to ensure it's computed
            void result.consensus;
            void result.consensusWeight;
        },
        1000,
    );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
    console.log("=".repeat(60));
    console.log("🚀 Titan Swarm Benchmarks");
    console.log("=".repeat(60));

    const results: BenchmarkResult[] = [];

    try {
        results.push(await benchmarkChangePointIntegration());
        printResult(results[results.length - 1]);

        results.push(await benchmarkMultiAssetAnalysisPrepare());
        printResult(results[results.length - 1]);

        results.push(await benchmarkSwarmResultParsing());
        printResult(results[results.length - 1]);

        results.push(await benchmarkConsensusCalculation());
        printResult(results[results.length - 1]);

        console.log("\n" + "=".repeat(60));
        console.log("📋 Summary");
        console.log("=".repeat(60));

        console.log("\n| Benchmark | Avg (ms) | Ops/sec |");
        console.log("|-----------|----------|---------|");
        for (const r of results) {
            console.log(
                `| ${r.name.substring(0, 40).padEnd(40)} | ${
                    r.avgMs.toFixed(3).padStart(8)
                } | ${r.opsPerSec.toFixed(0).padStart(7)} |`,
            );
        }
    } catch (error) {
        console.error("Benchmark failed:", error);
        process.exit(1);
    }
}

main().catch(console.error);
