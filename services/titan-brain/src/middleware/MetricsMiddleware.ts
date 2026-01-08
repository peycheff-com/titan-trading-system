/**
 * MetricsMiddleware - Fastify middleware for automatic metrics collection
 *
 * Provides automatic HTTP request metrics collection for all routes
 * with minimal performance overhead and comprehensive coverage.
 *
 * Requirements: 4.2.1, 4.2.2, 4.2.3, 4.2.4, 4.2.5
 */

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import { MetricsCollector } from "../metrics/MetricsCollector.js";
import { Logger } from "../logging/Logger.js";

/**
 * Metric actions
 */
export enum Action {
  HTTP_REQUEST = "http_request",
  SIGNAL_RECEIVED = "signal_received",
  HEALTH_CHECK = "health_check",
  CACHE_OPERATION = "cache_operation",
  DB_QUERY = "db_query",
}

/**
 * Metrics middleware configuration
 */
export interface MetricsMiddlewareConfig {
  enableRequestMetrics: boolean;
  enableResponseSizeMetrics: boolean;
  enableRouteLabels: boolean;
  excludePaths: string[];
  normalizeRoutes: boolean;
  maxRouteLabels: number;
}

/**
 * Request timing information
 */
interface RequestTiming {
  startTime: number;
  correlationId?: string;
}

/**
 * Metrics middleware for Fastify
 */
export class MetricsMiddleware {
  private metricsCollector: MetricsCollector;
  private logger: Logger;
  private config: MetricsMiddlewareConfig;
  private requestTimings: Map<string, RequestTiming> = new Map();

  constructor(
    metricsCollector: MetricsCollector,
    logger: Logger,
    config: Partial<MetricsMiddlewareConfig> = {},
  ) {
    this.metricsCollector = metricsCollector;
    this.logger = logger;
    this.config = {
      enableRequestMetrics: true,
      enableResponseSizeMetrics: true,
      enableRouteLabels: true,
      excludePaths: ["/metrics", "/health"],
      normalizeRoutes: true,
      maxRouteLabels: 100,
      ...config,
    };
  }

  /**
   * Create metrics middleware from environment variables
   */
  static createFromEnvironment(
    metricsCollector: MetricsCollector,
    logger: Logger,
  ): MetricsMiddleware {
    const config: Partial<MetricsMiddlewareConfig> = {
      enableRequestMetrics: process.env.METRICS_ENABLE_REQUESTS !== "false",
      enableResponseSizeMetrics:
        process.env.METRICS_ENABLE_RESPONSE_SIZE !== "false",
      enableRouteLabels: process.env.METRICS_ENABLE_ROUTE_LABELS !== "false",
      excludePaths: (process.env.METRICS_EXCLUDE_PATHS || "/metrics,/health")
        .split(","),
      normalizeRoutes: process.env.METRICS_NORMALIZE_ROUTES !== "false",
      maxRouteLabels: parseInt(process.env.METRICS_MAX_ROUTE_LABELS || "100"),
    };

    return new MetricsMiddleware(metricsCollector, logger, config);
  }

  /**
   * Get request start hook (onRequest)
   */
  getRequestStartHook() {
    return (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) => {
      if (!this.shouldCollectMetrics(request)) {
        return done();
      }

      const requestId = this.getRequestId(request);
      const timing: RequestTiming = {
        startTime: Date.now(),
        correlationId: request.headers["x-correlation-id"] as string,
      };

      this.requestTimings.set(requestId, timing);

      if (this.config.enableRequestMetrics) {
        this.metricsCollector.recordHttpRequestStart();
      }

      done();
    };
  }

  /**
   * Get response hook (onResponse)
   */
  getResponseHook() {
    return (
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction,
    ) => {
      if (!this.shouldCollectMetrics(request)) {
        return done();
      }

      const requestId = this.getRequestId(request);
      const timing = this.requestTimings.get(requestId);

      if (timing && this.config.enableRequestMetrics) {
        const duration = (Date.now() - timing.startTime) / 1000; // Convert to seconds
        const method = request.method;
        const route = this.normalizeRoute(request.url);
        const statusCode = reply.statusCode;
        const responseSize = this.getResponseSize(reply);

        // Record HTTP request metrics
        this.metricsCollector.recordHttpRequest(
          method,
          route,
          statusCode,
          duration,
          responseSize,
        );

        // Record request end (decrement in-flight counter)
        this.metricsCollector.recordHttpRequestEnd();

        // Clean up timing data
        this.requestTimings.delete(requestId);

        this.logger.debug(
          "HTTP request metrics recorded",
          timing.correlationId,
          {
            method,
            route,
            statusCode,
            duration,
            responseSize,
          },
        );
      }

      done();
    };
  }

