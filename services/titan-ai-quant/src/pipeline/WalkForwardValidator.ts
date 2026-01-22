/**
 * Walk-Forward Validator
 * Implements sliding window validation for time-series data
 * Essential to prevent look-ahead bias and overfitting in AI strategies
 */

export interface ValidationWindow {
  id: number;
  train: { start: number; end: number };
  validate: { start: number; end: number };
  test: { start: number; end: number };
}

export interface ValidationConfig {
  /** Size of training window in milliseconds */
  trainSizeMs: number;
  /** Size of validation window in milliseconds */
  validateSizeMs: number;
  /** Size of test window in milliseconds */
  testSizeMs: number;
  /** Step size to move the window forward (usually equal to testSize) */
  stepSizeMs: number;
  /** Optional: Gap between train and validate to prevent leakage (purge) */
  purgeMs?: number;
  /** Anchored Walk-Forward (start of train fixed) vs Rolling */
  anchored?: boolean;
}

export class WalkForwardValidator {
  /**
   * Generate validation windows for a given time range
   *
   * @param dataStartMs Timestamp of data start
   * @param dataEndMs Timestamp of data end
   * @param config Validation configuration
   * @returns Array of validation windows
   */
  static generateWindows(
    dataStartMs: number,
    dataEndMs: number,
    config: ValidationConfig,
  ): ValidationWindow[] {
    const windows: ValidationWindow[] = [];
    const purge = config.purgeMs || 0;

    // Total required for one iteration: Train + Purge + Validate + Purge + Test
    const minRequired =
      config.trainSizeMs + purge + config.validateSizeMs + purge + config.testSizeMs;

    if (dataEndMs - dataStartMs < minRequired) {
      console.warn('Insufficient data for Walk-Forward Validation');
      return [];
    }

    // eslint-disable-next-line functional/no-let
    let currentStart = dataStartMs;
    // eslint-disable-next-line functional/no-let
    let windowId = 1;

    while (true) {
      // Define window boundaries
      const trainStart = config.anchored ? dataStartMs : currentStart;
      const trainEnd = trainStart + config.trainSizeMs;

      const validateStart = trainEnd + purge;
      const validateEnd = validateStart + config.validateSizeMs;

      const testStart = validateEnd + purge;
      const testEnd = testStart + config.testSizeMs;

      // Check if we exceeded data bounds
      if (testEnd > dataEndMs) {
        break;
      }

      // eslint-disable-next-line functional/immutable-data
      windows.push({
        id: windowId++,
        train: { start: trainStart, end: trainEnd },
        validate: { start: validateStart, end: validateEnd },
        test: { start: testStart, end: testEnd },
      });

      // Move forward
      currentStart += config.stepSizeMs;
    }

    return windows;
  }

  /**
   * Calculate Out-of-Sample Performance Stability (OOS)
   * Ratio of Test Performance / Train Performance
   *
   * @param trainPerf Performance metric (e.g., Sharpe) on training set
   * @param testPerf Performance metric on test set
   * @returns Stability score (1.0 = perfect generalization)
   */
  static calculateStability(trainPerf: number, testPerf: number): number {
    if (trainPerf === 0) return 0;
    return testPerf / trainPerf;
  }
}
