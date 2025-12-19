/**
 * Utility functions for better error handling in tests
 */

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a specific property
 */
export function hasProperty<T extends string>(
  error: unknown,
  property: T
): error is Record<T, unknown> {
  return typeof error === 'object' && error !== null && property in error;
}

/**
 * Safe error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Safe error code extraction for Node.js errors
 */
export function getErrorCode(error: unknown): string | undefined {
  if (hasProperty(error, 'code') && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}