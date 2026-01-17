/**
 * ServiceClient - Robust HTTP client for inter-service communication
 *
 * Provides a robust HTTP client with automatic retries, exponential backoff,
 * circuit breaker pattern, request/response logging, and Railway service URL support.
 *
 * Requirements: 2.1.1, 2.1.2, 2.1.3, 2.1.4, 2.1.5
 */

import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerDefaults } from './CircuitBreaker.js';
import { Logger } from '../logging/Logger.js';

/**
 * HTTP methods supported by ServiceClient
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Request configuration
 */
export interface RequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  correlationId?: string;
}

/**
 * Response object
 */
export interface ServiceResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  duration: number;
  correlationId?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
  retryableErrors: string[];
}

/**
 * Service client configuration
 */
export interface ServiceClientConfig {
  baseUrl?: string;
  defaultTimeout: number;
  defaultHeaders: Record<string, string>;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  logRequests: boolean;
  logResponses: boolean;
  maxResponseBodyLogSize: number;
}

/**
 * Request/Response interceptor functions
 */
export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor<T = any> = (
  response: ServiceResponse<T>,
) => ServiceResponse<T> | Promise<ServiceResponse<T>>;
export type ErrorInterceptor = (
  error: ServiceClientError,
) => ServiceClientError | Promise<ServiceClientError>;

/**
 * Service client error
 */
export class ServiceClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly response?: ServiceResponse,
    public readonly config?: RequestConfig,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ServiceClientError';
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    // Network errors are retryable
    if (!this.status) return true;

    // 5xx server errors are retryable
    if (this.status >= 500) return true;

    // 429 rate limit is retryable
    if (this.status === 429) return true;

    // 408 request timeout is retryable
    if (this.status === 408) return true;

    return false;
  }

  /**
   * Check if error is a timeout
   */
  isTimeout(): boolean {
    return this.message.includes('timeout') || this.status === 408;
  }

  /**
   * Check if error is a network error
   */
  isNetworkError(): boolean {
    return !this.status && this.cause !== undefined;
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'],
};

/**
 * Default service client configuration
 */
const DEFAULT_CONFIG: ServiceClientConfig = {
  defaultTimeout: 10000, // 10 seconds
  defaultHeaders: {
    'Content-Type': 'application/json',
    'User-Agent': 'TitanBrain/1.0.0',
  },
  retry: DEFAULT_RETRY_CONFIG,
  circuitBreaker: CircuitBreakerDefaults.http,
  logRequests: true,
  logResponses: true,
  maxResponseBodyLogSize: 1024, // 1KB
};

/**
 * Service client for robust HTTP communication
 */
export class ServiceClient extends EventEmitter {
  private config: ServiceClientConfig;
  private circuitBreaker: CircuitBreaker;
  private logger: Logger;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(config: Partial<ServiceClientConfig> = {}, logger?: Logger) {
    super();

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? Logger.getInstance('service-client');

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({ ...this.config.circuitBreaker }, this.logger);

    // Forward circuit breaker events
    this.circuitBreaker.on('stateChange', (event) => {
      this.emit('circuitBreakerStateChange', event);
    });

    this.logger.info('Service client initialized', undefined, {
      baseUrl: this.config.baseUrl,
      defaultTimeout: this.config.defaultTimeout,
      maxRetries: this.config.retry.maxRetries,
      circuitBreakerName: this.config.circuitBreaker.name,
    });
  }

  /**
   * Make an HTTP request
   */
  async request<T = any>(config: RequestConfig): Promise<ServiceResponse<T>> {
    // Apply request interceptors
    let processedConfig = config;
    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
    }

    // Add default configuration
    const finalConfig: RequestConfig = {
      timeout: this.config.defaultTimeout,
      retries: this.config.retry.maxRetries,
      retryDelay: this.config.retry.initialDelay,
      ...processedConfig,
      headers: {
        ...this.config.defaultHeaders,
        ...processedConfig.headers,
      },
    };

    // Add correlation ID if not present
    if (!finalConfig.correlationId) {
      finalConfig.correlationId = this.generateCorrelationId();
    }

    // Add correlation ID to headers
    finalConfig.headers!['x-correlation-id'] = finalConfig.correlationId;

    // Build full URL
    const fullUrl = this.buildUrl(finalConfig.url);
    finalConfig.url = fullUrl;

    this.logger.debug('Making HTTP request', finalConfig.correlationId, {
      method: finalConfig.method,
      url: fullUrl,
      timeout: finalConfig.timeout,
      retries: finalConfig.retries,
    });

