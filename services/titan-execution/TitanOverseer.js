/**
 * TitanOverseer.js
 * 
 * AI Agent for System Performance Analysis and Optimization
 * Powered by Google Gemini 1.5 Pro
 * 
 * Features:
 * - Analyzing trade history vs regime context
 * - Identifying patterns in losing trades
 * - Suggesting parameter adjustments
 * 
 * Requirements: Phase 23 (User Request - AI Agent)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export class TitanOverseer {
    /**
     * @param {DatabaseManager} databaseManager - Database manager instance
     * @param {string} [apiKey] - Gemini API Key (defaults to process.env.GEMINI_API_KEY)
     */
    constructor(databaseManager, apiKey) {
        if (!databaseManager) {
            throw new Error('DatabaseManager is required');
        }

        this.db = databaseManager;
        this.apiKey = apiKey || process.env.GEMINI_API_KEY;

        if (!this.apiKey) {
            console.warn('[TitanOverseer] No GEMINI_API_KEY provided. Analysis will fail if attempted.');
        } else {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            // specific model version can be adjusted
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        }
    }

    /**
     * Analyze system performance over the last N days
     * @param {number} days - Number of days to look back
     * @returns {Promise<Object>} Structured analysis report
     */
    async analyzeSystem(days = 7) {
        if (!this.genAI) {
            throw new Error('Google Generative AI not initialized (missing API Key)');
        }

        console.log(`[TitanOverseer] Starting analysis for last ${days} days...`);

        // 1. Fetch Data
        const { trades, performance, regimeSnapshots } = await this._fetchContextData(days);

        if (trades.length === 0) {
            return {
                status: 'SKIPPED',
                reason: 'No trades found in the specified period.',
                timestamp: new Date()
            };
        }

        // 2. Construct Prompt
        const prompt = this._constructPrompt(trades, performance, regimeSnapshots);

        // 3. Call AI
        console.log('[TitanOverseer] Sending query to Gemini...');
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // 4. Parse Response
        return this._parseAIResponse(text);
    }

    /**
     * Fetch relevant data from database
     * @private
     */
    async _fetchContextData(days) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get Trades
        const trades = await this.db.getTrades({
            start_date: startDate,
            end_date: endDate,
            limit: 500 // Cap to avoid context overflow for now
        });

        // Get Performance Summary
        const performance = await this.db.getPerformanceSummary();

        // Get Regime Context (simplified query via raw SQL or just assuming we have snapshots)
        // Ideally we join this, but for now we'll fetch recent snapshots to give general market context
        // In a real implementation we would correlate each trade with its specific regime snapshot.
        let regimeSnapshots = [];
        try {
            // Assuming a method exists or using raw query if knex is exposed
            // falling back to empty if specific query not implemented yet
            regimeSnapshots = await this.db.db('regime_snapshots')
                .where('timestamp', '>=', startDate)
                .orderBy('timestamp', 'desc')
                .limit(50);
        } catch (e) {
            console.warn('[TitanOverseer] Could not fetch regime snapshots:', e.message);
        }

        return { trades, performance, regimeSnapshots };
    }

    /**
     * Construct the prompt for the AI
     * @private
     */
    _constructPrompt(trades, performance, regimeSnapshots) {
        // Simplify trade list for token efficiency
        const tradeSummary = trades.map(t =>
            `${t.timestamp}: ${t.symbol} ${t.side} | Reg:${t.regime_state} | PnL:${t.pnl} (${t.pnl_pct}%) | Phase:${t.phase}`
        ).join('\n');

        const regimeSummary = regimeSnapshots.map(r =>
            `${r.timestamp}: Vol:${r.vol_state} Trend:${r.trend_state} Rec:${r.model_recommendation}`
        ).join('\n');

        return `
You are the TitanOverseer, an expert Trading Systems Architect. 
Review the following trading performance data and regime context.

SYSTEM OBJECTIVE:
Grow a small account ($200 to $5000) aggressively but safely. 
- Phase 1 (<$1000): Scalping, High Risk (10%)
- Phase 2 (>$1000): Swing, Moderate Risk (5%)

PERFORMANCE METRICS:
Total Trades: ${performance.total_trades}
Win Rate: ${performance.win_rate}%
Total PnL: ${performance.total_pnl}

RECENT TRADES (Last N Entries):
${tradeSummary}

RECENT MARKET CONTEXT (Regime Snapshots):
${regimeSummary}

TASK:
1. Identify patterns in losing trades. (e.g., "Shorts failing in Bull Regime", "Scalps failing in High Volatility").
2. Evaluate if Phase transitions or Risk Controls failed.
3. Recommend specific parameter adjustments or strategy tweaks.

OUTPUT FORMAT (JSON ONLY):
{
  "analysis": "Brief narrative summary of performance...",
  "key_findings": ["Observation 1", "Observation 2"],
  "recommendations": [
    {
      "area": "Risk/Strategy/Parameter",
      "proposal": "Actionable change description",
      "reasoning": "Why this will improve results"
    }
  ]
}
`;
    }

    /**
     * Parse the clean JSON from AI response
     * @private
     */
    _parseAIResponse(text) {
        try {
            // Strip Markdown code blocks if present
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        } catch (error) {
            console.error('[TitanOverseer] Failed to parse JSON response:', error);
            return {
                error: 'PARSE_ERROR',
                raw_text: text
            };
        }
    }
}
