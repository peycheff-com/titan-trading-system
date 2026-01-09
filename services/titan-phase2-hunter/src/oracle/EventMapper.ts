/**
 * Event Mapper for Titan Phase 2 - 2026 Modernization
 * 
 * Maps trading symbols to relevant prediction market events and
 * calculates relevance scores for each event.
 * 
 * Requirements:
 * - 1.1: Connect trading symbols with prediction markets
 * - 1.2: Compute weighted sentiment score
 */

import { EventEmitter } from 'events';
import {
  PredictionMarketEvent,
  EventCategory,
  ImpactLevel
} from '../types/enhanced-2026';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Symbol to event mapping configuration
 */
export interface SymbolEventMapping {
  symbol: string;
  keywords: string[];
  categories: EventCategory[];
  directEvents: string[]; // Specific event IDs that directly affect this symbol
  correlatedSymbols: string[]; // Other symbols that share events
}

/**
 * Event relevance score for a symbol
 */
export interface EventRelevance {
  event: PredictionMarketEvent;
  symbol: string;
  relevanceScore: number; // 0-100
  matchType: 'direct' | 'keyword' | 'category' | 'correlated';
  matchDetails: string[];
}

/**
 * Mapping result for a symbol
 */
export interface SymbolMappingResult {
  symbol: string;
  events: EventRelevance[];
  totalRelevance: number;
  dominantCategory: EventCategory | null;
}

// ============================================================================
// DEFAULT SYMBOL MAPPINGS
// ============================================================================

/**
 * Default symbol-to-event mappings for major crypto assets
 */
const DEFAULT_SYMBOL_MAPPINGS: SymbolEventMapping[] = [
  {
    symbol: 'BTCUSDT',
    keywords: ['bitcoin', 'btc', 'crypto', 'digital asset', 'cryptocurrency'],
    categories: [EventCategory.CRYPTO_PRICE, EventCategory.REGULATORY, EventCategory.FED_POLICY],
    directEvents: [],
    correlatedSymbols: ['ETHUSDT', 'SOLUSDT']
  },
  {
    symbol: 'ETHUSDT',
    keywords: ['ethereum', 'eth', 'crypto', 'defi', 'smart contract'],
    categories: [EventCategory.CRYPTO_PRICE, EventCategory.REGULATORY],
    directEvents: [],
    correlatedSymbols: ['BTCUSDT', 'SOLUSDT']
  },
  {
    symbol: 'SOLUSDT',
    keywords: ['solana', 'sol', 'crypto', 'blockchain'],
    categories: [EventCategory.CRYPTO_PRICE, EventCategory.REGULATORY],
    directEvents: [],
    correlatedSymbols: ['BTCUSDT', 'ETHUSDT']
  },
  {
    symbol: 'BNBUSDT',
    keywords: ['binance', 'bnb', 'crypto', 'exchange'],
    categories: [EventCategory.CRYPTO_PRICE, EventCategory.REGULATORY],
    directEvents: [],
    correlatedSymbols: ['BTCUSDT']
  },
  {
    symbol: 'XRPUSDT',
    keywords: ['ripple', 'xrp', 'crypto', 'sec', 'lawsuit'],
    categories: [EventCategory.CRYPTO_PRICE, EventCategory.REGULATORY],
    directEvents: [],
    correlatedSymbols: ['BTCUSDT']
  }
];

/**
 * BTC-specific event patterns for crash/ATH detection
 * Requirement 1.6, 1.7: BTC Crash and ATH detection
 */
const BTC_CRASH_PATTERNS = [
  'bitcoin crash',
  'btc crash',
  'bitcoin below',
  'btc below',
  'bitcoin drop',
  'crypto crash',
  'bitcoin bear',
  'btc bear market'
];

const BTC_ATH_PATTERNS = [
  'bitcoin ath',
  'btc ath',
  'bitcoin above',
  'btc above',
  'bitcoin new high',
  'bitcoin all time high',
  'btc all time high',
  'bitcoin bull'
];

// ============================================================================
// EVENT MAPPER CLASS
// ============================================================================

/**
 * Event Mapper
 * 
 * Maps trading symbols to relevant prediction market events and
 * calculates relevance scores based on keyword matching, category
 * alignment, and direct event associations.
 */
export class EventMapper extends EventEmitter {
  private symbolMappings: Map<string, SymbolEventMapping>;
  private eventCache: Map<string, PredictionMarketEvent>;
  private relevanceCache: Map<string, EventRelevance[]>;
  private cacheTTL: number = 60000; // 1 minute
  private lastCacheUpdate: number = 0;

  constructor(customMappings?: SymbolEventMapping[]) {
    super();
    this.symbolMappings = new Map();
    this.eventCache = new Map();
    this.relevanceCache = new Map();

    // Load default mappings
    for (const mapping of DEFAULT_SYMBOL_MAPPINGS) {
      this.symbolMappings.set(mapping.symbol, mapping);
    }

    // Add custom mappings
    if (customMappings) {
      for (const mapping of customMappings) {
        this.symbolMappings.set(mapping.symbol, mapping);
      }
    }
  }

