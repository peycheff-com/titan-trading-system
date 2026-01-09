/**
 * News/Sentiment Auto-Proxy Ingestion
 * 
 * Automatically ingests news sentiment to update proxy scores autonomously.
 * Polls financial news APIs and performs NLP sentiment scoring.
 * 
 * Requirements: 45.1-45.6
 * 
 * @module NewsIngestion
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} NewsItem
 * @property {string} id - Unique identifier for the news item
 * @property {string} title - News headline
 * @property {string} description - News description/summary
 * @property {string} source - News source
 * @property {string} publishedAt - ISO timestamp of publication
 * @property {string[]} keywords - Extracted keywords
 */

/**
 * @typedef {Object} SentimentResult
 * @property {number} score - Sentiment score: -1 (bearish), 0 (neutral), +1 (bullish)
 * @property {number} confidence - Confidence level 0-1
 * @property {string[]} matchedKeywords - Keywords that influenced the score
 * @property {string} category - Category: 'fed', 'earnings', 'general'
 */

/**
 * @typedef {Object} ProxyState
 * @property {number} fed_proxy - Fed/monetary policy proxy: -1, 0, +1
 * @property {number} earnings_proxy - Earnings/corporate proxy: -1, 0, +1
 * @property {number} general_proxy - General market sentiment: -1, 0, +1
 * @property {string} last_update - ISO timestamp of last update
 * @property {string} source - 'auto' or 'manual'
 */

/**
 * @typedef {Object} NewsIngestionStatus
 * @property {boolean} is_running - Whether polling is active
 * @property {number} poll_interval_ms - Polling interval in milliseconds
 * @property {string} last_poll - ISO timestamp of last poll
 * @property {number} news_processed - Total news items processed
 * @property {ProxyState} current_proxies - Current proxy values
 * @property {boolean} api_available - Whether news API is available
 * @property {string[]} configured_sources - Configured news sources
 */

// High-impact keywords for sentiment detection (Requirement 45.3)
const FED_KEYWORDS = [
  'fed', 'federal reserve', 'fomc', 'rate', 'interest rate', 'rate hike', 'rate cut',
  'inflation', 'cpi', 'ppi', 'monetary policy', 'quantitative', 'tightening', 'easing',
  'powell', 'yellen', 'treasury', 'bond', 'yield', 'hawkish', 'dovish'
];

const EARNINGS_KEYWORDS = [
  'earnings', 'revenue', 'profit', 'eps', 'guidance', 'forecast', 'quarterly',
  'beat', 'miss', 'outlook', 'growth', 'decline', 'layoff', 'restructuring',
  'acquisition', 'merger', 'ipo', 'buyback', 'dividend'
];

// Sentiment indicators
const BULLISH_INDICATORS = [
  'surge', 'soar', 'rally', 'gain', 'rise', 'jump', 'climb', 'bullish', 'optimistic',
  'beat', 'exceed', 'strong', 'growth', 'recovery', 'positive', 'upbeat', 'boom',
  'breakthrough', 'record high', 'all-time high', 'outperform', 'upgrade'
];

const BEARISH_INDICATORS = [
  'plunge', 'crash', 'drop', 'fall', 'decline', 'sink', 'bearish', 'pessimistic',
  'miss', 'weak', 'slowdown', 'recession', 'negative', 'downbeat', 'bust',
  'crisis', 'record low', 'underperform', 'downgrade', 'warning', 'concern',
  'fear', 'uncertainty', 'volatile', 'sell-off', 'selloff'
];


/**
 * NewsIngestion class - Automated news sentiment proxy
 * 
 * Key responsibilities:
 * 1. Poll financial news APIs every 5 minutes (Requirement 45.1)
 * 2. Score sentiment using NLP: -1, 0, +1 (Requirement 45.2)
 * 3. Detect high-impact news and update fed_proxy/earnings_proxy (Requirement 45.3)
 * 4. Compute aggregate sentiment from social media if available (Requirement 45.4)
 * 5. Override manual proxy with automated value and log (Requirement 45.5)
 * 6. Fallback to manual proxy on API failure (Requirement 45.6)
 * 
 * @extends EventEmitter
 * @fires NewsIngestion#proxy_update - When proxy values are updated
 * @fires NewsIngestion#news_processed - When news items are processed
 * @fires NewsIngestion#api_error - When API call fails
 * @fires NewsIngestion#fallback_manual - When falling back to manual proxy
 */
