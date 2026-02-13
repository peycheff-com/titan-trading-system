/**
 * Gemini Client (auto-current)
 *
 * Wrapper around Google's Generative AI SDK with rate limiting
 * and error handling for the Titan AI Quant system.
 * Default model uses Google's `-latest` alias so it never goes stale.
 */

import { GenerationConfig, GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { RateLimiter } from './RateLimiter.js';
import { calculateBackoffDelay, ErrorCode, logError, TitanError } from '../utils/ErrorHandler.js';

export interface GeminiClientConfig {
  apiKey?: string;
  modelName?: string;
  maxRequestsPerMinute?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export interface GenerateOptions {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

import { configManager } from '../config/ConfigManager.js';

export class GeminiClient {
  private readonly client: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  private readonly rateLimiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(config: GeminiClientConfig = {}) {
    const apiKey = config.apiKey ?? configManager.getGeminiKey() ?? process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({
      model: config.modelName ?? process.env.GEMINI_MODEL ?? 'gemini-flash-latest',
    });

    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: config.maxRequestsPerMinute ?? 10,
    });

    this.maxRetries = config.maxRetries ?? 3;
    this.baseRetryDelayMs = config.baseRetryDelayMs ?? 1000;
  }

  /**
   * Generate text content with rate limiting and retry logic
   */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const generationConfig: GenerationConfig = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      topP: options.topP ?? 0.95,
      topK: options.topK ?? 40,
    };

    return this.rateLimiter.execute(async () => {
      return this.generateWithRetry(prompt, generationConfig);
    });
  }

  /**
   * Generate JSON response with automatic parsing
   */
  async generateJSON<T>(prompt: string, options: GenerateOptions = {}): Promise<T> {
    const response = await this.generate(prompt, {
      ...options,
      temperature: options.temperature ?? 0.3, // Lower temperature for JSON
    });

    return this.parseJSON<T>(response);
  }

  /**
   * Check if rate limit allows a request
   */
  canMakeRequest(): boolean {
    return this.rateLimiter.canMakeRequest();
  }

  /**
   * Get current request count in the window
   */
  getCurrentRequestCount(): number {
    return this.rateLimiter.getCurrentRequestCount();
  }

  /**
   * Get time until next available slot
   */
  getTimeUntilNextSlot(): number {
    return this.rateLimiter.getTimeUntilNextSlot();
  }

  /**
   * Reset rate limiter (for testing)
   */
  resetRateLimiter(): void {
    this.rateLimiter.reset();
  }

  /**
   * Generate with exponential backoff retry
   * Task 15: Implement exponential backoff for Gemini API rate limits and errors
   */
  private async generateWithRetry(
    prompt: string,
    config: GenerationConfig,
    attempt = 1,
  ): Promise<string> {
    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: config,
      });

      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new TitanError(ErrorCode.INVALID_RESPONSE, 'Empty response from Gemini API', {
          attempt,
        });
      }

      return text;
    } catch (error) {
      // Classify the error
      const titanError = this.classifyGeminiError(error, attempt);

      // Log the error
      logError(titanError, { attempt, maxRetries: this.maxRetries });

      if (attempt >= this.maxRetries) {
        throw titanError;
      }

      if (!titanError.isRetryable) {
        throw titanError;
      }

      // Use centralized backoff calculation with jitter
      const delayMs = calculateBackoffDelay(attempt - 1, {
        initialDelayMs: this.baseRetryDelayMs,
        maxDelayMs: 30000,
        multiplier: 2,
        jitter: 0.1,
      });

      await this.sleep(delayMs);

      return this.generateWithRetry(prompt, config, attempt + 1);
    }
  }

  /**
   * Classify Gemini API errors into TitanError
   */
  private classifyGeminiError(error: unknown, attempt: number): TitanError {
    if (error instanceof TitanError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('429') || message.includes('rate limit') || message.includes('quota')) {
        return new TitanError(
          ErrorCode.RATE_LIMIT,
          `Gemini API rate limit exceeded: ${error.message}`,
          { attempt },
          true, // retryable
        );
      }

      if (message.includes('500') || message.includes('503') || message.includes('internal')) {
        return new TitanError(
          ErrorCode.SERVER_ERROR,
          `Gemini API server error: ${error.message}`,
          { attempt },
          true, // retryable
        );
      }

      if (message.includes('timeout') || message.includes('deadline')) {
        return new TitanError(
          ErrorCode.TIMEOUT,
          `Gemini API timeout: ${error.message}`,
          { attempt },
          true, // retryable
        );
      }

      if (
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused')
      ) {
        return new TitanError(
          ErrorCode.NETWORK_ERROR,
          `Network error: ${error.message}`,
          { attempt },
          true, // retryable
        );
      }

      // Non-retryable errors
      return new TitanError(
        ErrorCode.INVALID_RESPONSE,
        `Gemini API error: ${error.message}`,
        { attempt },
        false,
      );
    }

    return new TitanError(ErrorCode.UNKNOWN, String(error), { attempt }, false);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('500') ||
        message.includes('503') ||
        message.includes('timeout') ||
        message.includes('network')
      );
    }
    return false;
  }

  /**
   * Parse JSON from response, handling markdown code blocks
   */
  private parseJSON<T>(response: string): T {
    // eslint-disable-next-line functional/no-let
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }

    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }

    jsonStr = jsonStr.trim();

    try {
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      throw new Error(
        `Failed to parse JSON response: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
