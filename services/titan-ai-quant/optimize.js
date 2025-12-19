/**
 * Titan AI Quant - Nightly Optimization Loop
 * 
 * Runs at midnight UTC via PM2 cron_restart.
 * Analyzes last 24 hours of trades, identifies patterns,
 * generates optimization proposals, and creates morning briefing.
 */

const path = require('path');
const crypto = require('crypto');

class AIQuant {
  constructor(options = {}) {
    this.options = {
      databasePath: options.databasePath || process.env.DATABASE_PATH || './titan_execution.db',
      titanCoreUrl: options.titanCoreUrl || process.env.TITAN_CORE_URL || 'http://127.0.0.1:8080',
      lookbackHours: options.lookbackHours || 24,
      minTradesForAnalysis: options.minTradesForAnalysis || 5,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      ...options
    };
    
    this.db = null;
    this.logger = options.logger || console;
    this.insights = [];
    this.proposals = [];
  }

  /**
   * Main optimization loop
   */
  async run() {
    this.log('info', '=== Titan AI Quant Starting ===');
    const startTime = Date.now();
    
    try {
      // Step 1: Initialize database connection
      await this.initializeDatabase();
      
      // Step 2: Load recent context (last 10 insights)
      const context = await this.loadRecentContext();
      this.log('info', `Loaded ${context.length} recent insights for context`);
      
      // Step 3: Parse last 24 hours of trades
      const trades = await this.parseTrades();
      this.log('info', `Parsed ${trades.length} trades from last ${this.options.lookbackHours} hours`);
      
      if (trades.length < this.options.minTradesForAnalysis) {
        this.log('info', `Insufficient trades for analysis (${trades.length} < ${this.options.minTradesForAnalysis})`);
        await this.generateBriefing([], 'Insufficient data for analysis');
        return;
      }
      
      // Step 4: Correlate trades with regime snapshots
      const enrichedTrades = await this.correlateWithRegime(trades);
      
      // Step 5: Identify failure patterns
      const patterns = this.identifyPatterns(enrichedTrades);
      this.log('info', `Identified ${patterns.length} patterns`);
      
      // Step 6: Generate optimization proposals
      const proposals = await this.generateProposals(patterns, context);
      this.log('info', `Generated ${proposals.length} proposals`);
      
      // Step 7: Validate proposals with backtester
      const validatedProposals = await this.validateProposals(proposals);
      this.log('info', `${validatedProposals.length} proposals passed validation`);
      
      // Step 8: Check for duplicates
      const uniqueProposals = await this.filterDuplicates(validatedProposals);
      this.log('info', `${uniqueProposals.length} unique proposals after duplicate check`);
      
      // Step 9: Store proposals in strategic_insights
      for (const proposal of uniqueProposals) {
        await this.storeProposal(proposal);
      }
      
      // Step 10: Generate morning briefing
      await this.generateBriefing(uniqueProposals);
      
      const duration = Date.now() - startTime;
      this.log('info', `=== AI Quant completed in ${duration}ms ===`);
      
    } catch (error) {
      this.log('error', `AI Quant failed: ${error.message}`, { stack: error.stack });
      await this.logSystemEvent('AI_QUANT_FAILED', 'error', {
        message: error.message,
        stack: error.stack
      });
    } finally {
      // Close database connection
      if (this.db) {
        this.db.close();
      }
    }
  }

  /**
   * Initialize database connection
   */
  async initializeDatabase() {
    const Database = require('better-sqlite3');
    this.db = new Database(this.options.databasePath);
    this.log('info', `Connected to database: ${this.options.databasePath}`);
  }

  /**
   * Load recent context (last 10 insights)
   */
  async loadRecentContext() {
    const rows = this.db.prepare(`
      SELECT * FROM strategic_insights
      ORDER BY created_at DESC
      LIMIT 10
    `).all();
    
    return rows;
  }

  /**
   * Parse trades from last 24 hours
   */
  async parseTrades() {
    const cutoff = new Date(Date.now() - this.options.lookbackHours * 60 * 60 * 1000).toISOString();
    
    const rows = this.db.prepare(`
      SELECT * FROM trade_history
      WHERE created_at >= ? AND status = 'closed'
      ORDER BY created_at ASC
    `).all(cutoff);
    
    return rows;
  }