export class NewsIngestion extends EventEmitter {
  /**
   * Create a new NewsIngestion instance
   * 
   * @param {Object} options - Configuration options
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.pollIntervalMs=300000] - Poll interval in ms (Requirement 45.1: 5 minutes)
   * @param {string} [options.newsApiKey] - API key for news service
   * @param {string} [options.newsApiUrl] - Base URL for news API
   * @param {Function} [options.fetchNews] - Custom function to fetch news (for testing/custom APIs)
   * @param {Object} [options.manualProxies] - Manual proxy values to use as fallback
   * @param {number} [options.sentimentDecayMs=3600000] - How long sentiment stays valid (1 hour)
   * @param {number} [options.maxNewsItems=50] - Maximum news items to process per poll
   */
  constructor(options = {}) {
    super();
    
    /** @type {Function} Logger function */
    this.logger = options.logger || console;
    
    /** @type {number} Poll interval in milliseconds (Requirement 45.1: 5 minutes) */
    this.pollIntervalMs = options.pollIntervalMs || 300000;
    
    /** @type {string|null} News API key */
    this.newsApiKey = options.newsApiKey || process.env.NEWS_API_KEY || null;
    
    /** @type {string} News API base URL */
    this.newsApiUrl = options.newsApiUrl || process.env.NEWS_API_URL || 'https://newsapi.org/v2';
    
    /** @type {Function|null} Custom fetch function */
    this.fetchNews = options.fetchNews || null;
    
    /** @type {Object} Manual proxy values for fallback (Requirement 45.6) */
    this.manualProxies = options.manualProxies || {
      fed_proxy: 0,
      earnings_proxy: 0,
      general_proxy: 0,
    };
    
    /** @type {number} Sentiment decay time in milliseconds */
    this.sentimentDecayMs = options.sentimentDecayMs || 3600000;
    
    /** @type {number} Maximum news items to process per poll */
    this.maxNewsItems = options.maxNewsItems || 50;
    
    /** @type {ProxyState} Current proxy state */
    this._currentProxies = {
      fed_proxy: 0,
      earnings_proxy: 0,
      general_proxy: 0,
      last_update: null,
      source: 'manual',
    };
    
    /** @type {boolean} Whether polling is active */
    this._isRunning = false;
    
    /** @type {NodeJS.Timeout|null} Poll timer */
    this._pollTimer = null;
    
    /** @type {string|null} Last poll timestamp */
    this._lastPoll = null;
    
    /** @type {number} Total news items processed */
    this._newsProcessed = 0;
    
    /** @type {boolean} Whether API is available */
    this._apiAvailable = true;
    
    /** @type {number} Consecutive API failures */
    this._consecutiveFailures = 0;
    
    /** @type {Set<string>} Processed news IDs to avoid duplicates */
    this._processedIds = new Set();
    
    /** @type {NewsItem[]} Recent news items for aggregation */
    this._recentNews = [];
  }

