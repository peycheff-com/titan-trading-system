/**
 * Execution Module Exports
 *
 * Contains atomic execution, TWAP slicing, abort handling, and IPC execution.
 *
 * @module execution
 */

export { type AtomicConfig, AtomicExecutor } from './AtomicExecutor.js';
export { TwapExecutor } from './TwapExecutor.js';
export { AbortHandler } from './AbortHandler.js';
export { type FastPathExecutorConfig, FastPathOrderExecutor } from './FastPathOrderExecutor.js';
export type { IOrderExecutor, TwapRequest } from './interfaces.js';

export const EXECUTION_MODULE_VERSION = '1.0.0';