  // ============================================================================
  // SYMBOL MAPPING MANAGEMENT
  // ============================================================================

  /**
   * Add or update a symbol mapping
   */
  addSymbolMapping(mapping: SymbolEventMapping): void {
    this.symbolMappings.set(mapping.symbol, mapping);
    this.clearRelevanceCache(mapping.symbol);
    this.emit('mappingUpdated', { symbol: mapping.symbol });
  }

  /**
   * Remove a symbol mapping
   */
  removeSymbolMapping(symbol: string): boolean {
    const removed = this.symbolMappings.delete(symbol);
    if (removed) {
      this.clearRelevanceCache(symbol);
      this.emit('mappingRemoved', { symbol });
    }
    return removed;
  }

  /**
   * Get mapping for a symbol
   */
  getSymbolMapping(symbol: string): SymbolEventMapping | undefined {
    return this.symbolMappings.get(symbol);
  }

  /**
   * Get all configured symbols
   */
  getConfiguredSymbols(): string[] {
    return Array.from(this.symbolMappings.keys());
  }

  // ============================================================================
  // EVENT MAPPING
  // ============================================================================

  /**
   * Map events to a specific symbol
   * Requirement 1.1, 1.2: Connect symbols with prediction markets
   */
  mapEventsToSymbol(
    symbol: string,
    events: PredictionMarketEvent[]
  ): SymbolMappingResult {
    const mapping = this.symbolMappings.get(symbol);
    
    if (!mapping) {
      // Create a basic mapping for unknown symbols
      return this.createBasicMapping(symbol, events);
    }

    const relevantEvents: EventRelevance[] = [];

    for (const event of events) {
      const relevance = this.calculateEventRelevance(event, mapping);
      if (relevance.relevanceScore > 0) {
        relevantEvents.push(relevance);
      }
    }

    // Sort by relevance score (highest first)
    relevantEvents.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Calculate total relevance
    const totalRelevance = relevantEvents.reduce(
      (sum, r) => sum + r.relevanceScore,
      0
    );

    // Determine dominant category
    const dominantCategory = this.findDominantCategory(relevantEvents);

    return {
      symbol,
      events: relevantEvents,
      totalRelevance,
      dominantCategory
    };
  }

  /**
   * Calculate relevance score for an event relative to a symbol mapping
   */
  private calculateEventRelevance(
    event: PredictionMarketEvent,
    mapping: SymbolEventMapping
  ): EventRelevance {
    let relevanceScore = 0;
    const matchDetails: string[] = [];
    let matchType: 'direct' | 'keyword' | 'category' | 'correlated' = 'category';

    // Check for direct event match (highest priority)
    if (mapping.directEvents.includes(event.id)) {
      relevanceScore += 50;
      matchDetails.push('Direct event match');
      matchType = 'direct';
    }

    // Check keyword matches
    const eventText = `${event.title} ${event.description}`.toLowerCase();
    let keywordMatches = 0;
    
    for (const keyword of mapping.keywords) {
      if (eventText.includes(keyword.toLowerCase())) {
        keywordMatches++;
        matchDetails.push(`Keyword: ${keyword}`);
      }
    }

    if (keywordMatches > 0) {
      // More keyword matches = higher relevance
      relevanceScore += Math.min(30, keywordMatches * 10);
      if (matchType !== 'direct') {
        matchType = 'keyword';
      }
    }

    // Check category match
    if (mapping.categories.includes(event.category)) {
      relevanceScore += 15;
      matchDetails.push(`Category: ${event.category}`);
      if (matchType !== 'direct' && matchType !== 'keyword') {
        matchType = 'category';
      }
    }

    // Apply impact level multiplier
    const impactMultiplier = this.getImpactMultiplier(event.impact);
    relevanceScore = Math.round(relevanceScore * impactMultiplier);

    // Apply time proximity boost (events resolving soon are more relevant)
    const timeBoost = this.calculateTimeProximityBoost(event.resolution);
    relevanceScore = Math.round(relevanceScore * timeBoost);

    // Cap at 100
    relevanceScore = Math.min(100, relevanceScore);

    return {
      event,
      symbol: mapping.symbol,
      relevanceScore,
      matchType,
      matchDetails
    };
  }