  /**
   * Start polling for news
   * Requirement 45.1: Poll financial news APIs every 5 minutes
   */
  start() {
    if (this._isRunning) {
      this.logger.warn?.({}, 'NewsIngestion already running');
      return;
    }
    
    this._isRunning = true;
    this.logger.info?.({
      poll_interval_ms: this.pollIntervalMs,
      api_configured: !!this.newsApiKey || !!this.fetchNews,
    }, 'NewsIngestion started');
    
    // Initial poll
    this._poll();
    
    // Set up periodic polling
    this._pollTimer = setInterval(() => {
      this._poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling for news
   */
  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._isRunning = false;
    this.logger.info?.({}, 'NewsIngestion stopped');
  }

  /**
   * Poll for news and update proxies
   * @private
   */
  async _poll() {
    this._lastPoll = new Date().toISOString();
    
    try {
      const newsItems = await this._fetchNewsItems();
      
      if (newsItems && newsItems.length > 0) {
        this._apiAvailable = true;
        this._consecutiveFailures = 0;
        
        // Process news items
        const sentimentResults = this._processNewsItems(newsItems);
        
        // Update proxies based on sentiment
        this._updateProxiesFromSentiment(sentimentResults);
        
        this.emit('news_processed', {
          count: newsItems.length,
          sentiment_results: sentimentResults,
          timestamp: this._lastPoll,
        });
      }
    } catch (error) {
      this._handleApiError(error);
    }
  }

  /**
   * Fetch news items from API
   * @returns {Promise<NewsItem[]>} Array of news items
   * @private
   */
  async _fetchNewsItems() {
    // Use custom fetch function if provided (for testing)
    if (this.fetchNews) {
      return await this.fetchNews();
    }
    
    // Check if API key is configured
    if (!this.newsApiKey) {
      this.logger.debug?.({}, 'No news API key configured, using manual proxies');
      return [];
    }
    
    // Fetch from news API
    const url = `${this.newsApiUrl}/everything?q=finance+OR+economy+OR+fed+OR+earnings&language=en&sortBy=publishedAt&pageSize=${this.maxNewsItems}&apiKey=${this.newsApiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`News API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'ok') {
      throw new Error(`News API error: ${data.message || 'Unknown error'}`);
    }
    
    // Transform to NewsItem format
    return (data.articles || []).map((article, index) => ({
      id: article.url || `news_${Date.now()}_${index}`,
      title: article.title || '',
      description: article.description || '',
      source: article.source?.name || 'Unknown',
      publishedAt: article.publishedAt || new Date().toISOString(),
      keywords: this._extractKeywords(article.title + ' ' + (article.description || '')),
    }));
  }

  /**
   * Extract keywords from text
   * @param {string} text - Text to extract keywords from
   * @returns {string[]} Array of keywords
   * @private
   */
  _extractKeywords(text) {
    const lowerText = text.toLowerCase();
    const keywords = [];
    
    // Check for Fed keywords
    for (const keyword of FED_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        keywords.push(keyword);
      }
    }
    
    // Check for earnings keywords
    for (const keyword of EARNINGS_KEYWORDS) {
      if (lowerText.includes(keyword)) {
        keywords.push(keyword);
      }
    }
    
    return keywords;
  }

  /**
   * Process news items and calculate sentiment
   * Requirement 45.2: Score sentiment using NLP: -1, 0, +1
   * 
   * @param {NewsItem[]} newsItems - Array of news items
   * @returns {SentimentResult[]} Array of sentiment results
   * @private
   */
  _processNewsItems(newsItems) {
    const results = [];
    
    for (const item of newsItems) {
      // Skip already processed items
      if (this._processedIds.has(item.id)) {
        continue;
      }
      
      this._processedIds.add(item.id);
      this._newsProcessed++;
      
      // Calculate sentiment
      const sentiment = this._analyzeSentiment(item);
      results.push(sentiment);
      
      // Store recent news for aggregation
      this._recentNews.push(item);
    }
    
    // Trim processed IDs set to prevent memory growth
    if (this._processedIds.size > 10000) {
      const idsArray = Array.from(this._processedIds);
      this._processedIds = new Set(idsArray.slice(-5000));
    }
    
    // Trim recent news
    const cutoffTime = Date.now() - this.sentimentDecayMs;
    this._recentNews = this._recentNews.filter(
      item => new Date(item.publishedAt).getTime() > cutoffTime
    );
    
    return results;
  }

  /**
   * Analyze sentiment of a news item
   * Requirement 45.2: NLP sentiment scoring
   * 
   * @param {NewsItem} item - News item to analyze
   * @returns {SentimentResult} Sentiment result
   * @private
   */
  _analyzeSentiment(item) {
    const text = (item.title + ' ' + item.description).toLowerCase();
    
    // Count bullish and bearish indicators
    let bullishCount = 0;
    let bearishCount = 0;
    const matchedKeywords = [];
    
    for (const indicator of BULLISH_INDICATORS) {
      if (text.includes(indicator)) {
        bullishCount++;
        matchedKeywords.push(indicator);
      }
    }
    
    for (const indicator of BEARISH_INDICATORS) {
      if (text.includes(indicator)) {
        bearishCount++;
        matchedKeywords.push(indicator);
      }
    }
    
    // Determine category based on keywords (Requirement 45.3)
    let category = 'general';
    const hasFedKeywords = item.keywords.some(k => FED_KEYWORDS.includes(k));
    const hasEarningsKeywords = item.keywords.some(k => EARNINGS_KEYWORDS.includes(k));
    
    if (hasFedKeywords) {
      category = 'fed';
    } else if (hasEarningsKeywords) {
      category = 'earnings';
    }
    
    // Calculate sentiment score: -1, 0, +1
    let score = 0;
    const totalIndicators = bullishCount + bearishCount;
    
    if (totalIndicators > 0) {
      const netSentiment = bullishCount - bearishCount;
      if (netSentiment > 0) {
        score = 1;
      } else if (netSentiment < 0) {
        score = -1;
      }
    }
    
    // Calculate confidence based on indicator count
    const confidence = Math.min(totalIndicators / 5, 1);
    
    return {
      score,
      confidence,
      matchedKeywords,
      category,
    };
  }