    try {
      // Execute with circuit breaker protection
      const response = await this.circuitBreaker.execute(async () => {
        return await this.executeWithRetry(finalConfig);
      });

      // Apply response interceptors
      let processedResponse = response;
      for (const interceptor of this.responseInterceptors) {
        processedResponse = (await interceptor(processedResponse)) as ServiceResponse<T>;
      }

      this.emit('response', processedResponse);
      return processedResponse as ServiceResponse<T>;
    } catch (error) {
      let processedError =
        error instanceof ServiceClientError
          ? error
          : new ServiceClientError(
              error instanceof Error ? error.message : String(error),
              undefined,
              undefined,
              finalConfig,
              error instanceof Error ? error : undefined,
            );

      // Apply error interceptors
      for (const interceptor of this.errorInterceptors) {
        processedError = await interceptor(processedError);
      }

      this.emit('error', processedError);
      throw processedError;
    }
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(config: RequestConfig): Promise<ServiceResponse<T>> {
    let lastError: ServiceClientError | undefined;
    const maxRetries = config.retries || 0;

    // Try initial request + retries
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const response = await this.executeRequest<T>(config, attempt);

        if (attempt > 1) {
          this.logger.info('Request succeeded after retry', config.correlationId, {
            attempt,
            url: config.url,
            method: config.method,
          });
        }

        return response;
      } catch (error) {
        lastError =
          error instanceof ServiceClientError
            ? error
            : new ServiceClientError(
                error instanceof Error ? error.message : String(error),
                undefined,
                undefined,
                config,
                error instanceof Error ? error : undefined,
              );

        // Check if we should retry (not on last attempt and error is retryable)
        const isLastAttempt = attempt >= maxRetries + 1;
        if (!isLastAttempt && lastError.isRetryable()) {
          const delay = this.calculateRetryDelay(attempt);

          this.logger.warn('Request failed, retrying', config.correlationId, {
            attempt,
            maxRetries: maxRetries,
            delay,
            error: lastError.message,
            status: lastError.status,
          });

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // No more retries or not retryable
        this.logger.error('Request failed permanently', lastError, config.correlationId, {
          attempt,
          maxRetries: maxRetries,
          url: config.url,
          method: config.method,
        });

        throw lastError;
      }
    }

    throw lastError!;
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    config: RequestConfig,
    attempt: number,
  ): Promise<ServiceResponse<T>> {
    const startTime = Date.now();

    try {
      // Log request
      if (this.config.logRequests) {
        this.logger.debug('HTTP request', config.correlationId, {
          method: config.method,
          url: config.url,
          attempt,
          headers: this.sanitizeHeaders(config.headers || {}),
          bodySize: config.body ? JSON.stringify(config.body).length : 0,
        });
      }

      // Make the actual HTTP request using fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const fetchOptions: RequestInit = {
        method: config.method,
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      };

      const response = await fetch(config.url, fetchOptions);
      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as T;
      }

      // Build response headers object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const serviceResponse: ServiceResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        data,
        duration,
        correlationId: config.correlationId,
      };

      // Log response
      if (this.config.logResponses) {
        this.logger.debug('HTTP response', config.correlationId, {
          status: response.status,
          statusText: response.statusText,
          duration,
          responseSize: this.getResponseSize(data),
          responseBody: this.truncateResponseBody(data),
        });
      }

      // Check for HTTP errors
      if (!response.ok) {
        throw new ServiceClientError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          serviceResponse,
          config,
        );
      }

      return serviceResponse;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof ServiceClientError) {
        throw error;
      }

      // Handle fetch errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new ServiceClientError(
            `Request timeout after ${config.timeout}ms`,
            408,
            undefined,
            config,
            error,
          );
        }

        throw new ServiceClientError(
          `Network error: ${error.message}`,
          undefined,
          undefined,
          config,
          error,
        );
      }

      throw new ServiceClientError('Unknown error occurred', undefined, undefined, config);
    }
  }

  /**
   * Check if error should be retried
   */
  private shouldRetry(error: ServiceClientError, attempt: number, maxRetries: number): boolean {
    // Don't retry if we've reached max attempts
    if (attempt > maxRetries) {
      return false;
    }

    // Check if error is retryable
    if (!error.isRetryable()) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay =
      this.config.retry.initialDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.retry.maxDelay);
  }

  /**
   * Build full URL from base URL and path
   */
  private buildUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    if (this.config.baseUrl) {
      const baseUrl = this.config.baseUrl.endsWith('/')
        ? this.config.baseUrl.slice(0, -1)
        : this.config.baseUrl;
      const path = url.startsWith('/') ? url : `/${url}`;
      return `${baseUrl}${path}`;
    }

    return url;
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Sanitize headers for logging (remove sensitive values)
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'x-api-key', 'x-signature'];

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get response size for logging
   */
  private getResponseSize(data: any): number {
    if (typeof data === 'string') {
      return data.length;
    }
    return JSON.stringify(data).length;
  }

  /**
   * Truncate response body for logging
   */
  private truncateResponseBody(data: any): any {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (str.length <= this.config.maxResponseBodyLogSize) {
      return data;
    }

    return str.substring(0, this.config.maxResponseBodyLogSize) + '... [truncated]';
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  async get<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: 'GET', url, ...config });
  }

  async post<T = any>(
    url: string,
    body?: any,
    config?: Partial<RequestConfig>,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: 'POST', url, body, ...config });
  }

  async put<T = any>(
    url: string,
    body?: any,
    config?: Partial<RequestConfig>,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: 'PUT', url, body, ...config });
  }

  async delete<T = any>(url: string, config?: Partial<RequestConfig>): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, ...config });
  }

  async patch<T = any>(
    url: string,
    body?: any,
    config?: Partial<RequestConfig>,
  ): Promise<ServiceResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, body, ...config });
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  /**
   * Get circuit breaker statistics
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.circuitBreaker.isHealthy();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.forceClose();
  }

  /**
   * Get service client configuration
   */
  getConfig(): ServiceClientConfig {
    return { ...this.config };
  }
}
