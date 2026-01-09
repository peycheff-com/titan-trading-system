/**
 * ManipulationDetector - Cross-Exchange Manipulation Detection
 * 
 * Detects single-exchange anomalies, divergence patterns, and
 * coordinated manipulation across multiple exchanges.
 * 
 * Requirements: 4.3, 4.5 (Cross-Exchange Manipulation Detection)
 */

import { EventEmitter } from 'events';
import { ExchangeFlow, ManipulationAnalysis, ConnectionStatus } from '../types/enhanced-2026';

/**
 * Manipulation detection configuration
 */
export interface ManipulationDetectorConfig {
  divergenceThreshold: number; // Percentage divergence to flag (default: 50%)
  outlierStdDevMultiplier: number; // Standard deviations for outlier detection
  volumeAnomalyThreshold: number; // Volume spike threshold
  priceSpreadThreshold: number; // Price spread percentage threshold
  analysisWindow: number; // Time window for analysis (ms)
  minDataPoints: number; // Minimum data points for analysis
}

/**
 * Divergence analysis result
 */
export interface DivergenceAnalysis {
  hasDivergence: boolean;
  divergenceScore: number; // 0-100
  leadingExchange: 'binance' | 'coinbase' | 'kraken' | null;
  laggingExchanges: ('binance' | 'coinbase' | 'kraken')[];
  cvdDivergence: number;
  volumeDivergence: number;
  timestamp: Date;
}

/**
 * Outlier detection result
 */
export interface OutlierAnalysis {
  hasOutlier: boolean;
  outlierExchange: 'binance' | 'coinbase' | 'kraken' | null;
  outlierScore: number; // 0-100
  outlierType: 'cvd' | 'volume' | 'price' | 'none';
  deviation: number; // Standard deviations from mean
  timestamp: Date;
}

/**
 * Manipulation pattern types
 */
export type ManipulationPattern = 
  | 'single_exchange_outlier'
  | 'coordinated_manipulation'
  | 'volume_spike'
  | 'price_divergence'
  | 'cvd_painting'
  | 'none';

/**
 * Comprehensive manipulation analysis
 */
export interface ComprehensiveManipulationAnalysis {
  detected: boolean;
  confidence: number; // 0-100
  pattern: ManipulationPattern;
  suspectExchange: 'binance' | 'coinbase' | 'kraken' | null;
  divergence: DivergenceAnalysis;
  outlier: OutlierAnalysis;
  recommendation: 'proceed' | 'caution' | 'veto';
  reasoning: string[];
  timestamp: Date;
}

/**
 * Historical data point for analysis
 */
interface HistoricalDataPoint {
  timestamp: number;
  exchangeFlows: ExchangeFlow[];
  aggregatedCVD: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ManipulationDetectorConfig = {
  divergenceThreshold: 50, // 50% divergence
  outlierStdDevMultiplier: 2.5, // 2.5 standard deviations
  volumeAnomalyThreshold: 300, // 300% of average volume
  priceSpreadThreshold: 0.5, // 0.5% price spread
  analysisWindow: 5 * 60 * 1000, // 5 minutes
  minDataPoints: 10
};

/**
 * ManipulationDetector - Detects cross-exchange manipulation patterns
 * 
 * Requirements: 4.3, 4.5
 * - Build outlier detection for single-exchange anomalies
 * - Create divergence analysis across exchanges
 * - Implement manipulation pattern recognition
 * 
 * Emits events:
 * - 'manipulationDetected': ComprehensiveManipulationAnalysis
 * - 'divergenceAlert': DivergenceAnalysis
 * - 'outlierAlert': OutlierAnalysis
 */
export class ManipulationDetector extends EventEmitter {
  private config: ManipulationDetectorConfig;
  private historicalData: Map<string, HistoricalDataPoint[]> = new Map();

