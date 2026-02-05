export enum TruthState {
  VERIFIED = 'VERIFIED',
  PROBABLE = 'PROBABLE',
  SUSPECT = 'SUSPECT',
  UNKNOWN = 'UNKNOWN',
}

export interface TruthScore {
  score: number; // 0-100
  state: TruthState;
  reasons: string[];
  lastUpdated: number;
}
