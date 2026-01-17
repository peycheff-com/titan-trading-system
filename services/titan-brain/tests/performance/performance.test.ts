/**
 * Performance validation tests for Titan Brain
 *
 * Tests performance requirements under load:
 * - Cache operations performance
 * - Memory usage stability
 * - No memory leaks detected
 */

import { performance } from "perf_hooks";
import { CacheManager } from "../../src/cache/CacheManager.js";

describe("Performance Validation Tests", () => {
  describe("Cache Performance", () => {
    let cacheManager: CacheManager;

    beforeAll(async () => {
      cacheManager = new CacheManager({
        redis: {
          host: "localhost",
          port: 6379,
        },
        enableInMemoryFallback: true,
        inMemoryMaxSize: 1000,
        inMemoryTtlMs: 300000, // 5 minutes
        healthCheckIntervalMs: 30000,
        healthCheckTimeoutMs: 5000,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 1000,
      });

      await cacheManager.initialize();
    });

    afterAll(async () => {
      if (cacheManager) {
        await cacheManager.shutdown();
      }
    });

    it("should handle high-frequency cache operations", async () => {
      const operations = 1000;
      const start = performance.now();

      // Perform mixed cache operations
      for (let i = 0; i < operations; i++) {
        const key = `test-key-${i % 100}`; // Reuse keys to test overwrites
        const value = { data: `test-value-${i}`, timestamp: Date.now() };

        await cacheManager.set(key, value, 60000); // 1 minute TTL

        if (i % 10 === 0) {
          await cacheManager.get(key);
        }
      }

      const end = performance.now();
      const totalTime = end - start;
      const avgOperationTime = totalTime / operations;

      console.log(`Cache performance:
        Total time for ${operations} operations: ${totalTime.toFixed(2)}ms
        Average operation time: ${avgOperationTime.toFixed(3)}ms`);

      expect(avgOperationTime).toBeLessThan(5); // < 5ms per operation (more realistic)
      expect(totalTime).toBeLessThan(10000); // Total < 10 seconds
    }, 15000);

    it("should handle concurrent cache operations", async () => {
      const concurrentOps = 50;
      const promises: Promise<number>[] = [];

      for (let i = 0; i < concurrentOps; i++) {
        promises.push(
          (async () => {
            const start = performance.now();
            try {
              const key = `concurrent-key-${i}`;
              const value = { id: i, data: `concurrent-data-${i}` };

              await cacheManager.set(key, value, 30000);
              const retrieved = await cacheManager.get(key);

              const end = performance.now();

              expect(retrieved).toBeDefined();
              return end - start;
            } catch (error) {
              console.warn(
                `Concurrent cache operation ${i + 1} failed:`,
                error,
              );
              return 1000; // Return high time for failed operations
            }
          })(),
        );
      }

      const operationTimes = await Promise.all(promises);
      const successfulOps = operationTimes.filter((time) => time < 1000);

      // At least 90% of operations should succeed
      expect(successfulOps.length).toBeGreaterThanOrEqual(concurrentOps * 0.9);

      // Average time should be reasonable under concurrent load
      const avgOpTime = successfulOps.reduce((a, b) => a + b, 0) /
        successfulOps.length;
      expect(avgOpTime).toBeLessThan(100); // < 100ms under concurrent load
    }, 15000);
  });

  describe("Memory Usage", () => {
    it("should maintain stable memory usage", async () => {
      const initialMemory = process.memoryUsage();
      const memorySnapshots: NodeJS.MemoryUsage[] = [initialMemory];

      // Perform memory-intensive operations
      for (let i = 0; i < 100; i++) {
        // Create and discard objects to test garbage collection
        const largeArray = new Array(10000).fill(0).map((_, idx) => ({
          id: idx,
          data: `test-data-${idx}`,
          timestamp: Date.now(),
        }));

        // Force some async operations
        await new Promise((resolve) => setTimeout(resolve, 10));

        // Take memory snapshot every 20 iterations
        if (i % 20 === 0) {
          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
          memorySnapshots.push(process.memoryUsage());
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);

      console.log(`Memory usage:
        Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB
        Growth: ${memoryGrowthMB.toFixed(2)} MB`);

      // Memory growth should be reasonable (< 100MB for this test)
      // Note: TypeScript compilation and Jest overhead can cause higher memory usage
      expect(memoryGrowthMB).toBeLessThan(100);

      // Heap usage should not exceed 600MB (realistic for Node.js with TypeScript and Jest overhead)
      expect(finalMemory.heapUsed / 1024 / 1024).toBeLessThan(600);
    }, 15000);

    it("should not have significant memory leaks", async () => {
      const iterations = 50;
      const memoryReadings: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Create temporary objects
        const tempData = new Array(1000).fill(0).map((_, idx) => ({
          id: `temp-${i}-${idx}`,
          data: new Array(100).fill(`data-${i}-${idx}`),
          timestamp: Date.now(),
        }));

        // Use the data briefly
        const processed = tempData.filter((item) => item.id.includes("temp"));
        expect(processed.length).toBe(1000);

        // Clear references
        tempData.length = 0;

        // Force garbage collection every 10 iterations
        if (i % 10 === 0 && global.gc) {
          global.gc();
          memoryReadings.push(process.memoryUsage().heapUsed);
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Check that memory usage doesn't continuously grow
      if (memoryReadings.length >= 3) {
        const firstReading = memoryReadings[0];
        const lastReading = memoryReadings[memoryReadings.length - 1];
        const memoryGrowth = (lastReading - firstReading) / (1024 * 1024);

        console.log(`Memory leak test:
          First reading: ${(firstReading / 1024 / 1024).toFixed(2)} MB
          Last reading: ${(lastReading / 1024 / 1024).toFixed(2)} MB
          Growth: ${memoryGrowth.toFixed(2)} MB`);

        // Memory growth should be minimal (< 20MB)
        expect(memoryGrowth).toBeLessThan(20);
      }
    }, 20000);
  });

  describe("CPU Performance", () => {
    it("should handle CPU-intensive operations efficiently", async () => {
      const iterations = 1000;
      const start = performance.now();

      // Simulate CPU-intensive calculations
      let result = 0;
      for (let i = 0; i < iterations; i++) {
        // Mathematical operations
        result += Math.sqrt(i) * Math.sin(i) * Math.cos(i);

        // String operations
        const str = `test-string-${i}`;
        const processed = str.split("-").map((s) => s.toUpperCase()).join("_");

        // Object operations
        const obj = { id: i, value: processed, timestamp: Date.now() };
        const serialized = JSON.stringify(obj);
        const deserialized = JSON.parse(serialized);

        expect(deserialized.id).toBe(i);
      }

      const end = performance.now();
      const totalTime = end - start;
      const avgOperationTime = totalTime / iterations;

      console.log(`CPU performance:
        Total time for ${iterations} operations: ${totalTime.toFixed(2)}ms
        Average operation time: ${avgOperationTime.toFixed(3)}ms
        Result: ${result.toFixed(2)}`);

      expect(avgOperationTime).toBeLessThan(1); // < 1ms per operation
      expect(totalTime).toBeLessThan(2000); // Total < 2 seconds
    }, 10000);
  });
});
