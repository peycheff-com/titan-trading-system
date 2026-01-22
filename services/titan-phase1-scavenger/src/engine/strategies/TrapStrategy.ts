import { Tripwire } from '../../types/index.js';

export interface TrapValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface TrapStrategy {
  validate(trap: Tripwire): Promise<TrapValidationResult>;
}