  /**
   * Create basic mapping for unknown symbols
   */
  private createBasicMapping(
    symbol: string,
    events: PredictionMarketEvent[]
  ): SymbolMappingResult {
    // Extract base asset from symbol (e.g., BTC from BTCUSDT)
    const baseAsset = symbol.replace(/USDT|USD|BUSD|USDC/i, '').toLowerCase();
    
    const relevantEvents: EventRelevance[] = [];

    for (const event of events) {
      const eventText = `${event.title} ${event.description}`.toLowerCase();
      
      if (eventText.includes(baseAsset)) {
        relevantEvents.push({
          event,
          symbol,
          relevanceScore: 30,
          matchType: 'keyword',
          matchDetails: [`Base asset match: ${baseAsset}`]
        });
      } else if (event.category === EventCategory.CRYPTO_PRICE) {
        relevantEvents.push({
          event,
          symbol,
          relevanceScore: 10,
          matchType: 'category',
          matchDetails: ['General crypto category']
        });
      }
    }

    relevantEvents.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return {
      symbol,
      events: relevantEvents,
      totalRelevance: relevantEvents.reduce((sum, r) => sum + r.relevanceScore, 0),
      dominantCategory: EventCategory.CRYPTO_PRICE
    };
  }

  // ============================================================================
  // BTC-SPECIFIC EVENT DETECTION
  // ============================================================================

  /**
   * Detect BTC crash-related events
   * Requirement 1.6: BTC Crash probability detection
   */
  detectBTCCrashEvents(events: PredictionMarketEvent[]): PredictionMarketEvent[] {
    return events.filter(event => {
      const eventText = `${event.title} ${event.description}`.toLowerCase();
      return BTC_CRASH_PATTERNS.some(pattern => eventText.includes(pattern));
    });
  }

  /**
   * Detect BTC ATH-related events
   * Requirement 1.7: BTC ATH probability detection
   */
  detectBTCATHEvents(events: PredictionMarketEvent[]): PredictionMarketEvent[] {
    return events.filter(event => {
      const eventText = `${event.title} ${event.description}`.toLowerCase();
      return BTC_ATH_PATTERNS.some(pattern => eventText.includes(pattern));
    });
  }

  /**
   * Get highest BTC crash probability from events
   */
  getHighestBTCCrashProbability(events: PredictionMarketEvent[]): number {
    const crashEvents = this.detectBTCCrashEvents(events);
    if (crashEvents.length === 0) return 0;
    return Math.max(...crashEvents.map(e => e.probability));
  }

  /**
   * Get highest BTC ATH probability from events
   */
  getHighestBTCATHProbability(events: PredictionMarketEvent[]): number {
    const athEvents = this.detectBTCATHEvents(events);
    if (athEvents.length === 0) return 0;
    return Math.max(...athEvents.map(e => e.probability));
  }

  // ============================================================================
  // CATEGORY ANALYSIS
  // ============================================================================

  /**
   * Find the dominant category among relevant events
   */
  private findDominantCategory(events: EventRelevance[]): EventCategory | null {
    if (events.length === 0) return null;

    const categoryScores = new Map<EventCategory, number>();

    for (const relevance of events) {
      const category = relevance.event.category;
      const currentScore = categoryScores.get(category) || 0;
      categoryScores.set(category, currentScore + relevance.relevanceScore);
    }

    let dominantCategory: EventCategory | null = null;
    let highestScore = 0;

    for (const [category, score] of categoryScores) {
      if (score > highestScore) {
        highestScore = score;
        dominantCategory = category;
      }
    }

    return dominantCategory;
  }

  /**
   * Get events by category
   */
  filterEventsByCategory(
    events: PredictionMarketEvent[],
    categories: EventCategory[]
  ): PredictionMarketEvent[] {
    return events.filter(event => categories.includes(event.category));
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get impact level multiplier
   */
  private getImpactMultiplier(impact: ImpactLevel): number {
    switch (impact) {
      case ImpactLevel.EXTREME:
        return 1.5;
      case ImpactLevel.HIGH:
        return 1.3;
      case ImpactLevel.MEDIUM:
        return 1.1;
      case ImpactLevel.LOW:
      default:
        return 1.0;
    }
  }

  /**
   * Calculate time proximity boost
   * Events resolving within 24 hours get higher relevance
   */
  private calculateTimeProximityBoost(resolution: Date): number {
    const now = new Date();
    const hoursUntilResolution = (resolution.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilResolution <= 0) {
      return 0.5; // Past events are less relevant
    }

    if (hoursUntilResolution <= 6) {
      return 1.5; // Very imminent
    }

    if (hoursUntilResolution <= 24) {
      return 1.3; // Within a day
    }

    if (hoursUntilResolution <= 72) {
      return 1.1; // Within 3 days
    }

    return 1.0; // Default
  }

  /**
   * Clear relevance cache for a symbol
   */
  private clearRelevanceCache(symbol: string): void {
    this.relevanceCache.delete(symbol);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.eventCache.clear();
    this.relevanceCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Get mapping statistics
   */
  getStats(): {
    totalSymbols: number;
    cachedEvents: number;
    cachedRelevances: number;
  } {
    return {
      totalSymbols: this.symbolMappings.size,
      cachedEvents: this.eventCache.size,
      cachedRelevances: this.relevanceCache.size
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearAllCaches();
    this.removeAllListeners();
  }
}
