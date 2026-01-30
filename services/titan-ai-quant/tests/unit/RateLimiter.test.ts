/**
 * Unit tests for RateLimiter
 */

import { RateLimiter } from "../../src/ai/RateLimiter";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxRequestsPerMinute: 10,
      windowMs: 60000,
    });
  });

  afterEach(() => {
    rateLimiter.reset();
  });

  describe("canMakeRequest", () => {
    it("should allow requests when under limit", () => {
      expect(rateLimiter.canMakeRequest()).toBe(true);
    });

    it("should block requests when at limit", async () => {
      // Fill up the rate limiter
      for (let i = 0; i < 10; i++) {
        await rateLimiter.acquire();
      }
      expect(rateLimiter.canMakeRequest()).toBe(false);
    });
  });

  describe("getCurrentRequestCount", () => {
    it("should return 0 initially", () => {
      expect(rateLimiter.getCurrentRequestCount()).toBe(0);
    });

    it("should increment after acquire", async () => {
      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentRequestCount()).toBe(1);
    });

    it("should track multiple requests", async () => {
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentRequestCount()).toBe(3);
    });
  });

  describe("acquire", () => {
    it("should acquire slot immediately when available", async () => {
      const start = Date.now();
      await rateLimiter.acquire();
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it("should increment request count", async () => {
      expect(rateLimiter.getCurrentRequestCount()).toBe(0);
      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentRequestCount()).toBe(1);
    });
  });

  describe("release", () => {
    it("should free up a slot", async () => {
      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentRequestCount()).toBe(1);
      rateLimiter.release();
      expect(rateLimiter.getCurrentRequestCount()).toBe(0);
    });
  });

  describe("execute", () => {
    it("should execute function with rate limiting", async () => {
      const result = await rateLimiter.execute(async () => "success");
      expect(result).toBe("success");
      expect(rateLimiter.getCurrentRequestCount()).toBe(1);
    });

    it("should propagate errors", async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new Error("test error");
        }),
      ).rejects.toThrow("test error");
    });
  });

  describe("getTimeUntilNextSlot", () => {
    it("should return 0 when slots available", () => {
      expect(rateLimiter.getTimeUntilNextSlot()).toBe(0);
    });
  });

  describe("reset", () => {
    it("should clear all state", async () => {
      await rateLimiter.acquire();
      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentRequestCount()).toBe(2);

      rateLimiter.reset();
      expect(rateLimiter.getCurrentRequestCount()).toBe(0);
      expect(rateLimiter.canMakeRequest()).toBe(true);
    });
  });

  describe("execute with 429 error", () => {
    it("should release slot on 429 error", async () => {
      await expect(
        rateLimiter.execute(async () => {
          throw new Error("429 Too Many Requests");
        }),
      ).rejects.toThrow("429");
      // Slot should be released after 429 error
      expect(rateLimiter.getCurrentRequestCount()).toBe(0);
    });

    it("should not release slot on non-429 error", async () => {
      await rateLimiter.execute(async () => "success");
      await expect(
        rateLimiter.execute(async () => {
          throw new Error("500 Server Error");
        }),
      ).rejects.toThrow("500");
      // Slot should NOT be released for non-429 errors
      expect(rateLimiter.getCurrentRequestCount()).toBe(2);
    });
  });

  describe("getTimeUntilNextSlot at capacity", () => {
    it("should return positive time when at capacity", async () => {
      // Fill up the rate limiter
      for (let i = 0; i < 10; i++) {
        await rateLimiter.acquire();
      }
      const waitTime = rateLimiter.getTimeUntilNextSlot();
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(60000);
    });
  });
});