  /**
   * Update proxy values based on sentiment results
   * Requirement 45.3: Update fed_proxy or earnings_proxy automatically
   * Requirement 45.5: Override manual proxy with automated value
   * 
   * @param {SentimentResult[]} sentimentResults - Array of sentiment results
   * @private
   */
  _updateProxiesFromSentiment(sentimentResults) {
    if (sentimentResults.length === 0) {
      return;
    }
    
    // Aggregate sentiment by category
    const fedSentiments = sentimentResults.filter(r => r.category === 'fed');
    const earningsSentiments = sentimentResults.filter(r => r.category === 'earnings');
    const generalSentiments = sentimentResults.filter(r => r.category === 'general');
    
    const oldProxies = { ...this._currentProxies };
    
    // Calculate weighted average sentiment for each category
    if (fedSentiments.length > 0) {
      this._currentProxies.fed_proxy = this._calculateWeightedSentiment(fedSentiments);
    }
    
    if (earningsSentiments.length > 0) {
      this._currentProxies.earnings_proxy = this._calculateWeightedSentiment(earningsSentiments);
    }
    
    if (generalSentiments.length > 0) {
      this._currentProxies.general_proxy = this._calculateWeightedSentiment(generalSentiments);
    }
    
    this._currentProxies.last_update = new Date().toISOString();
    this._currentProxies.source = 'auto';
    
    // Log override if different from manual (Requirement 45.5)
    const hasChanged = 
      oldProxies.fed_proxy !== this._currentProxies.fed_proxy ||
      oldProxies.earnings_proxy !== this._currentProxies.earnings_proxy ||
      oldProxies.general_proxy !== this._currentProxies.general_proxy;
    
    if (hasChanged) {
      this.logger.info?.({
        old_proxies: {
          fed_proxy: oldProxies.fed_proxy,
          earnings_proxy: oldProxies.earnings_proxy,
          general_proxy: oldProxies.general_proxy,
        },
        new_proxies: {
          fed_proxy: this._currentProxies.fed_proxy,
          earnings_proxy: this._currentProxies.earnings_proxy,
          general_proxy: this._currentProxies.general_proxy,
        },
        source: 'auto',
        news_count: sentimentResults.length,
      }, 'Proxy values updated from news sentiment');
      
      this.emit('proxy_update', {
        proxies: { ...this._currentProxies },
        old_proxies: oldProxies,
        sentiment_count: sentimentResults.length,
        timestamp: this._currentProxies.last_update,
      });
    }
  }

  /**
   * Calculate weighted sentiment from results
   * @param {SentimentResult[]} results - Sentiment results
   * @returns {number} Weighted sentiment: -1, 0, or +1
   * @private
   */
  _calculateWeightedSentiment(results) {
    if (results.length === 0) {
      return 0;
    }
    
    // Weight by confidence
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const result of results) {
      const weight = result.confidence || 0.5;
      weightedSum += result.score * weight;
      totalWeight += weight;
    }
    
    if (totalWeight === 0) {
      return 0;
    }
    
    const avgSentiment = weightedSum / totalWeight;
    
