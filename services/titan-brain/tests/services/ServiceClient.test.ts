/**
 * ServiceClient Tests
 * 
 * Comprehensive unit tests for the ServiceClient class
 */

import { ServiceClient, ServiceClientError } from '../../src/services/ServiceClient';
import { CircuitBreakerState } from '../../src/services/CircuitBreaker';
import { Logger } from '../../src/logging/Logger';

// Mock fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

// Mock Logger
jest.mock('../../src/logging/Logger');
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

// Mock AbortController
global.AbortController = jest.fn().mockImplementation(() => ({
  abort: jest.fn(),
  signal: {}
}));

// Helper function to create mock Response
function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  data?: any;
  contentType?: string;
}) {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    headers = {},
    data = {},
    contentType = 'application/json'
  } = options;

  const mockHeaders = {
    get: jest.fn().mockImplementation((name: string) => {
      if (name.toLowerCase() === 'content-type') return contentType;
      return headers[name] || null;
    }),
    forEach: jest.fn().mockImplementation((callback: (value: string, key: string) => void) => {
      callback(contentType, 'content-type');
      Object.entries(headers).forEach(([key, value]) => callback(value, key));
    })
  };

  return {
    ok,
    status,
    statusText,
    headers: mockHeaders,
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data))
  };
}

describe('ServiceClient', () => {
  let serviceClient: ServiceClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    
    serviceClient = new ServiceClient({
      baseUrl: 'https://api.example.com',
      defaultTimeout: 5000,
      retry: {
        maxRetries: 2,
        initialDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        retryableStatusCodes: [500, 502, 503],
        retryableErrors: ['ECONNRESET']
      }
    });
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const client = new ServiceClient();
      expect(client.getConfig().defaultTimeout).toBe(10000);
    });

    it('should merge custom configuration', () => {
      const config = serviceClient.getConfig();
      expect(config.baseUrl).toBe('https://api.example.com');
      expect(config.defaultTimeout).toBe(5000);
    });

    it('should initialize circuit breaker', () => {
      expect(serviceClient.isHealthy()).toBe(true);
    });
  });

  describe('request method', () => {
    it('should make successful GET request', async () => {
      const mockResponse = createMockResponse({
        data: { data: 'test' }
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      const response = await serviceClient.request({
        method: 'GET',
        url: '/test'
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ data: 'test' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'TitanBrain/1.0.0'
          })
        })
      );
    });

    it('should make successful POST request with body', async () => {
      const mockResponse = createMockResponse({
        status: 201,
        statusText: 'Created',
        data: { id: 123 }
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      const response = await serviceClient.request({
        method: 'POST',
        url: '/users',
        body: { name: 'John' }
      });

      expect(response.status).toBe(201);
      expect(response.data).toEqual({ id: 123 });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'John' })
        })
      );
    });

    it('should handle non-JSON responses', async () => {
      const mockResponse = createMockResponse({
        contentType: 'text/plain',
        data: 'plain text response'
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      const response = await serviceClient.request({
        method: 'GET',
        url: '/text'
      });

      expect(response.data).toBe('plain text response');
    });

    it('should add correlation ID to headers', async () => {
      const mockResponse = createMockResponse({});
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await serviceClient.request({
        method: 'GET',
        url: '/test'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-correlation-id': expect.stringMatching(/^req_\d+_[a-z0-9]+$/)
          })
        })
      );
    });

    it('should use provided correlation ID', async () => {
      const mockResponse = createMockResponse({});
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await serviceClient.request({
        method: 'GET',
        url: '/test',
        correlationId: 'custom-id'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-correlation-id': 'custom-id'
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should throw ServiceClientError for HTTP errors', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Not found' }
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await expect(serviceClient.request({
        method: 'GET',
        url: '/not-found'
      })).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(serviceClient.request({
        method: 'GET',
        url: '/test'
      })).rejects.toThrow('Network error');
    });

    it('should handle timeout errors', async () => {
      // Mock fetch to reject with AbortError after timeout
      mockFetch.mockImplementationOnce(() => 
        new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            reject(error);
          }, 150);
        })
      );

      await expect(serviceClient.request({
        method: 'GET',
        url: '/slow',
        timeout: 100
      })).rejects.toThrow('Network error');
    });
  });

  describe('retry logic', () => {
    it('should retry on retryable errors', async () => {
      const mockErrorResponse = createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server error' }
      });
      
      const mockSuccessResponse = createMockResponse({
        data: { success: true }
      });
      
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse as any)
        .mockResolvedValueOnce(mockErrorResponse as any)
        .mockResolvedValueOnce(mockSuccessResponse as any);

      const response = await serviceClient.request({
        method: 'GET',
        url: '/test'
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'Bad request' }
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await expect(serviceClient.request({
        method: 'GET',
        url: '/test'
      })).rejects.toThrow('HTTP 400: Bad Request');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect max retries', async () => {
      // Create a fresh service client with circuit breaker disabled for this test
      const testClient = new ServiceClient({
        baseUrl: 'https://api.example.com',
        defaultTimeout: 5000,
        retry: {
          maxRetries: 2,
          initialDelay: 10, // Reduce delay for faster test
          maxDelay: 100,
          backoffMultiplier: 2,
          retryableStatusCodes: [500, 502, 503],
          retryableErrors: ['ECONNRESET']
        },
        circuitBreaker: {
          name: 'test-circuit-breaker',
          failureThreshold: 10, // High threshold to prevent circuit breaker from opening
          recoveryTimeout: 60000,
          requestTimeout: 5000,
          monitoringPeriod: 60000,
          halfOpenMaxCalls: 3
        }
      });

      const mockResponse = createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server error' }
      });
      
      mockFetch.mockClear(); // Clear previous calls
      mockFetch.mockResolvedValue(mockResponse as any);

      await expect(testClient.request({
        method: 'GET',
        url: '/test',
        retries: 2  // Explicitly set retries to match test expectation
      })).rejects.toThrow('HTTP 500: Internal Server Error');

      // Initial request + 2 retries = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker integration', () => {
    it('should open circuit breaker after failures', async () => {
      const mockResponse = createMockResponse({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Server error' }
      });
      
      mockFetch.mockResolvedValue(mockResponse as any);

      // Make enough requests to open circuit breaker (5 failures by default)
      for (let i = 0; i < 5; i++) {
        await expect(serviceClient.request({
          method: 'GET',
          url: '/test',
          retries: 0 // No retries to speed up test
        })).rejects.toThrow('HTTP 500: Internal Server Error');
      }

      expect(serviceClient.isHealthy()).toBe(false);
    });

    it('should reset circuit breaker', () => {
      serviceClient.resetCircuitBreaker();
      expect(serviceClient.isHealthy()).toBe(true);
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      const mockResponse = createMockResponse({
        data: { success: true }
      });
      
      mockFetch.mockResolvedValue(mockResponse as any);
    });

    it('should support GET method', async () => {
      await serviceClient.get('/test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should support POST method', async () => {
      await serviceClient.post('/test', { data: 'test' });
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 
          method: 'POST',
          body: JSON.stringify({ data: 'test' })
        })
      );
    });

    it('should support PUT method', async () => {
      await serviceClient.put('/test', { data: 'test' });
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 
          method: 'PUT',
          body: JSON.stringify({ data: 'test' })
        })
      );
    });

    it('should support DELETE method', async () => {
      await serviceClient.delete('/test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should support PATCH method', async () => {
      await serviceClient.patch('/test', { data: 'test' });
      
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ 
          method: 'PATCH',
          body: JSON.stringify({ data: 'test' })
        })
      );
    });
  });

  describe('interceptors', () => {
    it('should apply request interceptors', async () => {
      const requestInterceptor = jest.fn().mockImplementation(config => ({
        ...config,
        headers: { ...config.headers, 'X-Custom': 'test' }
      }));
      
      serviceClient.addRequestInterceptor(requestInterceptor);
      
      const mockResponse = createMockResponse({});
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      await serviceClient.request({
        method: 'GET',
        url: '/test'
      });

      expect(requestInterceptor).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom': 'test'
          })
        })
      );
    });

    it('should apply response interceptors', async () => {
      const responseInterceptor = jest.fn().mockImplementation(response => ({
        ...response,
        data: { ...response.data, intercepted: true }
      }));
      
      serviceClient.addResponseInterceptor(responseInterceptor);
      
      const mockResponse = createMockResponse({
        data: { original: true }
      });
      
      mockFetch.mockResolvedValueOnce(mockResponse as any);

      const response = await serviceClient.request({
        method: 'GET',
        url: '/test'
      });

      expect(responseInterceptor).toHaveBeenCalled();
      expect(response.data).toEqual({ original: true, intercepted: true });
    });

    it('should apply error interceptors', async () => {
      const errorInterceptor = jest.fn().mockImplementation(error => {
        error.message = 'Intercepted: ' + error.message;
        return error;
      });
      
      serviceClient.addErrorInterceptor(errorInterceptor);
      
      // Create a fresh mock that will reject
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(serviceClient.request({
        method: 'GET',
        url: '/test',
        retries: 0  // No retries to avoid complications
      })).rejects.toThrow('Intercepted: Network error');

      expect(errorInterceptor).toHaveBeenCalled();
    });
  });

  describe('ServiceClientError', () => {
    it('should identify retryable errors correctly', () => {
      const networkError = new ServiceClientError('Network error');
      expect(networkError.isRetryable()).toBe(true);

      const serverError = new ServiceClientError('Server error', 500);
      expect(serverError.isRetryable()).toBe(true);

      const clientError = new ServiceClientError('Client error', 400);
      expect(clientError.isRetryable()).toBe(false);

      const rateLimitError = new ServiceClientError('Rate limited', 429);
      expect(rateLimitError.isRetryable()).toBe(true);
    });

    it('should identify timeout errors', () => {
      const timeoutError = new ServiceClientError('Request timeout', 408);
      expect(timeoutError.isTimeout()).toBe(true);

      const networkTimeoutError = new ServiceClientError('timeout occurred');
      expect(networkTimeoutError.isTimeout()).toBe(true);

      const otherError = new ServiceClientError('Other error', 500);
      expect(otherError.isTimeout()).toBe(false);
    });

    it('should identify network errors', () => {
      const networkError = new ServiceClientError('Network error', undefined, undefined, undefined, new Error('ECONNRESET'));
      expect(networkError.isNetworkError()).toBe(true);

      const httpError = new ServiceClientError('HTTP error', 500);
      expect(httpError.isNetworkError()).toBe(false);
    });
  });
});