  constructor(config: Partial<ManipulationDetectorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze exchange flows for manipulation
   * Requirement 4.3: Flag as FAKEOUT if one exchange sweeps but others hold steady
   */
  analyzeManipulation(
    symbol: string,
    exchangeFlows: ExchangeFlow[],
    aggregatedCVD: number
  ): ComprehensiveManipulationAnalysis {
    // Store historical data
    this.storeHistoricalData(symbol, exchangeFlows, aggregatedCVD);

    // Get connected exchanges only
    const connectedFlows = exchangeFlows.filter(
      f => f.status === ConnectionStatus.CONNECTED && f.trades > 0
    );

    if (connectedFlows.length < 2) {
      return this.createNeutralAnalysis('Insufficient connected exchanges for analysis');
    }

    // Perform analyses
    const divergence = this.analyzeDivergence(connectedFlows);
    const outlier = this.analyzeOutliers(connectedFlows);

    // Determine overall manipulation status
    const { detected, confidence, pattern, suspectExchange, recommendation, reasoning } = 
      this.synthesizeAnalysis(divergence, outlier, connectedFlows);

    const analysis: ComprehensiveManipulationAnalysis = {
      detected,
      confidence,
      pattern,
      suspectExchange,
      divergence,
      outlier,
      recommendation,
      reasoning,
      timestamp: new Date()
    };

    // Emit events if manipulation detected
    if (detected) {
      this.emit('manipulationDetected', analysis);
    }
    if (divergence.hasDivergence) {
      this.emit('divergenceAlert', divergence);
    }
    if (outlier.hasOutlier) {
      this.emit('outlierAlert', outlier);
    }

    return analysis;
  }

  /**
   * Analyze divergence between exchanges
   * Requirement 4.3: Detect when one exchange diverges from others
   */
  analyzeDivergence(flows: ExchangeFlow[]): DivergenceAnalysis {
    if (flows.length < 2) {
      return {
        hasDivergence: false,
        divergenceScore: 0,
        leadingExchange: null,
        laggingExchanges: [],
        cvdDivergence: 0,
        volumeDivergence: 0,
        timestamp: new Date()
      };
    }

    // Calculate average CVD and volume
    const avgCVD = flows.reduce((sum, f) => sum + f.cvd, 0) / flows.length;
    const avgVolume = flows.reduce((sum, f) => sum + f.volume, 0) / flows.length;

    // Find the exchange with highest absolute CVD (potential leader)
    let maxAbsCVD = 0;
    let leadingExchange: 'binance' | 'coinbase' | 'kraken' | null = null;
    const laggingExchanges: ('binance' | 'coinbase' | 'kraken')[] = [];

    for (const flow of flows) {
      if (Math.abs(flow.cvd) > maxAbsCVD) {
        maxAbsCVD = Math.abs(flow.cvd);
        leadingExchange = flow.exchange;
      }
    }

    // Calculate divergence from leader
    let maxDivergence = 0;
    for (const flow of flows) {
      if (flow.exchange !== leadingExchange) {
        const divergence = Math.abs(flow.cvd - (leadingExchange ? 
          flows.find(f => f.exchange === leadingExchange)!.cvd : 0));
        
        if (divergence > maxDivergence) {
          maxDivergence = divergence;
        }

        // Check if this exchange is lagging (opposite direction or much smaller magnitude)
        const leaderCVD = flows.find(f => f.exchange === leadingExchange)?.cvd || 0;
        if (Math.sign(flow.cvd) !== Math.sign(leaderCVD) || 
            Math.abs(flow.cvd) < Math.abs(leaderCVD) * 0.3) {
          laggingExchanges.push(flow.exchange);
        }
      }
    }

    // Calculate divergence score (0-100)
    const cvdDivergence = avgCVD !== 0 ? (maxDivergence / Math.abs(avgCVD)) * 100 : 0;
    const volumeDivergence = this.calculateVolumeDivergence(flows, avgVolume);
    const divergenceScore = Math.min(100, (cvdDivergence + volumeDivergence) / 2);

    const hasDivergence = divergenceScore > this.config.divergenceThreshold;

    return {
      hasDivergence,
      divergenceScore,
      leadingExchange: hasDivergence ? leadingExchange : null,
      laggingExchanges: hasDivergence ? laggingExchanges : [],
      cvdDivergence,
      volumeDivergence,
      timestamp: new Date()
    };
  }

  /**
   * Analyze for outlier exchanges
   * Requirement 4.5: Verify with other exchanges before confirming institutional flow
   */
  analyzeOutliers(flows: ExchangeFlow[]): OutlierAnalysis {
    if (flows.length < 2) {
      return {
        hasOutlier: false,
        outlierExchange: null,
        outlierScore: 0,
        outlierType: 'none',
        deviation: 0,
        timestamp: new Date()
      };
    }

    // Calculate statistics for CVD
    const cvdValues = flows.map(f => f.cvd);
    const cvdMean = cvdValues.reduce((a, b) => a + b, 0) / cvdValues.length;
    const cvdStdDev = this.calculateStdDev(cvdValues, cvdMean);

    // Calculate statistics for volume
    const volumeValues = flows.map(f => f.volume);
    const volumeMean = volumeValues.reduce((a, b) => a + b, 0) / volumeValues.length;
    const volumeStdDev = this.calculateStdDev(volumeValues, volumeMean);

    // Find outliers
    let maxDeviation = 0;
    let outlierExchange: 'binance' | 'coinbase' | 'kraken' | null = null;
    let outlierType: 'cvd' | 'volume' | 'price' | 'none' = 'none';

    for (const flow of flows) {
      // Check CVD outlier
      const cvdDeviation = cvdStdDev > 0 ? Math.abs(flow.cvd - cvdMean) / cvdStdDev : 0;
      if (cvdDeviation > maxDeviation && cvdDeviation > this.config.outlierStdDevMultiplier) {
        maxDeviation = cvdDeviation;
        outlierExchange = flow.exchange;
        outlierType = 'cvd';
      }

      // Check volume outlier
      const volumeDeviation = volumeStdDev > 0 ? Math.abs(flow.volume - volumeMean) / volumeStdDev : 0;
      if (volumeDeviation > maxDeviation && volumeDeviation > this.config.outlierStdDevMultiplier) {
        maxDeviation = volumeDeviation;
        outlierExchange = flow.exchange;
        outlierType = 'volume';
      }
    }

    const hasOutlier = maxDeviation > this.config.outlierStdDevMultiplier;
    const outlierScore = Math.min(100, (maxDeviation / this.config.outlierStdDevMultiplier) * 50);

    return {
      hasOutlier,
      outlierExchange: hasOutlier ? outlierExchange : null,
      outlierScore,
      outlierType: hasOutlier ? outlierType : 'none',
      deviation: maxDeviation,
      timestamp: new Date()
    };
  }

  /**
   * Detect CVD painting pattern
   * CVD painting: Artificial CVD divergence created by TWAP algorithms
   */
  detectCVDPainting(symbol: string): boolean {
    const history = this.historicalData.get(symbol) || [];
    if (history.length < this.config.minDataPoints) return false;

    // Look for consistent single-exchange CVD divergence over time
    const recentHistory = history.slice(-this.config.minDataPoints);
    
    let consistentOutlierCount = 0;
    let lastOutlier: string | null = null;

    for (const point of recentHistory) {
      const connectedFlows = point.exchangeFlows.filter(
        f => f.status === ConnectionStatus.CONNECTED
      );
      
      if (connectedFlows.length < 2) continue;

      const outlier = this.analyzeOutliers(connectedFlows);
      if (outlier.hasOutlier && outlier.outlierType === 'cvd') {
        if (lastOutlier === outlier.outlierExchange) {
          consistentOutlierCount++;
        } else {
          consistentOutlierCount = 1;
          lastOutlier = outlier.outlierExchange;
        }
      }
    }

    // CVD painting detected if same exchange is outlier consistently
    return consistentOutlierCount >= this.config.minDataPoints * 0.7;
  }

  /**
   * Synthesize all analyses into final recommendation
   */
  private synthesizeAnalysis(
    divergence: DivergenceAnalysis,
    outlier: OutlierAnalysis,
    flows: ExchangeFlow[]
  ): {
    detected: boolean;
    confidence: number;
    pattern: ManipulationPattern;
    suspectExchange: 'binance' | 'coinbase' | 'kraken' | null;
    recommendation: 'proceed' | 'caution' | 'veto';
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    let confidence = 0;
    let pattern: ManipulationPattern = 'none';
    let suspectExchange: 'binance' | 'coinbase' | 'kraken' | null = null;

    // Check for single exchange outlier
    if (outlier.hasOutlier) {
      confidence += outlier.outlierScore * 0.4;
      pattern = 'single_exchange_outlier';
      suspectExchange = outlier.outlierExchange;
      reasoning.push(`${outlier.outlierExchange} shows ${outlier.outlierType} outlier (${outlier.deviation.toFixed(1)} std devs)`);
    }

    // Check for divergence
    if (divergence.hasDivergence) {
      confidence += divergence.divergenceScore * 0.4;
      if (pattern === 'none') {
        pattern = 'single_exchange_outlier';
      }
      if (!suspectExchange) {
        suspectExchange = divergence.leadingExchange;
      }
      reasoning.push(`Exchange divergence detected: ${divergence.leadingExchange} leading, ${divergence.laggingExchanges.join(', ')} lagging`);
    }

    // Check for volume anomaly
    const avgVolume = flows.reduce((sum, f) => sum + f.volume, 0) / flows.length;
    for (const flow of flows) {
      if (flow.volume > avgVolume * (this.config.volumeAnomalyThreshold / 100)) {
        confidence += 20;
        if (pattern === 'none') {
          pattern = 'volume_spike';
        }
        reasoning.push(`${flow.exchange} volume spike: ${((flow.volume / avgVolume) * 100).toFixed(0)}% of average`);
        break;
      }
    }

    // Determine recommendation
    let recommendation: 'proceed' | 'caution' | 'veto';
    if (confidence >= 70) {
      recommendation = 'veto';
      reasoning.push('High manipulation confidence - signal vetoed');
    } else if (confidence >= 40) {
      recommendation = 'caution';
      reasoning.push('Moderate manipulation risk - proceed with caution');
    } else {
      recommendation = 'proceed';
      if (reasoning.length === 0) {
        reasoning.push('No significant manipulation patterns detected');
      }
    }

    return {
      detected: confidence >= 40,
      confidence: Math.min(100, confidence),
      pattern,
      suspectExchange,
      recommendation,
      reasoning
    };
  }

  /**
   * Calculate volume divergence score
   */
  private calculateVolumeDivergence(flows: ExchangeFlow[], avgVolume: number): number {
    if (avgVolume === 0) return 0;

    let maxDivergence = 0;
    for (const flow of flows) {
      const divergence = Math.abs(flow.volume - avgVolume) / avgVolume * 100;
      if (divergence > maxDivergence) {
        maxDivergence = divergence;
      }
    }

    return maxDivergence;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length < 2) return 0;
    
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Store historical data point
   */
  private storeHistoricalData(
    symbol: string,
    exchangeFlows: ExchangeFlow[],
    aggregatedCVD: number
  ): void {
    if (!this.historicalData.has(symbol)) {
      this.historicalData.set(symbol, []);
    }

    const history = this.historicalData.get(symbol)!;
    history.push({
      timestamp: Date.now(),
      exchangeFlows: [...exchangeFlows],
      aggregatedCVD
    });

    // Cleanup old data
    const cutoff = Date.now() - this.config.analysisWindow;
    const filtered = history.filter(h => h.timestamp > cutoff);
    this.historicalData.set(symbol, filtered);
  }

  /**
   * Create neutral analysis result
   */
  private createNeutralAnalysis(reason: string): ComprehensiveManipulationAnalysis {
    return {
      detected: false,
      confidence: 0,
      pattern: 'none',
      suspectExchange: null,
      divergence: {
        hasDivergence: false,
        divergenceScore: 0,
        leadingExchange: null,
        laggingExchanges: [],
        cvdDivergence: 0,
        volumeDivergence: 0,
        timestamp: new Date()
      },
      outlier: {
        hasOutlier: false,
        outlierExchange: null,
        outlierScore: 0,
        outlierType: 'none',
        deviation: 0,
        timestamp: new Date()
      },
      recommendation: 'proceed',
      reasoning: [reason],
      timestamp: new Date()
    };
  }

  /**
   * Clear historical data
   */
  clearHistory(): void {
    this.historicalData.clear();
  }

  /**
   * Get configuration
   */
  getConfig(): ManipulationDetectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ManipulationDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