    // Convert to discrete -1, 0, +1
    if (avgSentiment > 0.3) {
      return 1;
    } else if (avgSentiment < -0.3) {
      return -1;
    }
    return 0;
  }

  /**
   * Handle API error and fallback to manual
   * Requirement 45.6: Fallback to manual proxy on API failure
   * 
   * @param {Error} error - The error that occurred
   * @private
   */
  _handleApiError(error) {
    this._consecutiveFailures++;
    this._apiAvailable = false;
    
    this.logger.error?.({
      error: error.message,
      consecutive_failures: this._consecutiveFailures,
    }, 'News API error');
    
    this.emit('api_error', {
      error: error.message,
      consecutive_failures: this._consecutiveFailures,
      timestamp: new Date().toISOString(),
    });
    
    // Fallback to manual proxies (Requirement 45.6)
    if (this._consecutiveFailures >= 3) {
      this._fallbackToManual();
    }
  }

  /**
   * Fallback to manual proxy values
   * Requirement 45.6: Fallback to manual proxy inputs
   * @private
   */
  _fallbackToManual() {
    const oldProxies = { ...this._currentProxies };
    
    this._currentProxies = {
      fed_proxy: this.manualProxies.fed_proxy,
      earnings_proxy: this.manualProxies.earnings_proxy,
      general_proxy: this.manualProxies.general_proxy,
      last_update: new Date().toISOString(),
      source: 'manual',
    };
    
    this.logger.warn?.({
      old_proxies: oldProxies,
      manual_proxies: this._currentProxies,
    }, 'Falling back to manual proxy values due to API failures');
    
    this.emit('fallback_manual', {
      proxies: { ...this._currentProxies },
      reason: 'API_UNAVAILABLE',
      consecutive_failures: this._consecutiveFailures,
      timestamp: this._currentProxies.last_update,
    });
  }

  /**
   * Set manual proxy values (for fallback)
   * @param {Object} proxies - Manual proxy values
   * @param {number} [proxies.fed_proxy] - Fed proxy value
   * @param {number} [proxies.earnings_proxy] - Earnings proxy value
   * @param {number} [proxies.general_proxy] - General proxy value
   */
  setManualProxies(proxies) {
    if (proxies.fed_proxy !== undefined) {
      this.manualProxies.fed_proxy = this._clampProxy(proxies.fed_proxy);
    }
    if (proxies.earnings_proxy !== undefined) {
      this.manualProxies.earnings_proxy = this._clampProxy(proxies.earnings_proxy);
    }
    if (proxies.general_proxy !== undefined) {
      this.manualProxies.general_proxy = this._clampProxy(proxies.general_proxy);
    }
    
    this.logger.info?.({ manual_proxies: this.manualProxies }, 'Manual proxies updated');
  }

  /**
   * Clamp proxy value to -1, 0, or +1
   * @param {number} value - Value to clamp
   * @returns {number} Clamped value
   * @private
   */
  _clampProxy(value) {
    if (value > 0) return 1;
    if (value < 0) return -1;
    return 0;
  }

  /**
   * Get current proxy values
   * @returns {ProxyState} Current proxy state
   */
  getProxies() {
    return { ...this._currentProxies };
  }

  /**
   * Get fed proxy value
   * @returns {number} Fed proxy: -1, 0, or +1
   */
  getFedProxy() {
    return this._currentProxies.fed_proxy;
  }

  /**
   * Get earnings proxy value
   * @returns {number} Earnings proxy: -1, 0, or +1
   */
  getEarningsProxy() {
    return this._currentProxies.earnings_proxy;
  }

  /**
   * Get general proxy value
   * @returns {number} General proxy: -1, 0, or +1
   */
  getGeneralProxy() {
    return this._currentProxies.general_proxy;
  }

  /**
   * Get current status
   * @returns {NewsIngestionStatus} Current status
   */
  getStatus() {
    return {
      is_running: this._isRunning,
      poll_interval_ms: this.pollIntervalMs,
      last_poll: this._lastPoll,
      news_processed: this._newsProcessed,
      current_proxies: { ...this._currentProxies },
      api_available: this._apiAvailable,
      consecutive_failures: this._consecutiveFailures,
      configured_sources: this.newsApiKey ? ['newsapi.org'] : ['manual'],
    };
  }

  /**
   * Check if polling is running
   * @returns {boolean} True if running
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * Check if API is available
   * @returns {boolean} True if API is available
   */
  isApiAvailable() {
    return this._apiAvailable;
  }

  /**
   * Force a poll (for testing)
   */
  async forcePoll() {
    await this._poll();
  }

  /**
   * Reset API failure count (for testing or after API recovery)
   */
  resetApiFailures() {
    this._consecutiveFailures = 0;
    this._apiAvailable = true;
    this.logger.info?.({}, 'API failure count reset');
  }

  /**
   * Inject news items directly (for testing)
   * @param {NewsItem[]} newsItems - News items to process
   * @returns {SentimentResult[]} Sentiment results
   */
  injectNews(newsItems) {
    const results = this._processNewsItems(newsItems);
    this._updateProxiesFromSentiment(results);
    return results;
  }

  /**
   * Clear processed news IDs (for testing)
   */
  clearProcessedIds() {
    this._processedIds.clear();
    this._recentNews = [];
  }
}

export default NewsIngestion;
