/**
 * Polymarket API Client for Titan Phase 2 - 2026 Modernization
 * 
 * Provides REST API integration with Polymarket prediction markets
 * with authentication and rate limiting support.
 * 
 * Requirement 1.1: Connect to Polymarket API and fetch active prediction markets
 * for BTC price targets, Fed rate decisions, and major crypto regulatory events
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
 * Polymarket API response for a market
 */
export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  liquidity: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  category: string;
  tags: string[];
}

/**
 * Polymarket API response wrapper
 */
export interface PolymarketResponse<T> {
  data: T;
  count?: number;
  next?: string;
}

/**
 * Rate limiter state
 */
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // tokens per second
}

/**
 * Polymarket client configuration
 */
export interface PolymarketClientConfig {
  apiKey: string;
  baseUrl?: string;
  maxRequestsPerSecond?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * API request options
 */
interface RequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

// ============================================================================
// POLYMARKET CLIENT
// ============================================================================

/**
 * Polymarket API Client
 * 
 * Handles all communication with the Polymarket prediction market API
 * including authentication, rate limiting, and error handling.
 */
export class PolymarketClient extends EventEmitter {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private rateLimiter: RateLimiterState;
  private isConnected: boolean = false;
  private lastError: Error | null = null;

  // Cache for market data
  private marketCache: Map<string, { data: PolymarketMarket; timestamp: number }> = new Map();
  private cacheTTL: number = 30000; // 30 seconds

  constructor(config: PolymarketClientConfig) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://gamma-api.polymarket.com';
    this.timeout = config.timeout || 10000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Initialize rate limiter (default: 10 requests per second)
    const maxRequestsPerSecond = config.maxRequestsPerSecond || 10;
    this.rateLimiter = {
      tokens: maxRequestsPerSecond,
      lastRefill: Date.now(),
      maxTokens: maxRequestsPerSecond,
      refillRate: maxRequestsPerSecond
    };
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Test connection to Polymarket API
   */
  async connect(): Promise<boolean> {
    try {
      // Test API connectivity with a simple request
      await this.fetchMarkets({ limit: 1 });
      this.isConnected = true;
      this.lastError = null;
      this.emit('connected');
      return true;
    } catch (error) {
      this.isConnected = false;
      this.lastError = error as Error;
      this.emit('connectionError', error);
      return false;
    }
  }

  /**
   * Check if client is connected
   */
  getConnectionStatus(): { connected: boolean; lastError: Error | null } {
    return {
      connected: this.isConnected,
      lastError: this.lastError
    };
  }

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  /**
   * Acquire a rate limit token (blocks if rate limited)
   */
  private async acquireRateLimitToken(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this.rateLimiter.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.rateLimiter.refillRate;
    
    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + tokensToAdd
    );
    this.rateLimiter.lastRefill = now;

    // Wait if no tokens available
    if (this.rateLimiter.tokens < 1) {
      const waitTime = (1 - this.rateLimiter.tokens) / this.rateLimiter.refillRate * 1000;
      this.emit('rateLimited', { waitTime });
      await this.sleep(waitTime);
      return this.acquireRateLimitToken();
    }

    // Consume a token
    this.rateLimiter.tokens -= 1;
  }

  /**
   * Get current rate limiter status
   */
  getRateLimiterStatus(): { availableTokens: number; maxTokens: number } {
    return {
      availableTokens: Math.floor(this.rateLimiter.tokens),
      maxTokens: this.rateLimiter.maxTokens
    };
  }

  // ============================================================================
  // API METHODS
  // ============================================================================

