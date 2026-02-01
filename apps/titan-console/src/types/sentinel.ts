export interface Position {
  symbol: string;
  spotSize: number;
  perpSize: number;
  spotEntry: number;
  perpEntry: number;
  entryBasis: number;
  currentBasis: number;
  unrealizedPnL: number;
  type: 'CORE' | 'SATELLITE' | 'VACUUM';
}

export interface HealthReport {
  nav: number;
  delta: number;
  marginUtilization: number;
  riskStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  positions: Position[];
  alerts: string[];
}
