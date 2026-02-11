/* eslint-disable functional/no-let -- Stateful runtime: mutations architecturally required */
import { Logger } from '../logging/Logger.js';

const logger = Logger.getInstance('retry-util');

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryableErrors?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffFactor: 2,
  retryableErrors: () => true, // Retry on everything by default
};

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  context: string = 'Operation',
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let attempt = 0;
  let delay = config.initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;

      if (attempt > config.maxRetries) {
        logger.error(`${context} failed after ${attempt} attempts`, error as Error);
        throw error;
      }

      if (!config.retryableErrors(error)) {
        logger.error(`${context} encountered non-retryable error`, error as Error);
        throw error;
      }

      logger.warn(
        `${context} failed (Attempt ${attempt}/${config.maxRetries}). Retrying in ${delay}ms...`,
        undefined,
        { error },
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      delay = Math.min(delay * config.backoffFactor, config.maxDelayMs);
    }
  }
}