  /**
   * Get error hook (onError)
   */
  getErrorHook() {
    return (
      request: FastifyRequest,
      reply: FastifyReply,
      error: Error,
      done: HookHandlerDoneFunction,
    ) => {
      if (!this.shouldCollectMetrics(request)) {
        return done();
      }

      // Record error metric
      this.metricsCollector.recordError("http_error", "fastify");

      // Still record the HTTP request metrics for error responses
      const requestId = this.getRequestId(request);
      const timing = this.requestTimings.get(requestId);

      if (timing && this.config.enableRequestMetrics) {
        const duration = (Date.now() - timing.startTime) / 1000;
        const method = request.method;
        const route = this.normalizeRoute(request.url);
        const statusCode = reply.statusCode || 500;
        const responseSize = 0; // Error responses typically have no body

        this.metricsCollector.recordHttpRequest(
          method,
          route,
          statusCode,
          duration,
          responseSize,
        );

        this.metricsCollector.recordHttpRequestEnd();
        this.requestTimings.delete(requestId);
      }

      done();
    };
  }

  /**
   * Check if metrics should be collected for this request
   */
  private shouldCollectMetrics(request: FastifyRequest): boolean {
    const path = request.url.split("?")[0]; // Remove query parameters
    return !this.config.excludePaths.includes(path);
  }

  /**
   * Get unique request ID for timing tracking
   */
  private getRequestId(request: FastifyRequest): string {
    // Use correlation ID if available, otherwise use a combination of timestamp and random
    const correlationId = request.headers["x-correlation-id"] as string;
    if (correlationId) {
      return correlationId;
    }

    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Normalize route for consistent labeling
   */
  private normalizeRoute(url: string): string {
    if (!this.config.normalizeRoutes) {
      return url.split("?")[0]; // Just remove query parameters
    }

    let route = url.split("?")[0]; // Remove query parameters

    // Replace common ID patterns with placeholders
    route = route.replace(/\/\d+/g, "/:id"); // Replace numeric IDs
    route = route.replace(
      /\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
      "/:uuid",
    ); // Replace UUIDs
    route = route.replace(/\/[a-f0-9]{24}/g, "/:objectid"); // Replace MongoDB ObjectIds
    route = route.replace(/\/[a-zA-Z0-9_-]{20,}/g, "/:token"); // Replace long tokens

    // Limit route complexity to prevent label explosion
    const segments = route.split("/");
    if (segments.length > 6) {
      route = segments.slice(0, 6).join("/") + "/...";
    }

    return route || "/";
  }

  /**
   * Get response size from reply
   */
  private getResponseSize(reply: FastifyReply): number {
    if (!this.config.enableResponseSizeMetrics) {
      return 0;
    }

    // Try to get content-length header
    const contentLength = reply.getHeader("content-length");
    if (contentLength) {
      return parseInt(contentLength.toString(), 10) || 0;
    }

    // Fallback: estimate from payload if available
    const payload = (reply as any).payload;
    if (payload) {
      if (typeof payload === "string") {
        return Buffer.byteLength(payload, "utf8");
      }
      if (Buffer.isBuffer(payload)) {
        return payload.length;
      }
      if (typeof payload === "object") {
        return Buffer.byteLength(JSON.stringify(payload), "utf8");
      }
    }

    return 0;
  }

  /**
   * Get middleware configuration
   */
  getConfig(): MetricsMiddlewareConfig {
    return { ...this.config };
  }

  /**
   * Get current request timings count (for monitoring)
   */
  getActiveRequestsCount(): number {
    return this.requestTimings.size;
  }

  /**
   * Clean up old request timings (prevent memory leaks)
   */
  cleanupOldTimings(maxAgeMs: number = 300000): void { // 5 minutes default
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const [requestId, timing] of this.requestTimings.entries()) {
      if (timing.startTime < cutoff) {
        this.requestTimings.delete(requestId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.warn("Cleaned up old request timings", undefined, {
        cleaned,
        remaining: this.requestTimings.size,
      });
    }
  }

  /**
   * Start periodic cleanup of old timings
   */
  startPeriodicCleanup(intervalMs: number = 60000): NodeJS.Timeout { // 1 minute default
    return setInterval(() => {
      this.cleanupOldTimings();
    }, intervalMs);
  }
}