  /**
   * Correlate trades with regime snapshots
   */
  async correlateWithRegime(trades) {
    return trades.map(trade => {
      // Find closest regime snapshot
      const regime = this.db.prepare(`
        SELECT * FROM regime_snapshots
        WHERE symbol = ? AND created_at <= ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(trade.symbol, trade.signal_timestamp);
      
      return {
        ...trade,
        regime: regime || null
      };
    });
  }

  /**
   * Identify failure patterns
   */
  identifyPatterns(trades) {
    const patterns = [];
    
    // Pattern 1: Time-of-day failures
    const hourlyStats = this.analyzeByHour(trades);
    const badHours = hourlyStats.filter(h => h.winRate < 0.4 && h.count >= 3);
    if (badHours.length > 0) {
      patterns.push({
        type: 'time_of_day',
        description: `Poor performance during hours: ${badHours.map(h => h.hour).join(', ')}`,
        data: badHours,
        confidence: Math.min(0.9, 0.5 + badHours.length * 0.1)
      });
    }
    
    // Pattern 2: Symbol-specific failures
    const symbolStats = this.analyzeBySymbol(trades);
    const badSymbols = symbolStats.filter(s => s.winRate < 0.35 && s.count >= 3);
    if (badSymbols.length > 0) {
      patterns.push({
        type: 'symbol_specific',
        description: `Poor performance on symbols: ${badSymbols.map(s => s.symbol).join(', ')}`,
        data: badSymbols,
        confidence: Math.min(0.9, 0.5 + badSymbols.length * 0.1)
      });
    }
    
    // Pattern 3: Regime-specific failures
    const regimeStats = this.analyzeByRegime(trades);
    const badRegimes = regimeStats.filter(r => r.winRate < 0.4 && r.count >= 3);
    if (badRegimes.length > 0) {
      patterns.push({
        type: 'regime_specific',
        description: `Poor performance in regimes: ${badRegimes.map(r => r.regime).join(', ')}`,
        data: badRegimes,
        confidence: Math.min(0.9, 0.5 + badRegimes.length * 0.1)
      });
    }
    
    // Pattern 4: Trap type failures
    const trapStats = this.analyzeByTrapType(trades);
    const badTraps = trapStats.filter(t => t.winRate < 0.4 && t.count >= 3);
    if (badTraps.length > 0) {
      patterns.push({
        type: 'trap_type',
        description: `Poor performance on trap types: ${badTraps.map(t => t.trapType).join(', ')}`,
        data: badTraps,
        confidence: Math.min(0.9, 0.5 + badTraps.length * 0.1)
      });
    }
    
    // Pattern 5: Consecutive losses
    const maxConsecutiveLosses = this.findMaxConsecutiveLosses(trades);
    if (maxConsecutiveLosses >= 5) {
      patterns.push({
        type: 'consecutive_losses',
        description: `${maxConsecutiveLosses} consecutive losses detected`,
        data: { maxConsecutiveLosses },
        confidence: 0.7
      });
    }
    
    return patterns;
  }

  /**
   * Analyze trades by hour
   */
  analyzeByHour(trades) {
    const hourMap = new Map();
    
    for (const trade of trades) {
      const hour = new Date(trade.signal_timestamp).getUTCHours();
      if (!hourMap.has(hour)) {
        hourMap.set(hour, { wins: 0, losses: 0 });
      }
      const stats = hourMap.get(hour);
      if (trade.win) stats.wins++;
      else stats.losses++;
    }
    
    return Array.from(hourMap.entries()).map(([hour, stats]) => ({
      hour,
      count: stats.wins + stats.losses,
      winRate: stats.wins / (stats.wins + stats.losses)
    }));
  }

  /**
   * Analyze trades by symbol
   */
  analyzeBySymbol(trades) {
    const symbolMap = new Map();
    
    for (const trade of trades) {
      if (!symbolMap.has(trade.symbol)) {
        symbolMap.set(trade.symbol, { wins: 0, losses: 0, pnl: 0 });
      }
      const stats = symbolMap.get(trade.symbol);
      if (trade.win) stats.wins++;
      else stats.losses++;
      stats.pnl += trade.realized_pnl || 0;
    }
    
    return Array.from(symbolMap.entries()).map(([symbol, stats]) => ({
      symbol,
      count: stats.wins + stats.losses,
      winRate: stats.wins / (stats.wins + stats.losses),
      totalPnl: stats.pnl
    }));
  }

  /**
   * Analyze trades by regime
   */
  analyzeByRegime(trades) {
    const regimeMap = new Map();
    
    for (const trade of trades) {
      const regime = trade.regime?.regime_state ?? 'unknown';
      const key = regime === 1 ? 'risk_on' : regime === -1 ? 'risk_off' : 'neutral';
      
      if (!regimeMap.has(key)) {
        regimeMap.set(key, { wins: 0, losses: 0 });
      }
      const stats = regimeMap.get(key);
      if (trade.win) stats.wins++;
      else stats.losses++;
    }
    
    return Array.from(regimeMap.entries()).map(([regime, stats]) => ({
      regime,
      count: stats.wins + stats.losses,
      winRate: stats.wins / (stats.wins + stats.losses)
    }));
  }

  /**
   * Analyze trades by trap type
   */
  analyzeByTrapType(trades) {
    const trapMap = new Map();
    
    for (const trade of trades) {
      const trapType = trade.trap_type || 'unknown';
      if (!trapMap.has(trapType)) {
        trapMap.set(trapType, { wins: 0, losses: 0 });
      }
      const stats = trapMap.get(trapType);
      if (trade.win) stats.wins++;
      else stats.losses++;
    }
    
    return Array.from(trapMap.entries()).map(([trapType, stats]) => ({
      trapType,
      count: stats.wins + stats.losses,
      winRate: stats.wins / (stats.wins + stats.losses)
    }));
  }

  /**
   * Find max consecutive losses
   */
  findMaxConsecutiveLosses(trades) {
    let max = 0;
    let current = 0;
    
    for (const trade of trades) {
      if (!trade.win) {
        current++;
        max = Math.max(max, current);
      } else {
        current = 0;
      }
    }
    
    return max;
  }

  /**
   * Generate optimization proposals
   */
  async generateProposals(patterns, context) {
    const proposals = [];
    
    for (const pattern of patterns) {
      if (pattern.confidence < this.options.confidenceThreshold) {
        continue;
      }
      
      const proposal = this.createProposal(pattern);
      if (proposal) {
        proposals.push(proposal);
      }
    }
    
    return proposals;
  }

  /**
   * Create proposal from pattern
   */
  createProposal(pattern) {
    switch (pattern.type) {
      case 'time_of_day':
        return {
          type: 'proposal',
          topic: 'Trading Hours Optimization',
          description: pattern.description,
          oldConfig: { tradingHours: 'all' },
          newConfig: { 
            tradingHours: 'filtered',
            excludeHours: pattern.data.map(h => h.hour)
          },
          projectedImprovement: `Avoid ${pattern.data.length} low-performance hours`,
          riskImpact: 'Low - reduces trade frequency',
          confidence: pattern.confidence
        };
        
      case 'symbol_specific':
        return {
          type: 'proposal',
          topic: 'Symbol Whitelist Optimization',
          description: pattern.description,
          oldConfig: { symbolBlacklist: [] },
          newConfig: { 
            symbolBlacklist: pattern.data.map(s => s.symbol)
          },
          projectedImprovement: `Remove ${pattern.data.length} underperforming symbols`,
          riskImpact: 'Low - reduces exposure to weak assets',
          confidence: pattern.confidence
        };
        
      case 'regime_specific':
        return {
          type: 'proposal',
          topic: 'Regime Filter Optimization',
          description: pattern.description,
          oldConfig: { regimeFilter: 'none' },
          newConfig: { 
            regimeFilter: 'strict',
            avoidRegimes: pattern.data.map(r => r.regime)
          },
          projectedImprovement: `Avoid trading in ${pattern.data.length} unfavorable regimes`,
          riskImpact: 'Medium - may miss some opportunities',
          confidence: pattern.confidence
        };
        
      case 'trap_type':
        return {
          type: 'proposal',
          topic: 'Trap Type Optimization',
          description: pattern.description,
          oldConfig: { trapTypes: 'all' },
          newConfig: { 
            trapTypes: 'filtered',
            disabledTraps: pattern.data.map(t => t.trapType)
          },
          projectedImprovement: `Disable ${pattern.data.length} underperforming trap types`,
          riskImpact: 'Medium - reduces signal diversity',
          confidence: pattern.confidence
        };
        
      case 'consecutive_losses':
        return {
          type: 'proposal',
          topic: 'Risk Management Tightening',
          description: pattern.description,
          oldConfig: { maxConsecutiveLosses: 10 },
          newConfig: { 
            maxConsecutiveLosses: 5,
            cooldownMinutes: 30
          },
          projectedImprovement: 'Add cooldown after 5 consecutive losses',
          riskImpact: 'Low - protects capital during drawdowns',
          confidence: pattern.confidence
        };
        
      default:
        return null;
    }
  }

  /**
   * Validate proposals with backtester
   */
  async validateProposals(proposals) {
    // Simplified validation - in production, this would run actual backtests
    return proposals.filter(p => p.confidence >= this.options.confidenceThreshold);
  }

  /**
   * Filter duplicate proposals
   */
  async filterDuplicates(proposals) {
    const unique = [];
    
    for (const proposal of proposals) {
      const contentHash = this.hashProposal(proposal);
      
      // Check if similar proposal was rejected in past 30 days
      const existing = this.db.prepare(`
        SELECT * FROM strategic_insights
        WHERE content_hash = ? AND created_at >= datetime('now', '-30 days')
      `).get(contentHash);
      
      if (!existing) {
        proposal.contentHash = contentHash;
        unique.push(proposal);
      } else {
        this.log('info', `Skipping duplicate proposal: ${proposal.topic}`);
        await this.logSystemEvent('DUPLICATE_PROPOSAL', 'info', {
          message: `Duplicate proposal skipped: ${proposal.topic}`,
          contentHash
        });
      }
    }
    
    return unique;
  }

  /**
   * Hash proposal content for duplicate detection
   */
  hashProposal(proposal) {
    const content = JSON.stringify({
      topic: proposal.topic,
      newConfig: proposal.newConfig
    });
    
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Store proposal in strategic_insights
   */
  async storeProposal(proposal) {
    this.db.prepare(`
      INSERT INTO strategic_insights (
        insight_type, topic, insight_text, confidence_score,
        old_config, new_config, projected_pnl_improvement, risk_impact,
        content_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'proposal',
      proposal.topic,
      proposal.description,
      proposal.confidence,
      JSON.stringify(proposal.oldConfig),
      JSON.stringify(proposal.newConfig),
      proposal.projectedImprovement,
      proposal.riskImpact,
      proposal.contentHash
    );
    
    this.log('info', `Stored proposal: ${proposal.topic}`);
  }

  /**
   * Generate morning briefing
   */
  async generateBriefing(proposals, note = null) {
    const briefing = {
      date: new Date().toISOString().split('T')[0],
      proposalCount: proposals.length,
      proposals: proposals.map(p => ({
        topic: p.topic,
        description: p.description,
        confidence: p.confidence,
        projectedImprovement: p.projectedImprovement,
        riskImpact: p.riskImpact
      })),
      note
    };
    
    // Store briefing
    this.db.prepare(`
      INSERT INTO strategic_insights (
        insight_type, topic, insight_text, confidence_score
      ) VALUES (?, ?, ?, ?)
    `).run(
      'briefing',
      `Morning Briefing - ${briefing.date}`,
      JSON.stringify(briefing),
      1.0
    );
    
    this.log('info', `Morning briefing generated with ${proposals.length} proposals`);
    
    return briefing;
  }

  /**
   * Log system event
   */
  async logSystemEvent(eventType, severity, context) {
    if (this.db) {
      this.db.prepare(`
        INSERT INTO system_events (event_type, severity, service, message, context)
        VALUES (?, ?, 'ai-quant', ?, ?)
      `).run(eventType, severity, context.message, JSON.stringify(context));
    }
  }

  /**
   * Logging helper
   */
  log(level, message, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: 'ai-quant',
      level,
      message,
      ...context
    };
    
    console.log(JSON.stringify(logEntry));
  }
}

// Run if executed directly
if (require.main === module) {
  const quant = new AIQuant();
  quant.run().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error('AI Quant failed:', error);
    process.exit(1);
  });
}

module.exports = AIQuant;