  /**
   * Fetch markets from Polymarket API
   * Requirement 1.1: Fetch active prediction markets
   */
  async fetchMarkets(params?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    closed?: boolean;
    tag?: string;
  }): Promise<PolymarketMarket[]> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());
    if (params?.active !== undefined) queryParams.set('active', params.active.toString());
    if (params?.closed !== undefined) queryParams.set('closed', params.closed.toString());
    if (params?.tag) queryParams.set('tag', params.tag);

    const url = `/markets?${queryParams.toString()}`;
    const response = await this.makeRequest<PolymarketMarket[]>(url);
    return response;
  }

  /**
   * Fetch a specific market by ID
   */
  async fetchMarket(marketId: string): Promise<PolymarketMarket | null> {
    // Check cache first
    const cached = this.marketCache.get(marketId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const market = await this.makeRequest<PolymarketMarket>(`/markets/${marketId}`);
      
      // Update cache
      this.marketCache.set(marketId, { data: market, timestamp: Date.now() });
      
      return market;
    } catch (error) {
      if ((error as Error).message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Search markets by query
   */
  async searchMarkets(query: string, limit: number = 20): Promise<PolymarketMarket[]> {
    const queryParams = new URLSearchParams();
    queryParams.set('_q', query);
    queryParams.set('limit', limit.toString());
    queryParams.set('active', 'true');

    const url = `/markets?${queryParams.toString()}`;
    return this.makeRequest<PolymarketMarket[]>(url);
  }

  /**
   * Fetch crypto-related markets
   * Requirement 1.1: BTC price targets
   */
  async fetchCryptoMarkets(): Promise<PolymarketMarket[]> {
    const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto'];
    const results: PolymarketMarket[] = [];

    for (const keyword of cryptoKeywords) {
      try {
        const markets = await this.searchMarkets(keyword, 10);
        results.push(...markets);
      } catch (error) {
        this.emit('searchError', { keyword, error });
      }
    }

    // Deduplicate by ID
    const uniqueMarkets = new Map<string, PolymarketMarket>();
    for (const market of results) {
      uniqueMarkets.set(market.id, market);
    }

    return Array.from(uniqueMarkets.values());
  }

  /**
   * Fetch Fed/macro-related markets
   * Requirement 1.1: Fed rate decisions
   */
  async fetchMacroMarkets(): Promise<PolymarketMarket[]> {
    const macroKeywords = ['fed', 'federal reserve', 'interest rate', 'inflation', 'recession'];
    const results: PolymarketMarket[] = [];

    for (const keyword of macroKeywords) {
      try {
        const markets = await this.searchMarkets(keyword, 10);
        results.push(...markets);
      } catch (error) {
        this.emit('searchError', { keyword, error });
      }
    }

    // Deduplicate by ID
    const uniqueMarkets = new Map<string, PolymarketMarket>();
    for (const market of results) {
      uniqueMarkets.set(market.id, market);
    }

    return Array.from(uniqueMarkets.values());
  }

  /**
   * Fetch regulatory-related markets
   * Requirement 1.1: Major crypto regulatory events
   */
  async fetchRegulatoryMarkets(): Promise<PolymarketMarket[]> {
    const regulatoryKeywords = ['sec', 'regulation', 'etf', 'approval', 'ban'];
    const results: PolymarketMarket[] = [];

    for (const keyword of regulatoryKeywords) {
      try {
        const markets = await this.searchMarkets(keyword, 10);
        results.push(...markets);
      } catch (error) {
        this.emit('searchError', { keyword, error });
      }
    }

    // Deduplicate by ID
    const uniqueMarkets = new Map<string, PolymarketMarket>();
    for (const market of results) {
      uniqueMarkets.set(market.id, market);
    }

    return Array.from(uniqueMarkets.values());
  }

  // ============================================================================
  // DATA TRANSFORMATION
  // ============================================================================

  /**
   * Convert Polymarket market to PredictionMarketEvent
   */
  convertToPredictionEvent(market: PolymarketMarket): PredictionMarketEvent {
    // Determine category based on tags and question
    const category = this.categorizeMarket(market);
    
    // Determine impact level based on volume and liquidity
    const impact = this.assessImpactLevel(market);
    
    // Get the "Yes" probability (first outcome price)
    const probability = parseFloat(market.outcomePrices[0] || '0') * 100;

    return {
      id: market.id,
      title: market.question,
      description: market.description || '',
      probability,
      volume: parseFloat(market.volume || '0'),
      liquidity: parseFloat(market.liquidity || '0'),
      category,
      impact,
      resolution: new Date(market.endDate),
      lastUpdate: new Date(),
      source: 'polymarket'
    };
  }

  /**
   * Categorize market based on content
   */
  private categorizeMarket(market: PolymarketMarket): EventCategory {
    const text = `${market.question} ${market.description || ''} ${market.tags?.join(' ') || ''}`.toLowerCase();

    if (text.includes('bitcoin') || text.includes('btc') || text.includes('ethereum') || 
        text.includes('eth') || text.includes('crypto')) {
      return EventCategory.CRYPTO_PRICE;
    }

    if (text.includes('fed') || text.includes('federal reserve') || 
        text.includes('interest rate') || text.includes('fomc')) {
      return EventCategory.FED_POLICY;
    }

    if (text.includes('sec') || text.includes('regulation') || 
        text.includes('etf') || text.includes('approval') || text.includes('ban')) {
      return EventCategory.REGULATORY;
    }

    if (text.includes('gdp') || text.includes('inflation') || 
        text.includes('recession') || text.includes('unemployment')) {
      return EventCategory.MACRO_ECONOMIC;
    }

    if (text.includes('war') || text.includes('election') || 
        text.includes('sanction') || text.includes('geopolitical')) {
      return EventCategory.GEOPOLITICAL;
    }

    return EventCategory.MACRO_ECONOMIC; // Default
  }

  /**
   * Assess impact level based on market metrics
   */
  private assessImpactLevel(market: PolymarketMarket): ImpactLevel {
    const volume = parseFloat(market.volume || '0');
    const liquidity = parseFloat(market.liquidity || '0');

    // High volume and liquidity = high impact
    if (volume > 1000000 && liquidity > 100000) {
      return ImpactLevel.EXTREME;
    }

    if (volume > 500000 && liquidity > 50000) {
      return ImpactLevel.HIGH;
    }

    if (volume > 100000 && liquidity > 10000) {
      return ImpactLevel.MEDIUM;
    }

    return ImpactLevel.LOW;
  }

  // ============================================================================
  // HTTP REQUEST HANDLING
  // ============================================================================

  /**
   * Make an authenticated API request with rate limiting and retries
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    // Acquire rate limit token
    await this.acquireRateLimitToken();

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add API key if configured
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: options.method || 'GET',
          headers,
          body: options.body,
          timeout: options.timeout || this.timeout
        });

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited by server
            const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
            this.emit('serverRateLimited', { retryAfter });
            await this.sleep(retryAfter * 1000);
            continue;
          }

          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this.isConnected = true;
        return data as T;

      } catch (error) {
        lastError = error as Error;
        this.emit('requestError', { endpoint, attempt, error });

        if (attempt < this.retryAttempts) {
          await this.sleep(this.retryDelay * attempt);
        }
      }
    }

    this.isConnected = false;
    this.lastError = lastError;
    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit & { timeout?: number }
  ): Promise<Response> {
    const { timeout = this.timeout, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear the market cache
   */
  clearCache(): void {
    this.marketCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttl: number } {
    return {
      size: this.marketCache.size,
      ttl: this.cacheTTL
    };
  }

  /**
   * Update cache TTL
   */
  setCacheTTL(ttl: number): void {
    this.cacheTTL = ttl;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearCache();
    this.removeAllListeners();
  }
}
