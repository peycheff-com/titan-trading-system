/**
 * Tests for NewsIngestion class
 * 
 * Requirements: 45.1-45.6
 */

import { jest } from '@jest/globals';
import { NewsIngestion } from './NewsIngestion.js';

describe('NewsIngestion', () => {
  let newsIngestion;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    
    newsIngestion = new NewsIngestion({
      logger: mockLogger,
      pollIntervalMs: 1000, // Short interval for testing
    });
  });

  afterEach(() => {
    newsIngestion.stop();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const ni = new NewsIngestion();
      expect(ni.pollIntervalMs).toBe(300000); // 5 minutes
      expect(ni.isRunning()).toBe(false);
      expect(ni.getProxies().fed_proxy).toBe(0);
      expect(ni.getProxies().earnings_proxy).toBe(0);
      expect(ni.getProxies().general_proxy).toBe(0);
    });

    it('should accept custom options', () => {
      const ni = new NewsIngestion({
        pollIntervalMs: 60000,
        manualProxies: { fed_proxy: 1, earnings_proxy: -1, general_proxy: 0 },
      });
      expect(ni.pollIntervalMs).toBe(60000);
      expect(ni.manualProxies.fed_proxy).toBe(1);
      expect(ni.manualProxies.earnings_proxy).toBe(-1);
    });
  });

  describe('start/stop', () => {
    it('should start and stop polling', () => {
      newsIngestion.start();
      expect(newsIngestion.isRunning()).toBe(true);
      
      newsIngestion.stop();
      expect(newsIngestion.isRunning()).toBe(false);
    });

    it('should warn if already running', () => {
      newsIngestion.start();
      newsIngestion.start();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('sentiment analysis', () => {
    it('should detect bullish sentiment', () => {
      const results = newsIngestion.injectNews([{
        id: 'test1',
        title: 'Markets surge on strong earnings beat',
        description: 'Stocks rally as companies exceed expectations',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: ['earnings'],
      }]);

      expect(results.length).toBe(1);
      expect(results[0].score).toBe(1);
      expect(results[0].category).toBe('earnings');
    });

    it('should detect bearish sentiment', () => {
      const results = newsIngestion.injectNews([{
        id: 'test2',
        title: 'Markets crash amid recession fears',
        description: 'Stocks plunge as economic concerns grow',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      expect(results.length).toBe(1);
      expect(results[0].score).toBe(-1);
    });

    it('should detect neutral sentiment', () => {
      const results = newsIngestion.injectNews([{
        id: 'test3',
        title: 'Markets unchanged today',
        description: 'Trading volume remains steady',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      expect(results.length).toBe(1);
      expect(results[0].score).toBe(0);
    });

    it('should categorize Fed-related news', () => {
      const results = newsIngestion.injectNews([{
        id: 'test4',
        title: 'Fed signals rate hike ahead',
        description: 'Federal Reserve hints at hawkish policy',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: ['fed', 'rate', 'hawkish'],
      }]);

      expect(results[0].category).toBe('fed');
    });

    it('should categorize earnings-related news', () => {
      const results = newsIngestion.injectNews([{
        id: 'test5',
        title: 'Tech company reports quarterly earnings',
        description: 'Revenue guidance exceeds expectations',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: ['earnings', 'revenue', 'guidance'],
      }]);

      expect(results[0].category).toBe('earnings');
    });
  });

  describe('proxy updates', () => {
    it('should update fed_proxy from Fed news (Requirement 45.3)', () => {
      newsIngestion.injectNews([{
        id: 'fed1',
        title: 'Fed announces rate cut, markets surge',
        description: 'Dovish policy boosts optimism',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: ['fed', 'rate', 'dovish'],
      }]);

      expect(newsIngestion.getFedProxy()).toBe(1);
    });

    it('should update earnings_proxy from earnings news (Requirement 45.3)', () => {
      newsIngestion.injectNews([{
        id: 'earn1',
        title: 'Major company misses earnings, stock plunges',
        description: 'Weak guidance causes concern',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: ['earnings', 'guidance'],
      }]);

      expect(newsIngestion.getEarningsProxy()).toBe(-1);
    });

    it('should emit proxy_update event', (done) => {
      newsIngestion.on('proxy_update', (data) => {
        expect(data.proxies).toBeDefined();
        expect(data.timestamp).toBeDefined();
        done();
      });

      newsIngestion.injectNews([{
        id: 'event1',
        title: 'Markets rally on positive news',
        description: 'Strong growth outlook',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);
    });

    it('should set source to auto when updated from news (Requirement 45.5)', () => {
      newsIngestion.injectNews([{
        id: 'auto1',
        title: 'Markets surge higher',
        description: 'Bullish sentiment prevails',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      expect(newsIngestion.getProxies().source).toBe('auto');
    });
  });

  describe('API fallback', () => {
    it('should fallback to manual proxies after 3 failures (Requirement 45.6)', async () => {
      const failingFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const ni = new NewsIngestion({
        logger: mockLogger,
        fetchNews: failingFetch,
        manualProxies: { fed_proxy: 1, earnings_proxy: -1, general_proxy: 0 },
      });

      // Trigger 3 failures
      await ni.forcePoll();
      await ni.forcePoll();
      await ni.forcePoll();

      expect(ni.getProxies().source).toBe('manual');
      expect(ni.getFedProxy()).toBe(1);
      expect(ni.getEarningsProxy()).toBe(-1);
    });

    it('should emit fallback_manual event', (done) => {
      const failingFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const ni = new NewsIngestion({
        logger: mockLogger,
        fetchNews: failingFetch,
      });

      ni.on('fallback_manual', (data) => {
        expect(data.reason).toBe('API_UNAVAILABLE');
        done();
      });

      // Trigger 3 failures
      ni.forcePoll().then(() => ni.forcePoll()).then(() => ni.forcePoll());
    });

    it('should emit api_error event on failure', (done) => {
      const failingFetch = jest.fn().mockRejectedValue(new Error('Network Error'));
      
      const ni = new NewsIngestion({
        logger: mockLogger,
        fetchNews: failingFetch,
      });

      ni.on('api_error', (data) => {
        expect(data.error).toBe('Network Error');
        done();
      });

      ni.forcePoll();
    });
  });

  describe('manual proxy management', () => {
    it('should set manual proxies', () => {
      newsIngestion.setManualProxies({
        fed_proxy: 1,
        earnings_proxy: -1,
        general_proxy: 0,
      });

      expect(newsIngestion.manualProxies.fed_proxy).toBe(1);
      expect(newsIngestion.manualProxies.earnings_proxy).toBe(-1);
      expect(newsIngestion.manualProxies.general_proxy).toBe(0);
    });

    it('should clamp proxy values to -1, 0, +1', () => {
      newsIngestion.setManualProxies({
        fed_proxy: 5,
        earnings_proxy: -10,
        general_proxy: 0.5,
      });

      expect(newsIngestion.manualProxies.fed_proxy).toBe(1);
      expect(newsIngestion.manualProxies.earnings_proxy).toBe(-1);
      expect(newsIngestion.manualProxies.general_proxy).toBe(1);
    });
  });

  describe('status', () => {
    it('should return current status', () => {
      const status = newsIngestion.getStatus();
      
      expect(status.is_running).toBe(false);
      expect(status.poll_interval_ms).toBe(1000);
      expect(status.news_processed).toBe(0);
      expect(status.current_proxies).toBeDefined();
      expect(status.api_available).toBe(true);
    });

    it('should track news processed count', () => {
      newsIngestion.injectNews([
        { id: 'n1', title: 'News 1', description: '', source: 'Test', publishedAt: new Date().toISOString(), keywords: [] },
        { id: 'n2', title: 'News 2', description: '', source: 'Test', publishedAt: new Date().toISOString(), keywords: [] },
      ]);

      expect(newsIngestion.getStatus().news_processed).toBe(2);
    });
  });

  describe('duplicate handling', () => {
    it('should not process duplicate news items', () => {
      const news = {
        id: 'dup1',
        title: 'Markets surge',
        description: 'Rally continues',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      };

      newsIngestion.injectNews([news]);
      const initialCount = newsIngestion.getStatus().news_processed;

      newsIngestion.injectNews([news]);
      expect(newsIngestion.getStatus().news_processed).toBe(initialCount);
    });
  });

  describe('custom fetch function', () => {
    it('should use custom fetch function when provided', async () => {
      const customFetch = jest.fn().mockResolvedValue([{
        id: 'custom1',
        title: 'Custom news surge rally',
        description: 'From custom source',
        source: 'Custom',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      const ni = new NewsIngestion({
        logger: mockLogger,
        fetchNews: customFetch,
      });

      await ni.forcePoll();

      expect(customFetch).toHaveBeenCalled();
      expect(ni.getStatus().news_processed).toBe(1);
    });
  });

  describe('reset functionality', () => {
    it('should reset API failures', () => {
      const failingFetch = jest.fn().mockRejectedValue(new Error('API Error'));
      
      const ni = new NewsIngestion({
        logger: mockLogger,
        fetchNews: failingFetch,
      });

      // Trigger failures
      ni.forcePoll();
      ni.forcePoll();

      ni.resetApiFailures();
      
      expect(ni.isApiAvailable()).toBe(true);
    });

    it('should clear processed IDs', () => {
      newsIngestion.injectNews([{
        id: 'clear1',
        title: 'Test news',
        description: '',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      newsIngestion.clearProcessedIds();

      // Should be able to process same ID again
      const results = newsIngestion.injectNews([{
        id: 'clear1',
        title: 'Test news surge',
        description: '',
        source: 'Test',
        publishedAt: new Date().toISOString(),
        keywords: [],
      }]);

      expect(results.length).toBe(1);
    });
  });
});
