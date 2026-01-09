/**
 * Execution Strategy Pattern
 * Base class for different execution modes
 */

export class ExecutionStrategy {
  /**
   * Execute an order using the strategy
   * @param {Object} params - Execution parameters
   * @returns {Promise<Object>} Execution result
   */
  async execute(params) {
    throw new Error('Must implement execute() method');
  }
}
