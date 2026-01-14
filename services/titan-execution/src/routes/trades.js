/**
 * Trades API Routes
 * 
 * Handles trade history export with analytics.
 * Requirements: 14.1-14.7
 */

import { Readable } from 'stream';
import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Register trade routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} options - Route options
 */
export async function registerTradeRoutes(fastify, options) {
  const { databaseManager, logger } = options;

  /**
   * Export trade history
   * GET /trades/export
   * 
   * Query Parameters:
   * - start_date: ISO date string (optional)
   * - end_date: ISO date string (optional)
   * - format: 'csv' or 'json' (default: 'json')
   * 
   * Requirements: 14.1-14.7
   */
  fastify.get('/trades/export', asyncHandler(async (request, reply) => {
    const { start_date, end_date, format = 'json' } = request.query;

    // Validate format
    if (format !== 'csv' && format !== 'json') {
      return ResponseFactory.error('format must be either "csv" or "json"', 400);
    }

    // Validate dates
    let startDate = null;
    let endDate = null;

    if (start_date) {
      startDate = new Date(start_date);
      if (isNaN(startDate.getTime())) {
        return ResponseFactory.error('start_date must be a valid ISO date string', 400);
      }
    }

    if (end_date) {
      endDate = new Date(end_date);
      if (isNaN(endDate.getTime())) {
        return ResponseFactory.error('end_date must be a valid ISO date string', 400);
      }
    }

    if (startDate && endDate && startDate > endDate) {
      return ResponseFactory.error('start_date must be before end_date', 400);
    }

    logger.info({
      start_date: startDate?.toISOString(),
      end_date: endDate?.toISOString(),
      format,
    }, 'Trade export requested');

    try {
      // Query trades from database
      const trades = await queryTrades(databaseManager, startDate, endDate);

      logger.info({
        trade_count: trades.length,
      }, 'Trades retrieved for export');

      // Calculate analytics
      const analytics = calculateAnalytics(trades);

      // Property 36: Export Data Completeness
      // For any trade export request, all trades within date range should be included in export file
      if (format === 'csv') {
        // Stream CSV response for large exports (>1000 trades)
        if (trades.length > 1000) {
          return streamCSV(reply, trades, analytics);
        } else {
          const csv = generateCSV(trades, analytics);
          reply.header('Content-Type', 'text/csv');
          reply.header('Content-Disposition', `attachment; filename="trades-${Date.now()}.csv"`);
          return reply.send(csv);
        }
      } else {
        // JSON format
        return ResponseFactory.success({
          trades,
          analytics,
          count: trades.length,
          start_date: startDate?.toISOString() || null,
          end_date: endDate?.toISOString() || null,
        });
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Trade export failed');
      return ResponseFactory.error(`Trade export failed: ${error.message}`, 500);
    }
  }, logger));
}

/**
 * Query trades from database with optional date filtering
 * @param {Object} databaseManager - Database manager instance
 * @param {Date|null} startDate - Start date filter
 * @param {Date|null} endDate - End date filter
 * @returns {Promise<Array>} Array of trade records
 */
async function queryTrades(databaseManager, startDate, endDate) {
  const db = databaseManager.getDatabase();

  let query = 'SELECT * FROM trades';
  const params = [];

  if (startDate || endDate) {
    query += ' WHERE';
    
    if (startDate) {
      query += ' timestamp >= ?';
      params.push(startDate.getTime());
    }
    
    if (endDate) {
      if (startDate) query += ' AND';
      query += ' timestamp <= ?';
      params.push(endDate.getTime());
    }
  }

  query += ' ORDER BY timestamp ASC';

  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Calculate trade analytics
 * Requirements: 14.6 (Calculate win rate, avg R:R, total P&L)
 * 
 * @param {Array} trades - Array of trade records
 * @returns {Object} Analytics object
 */
function calculateAnalytics(trades) {
  if (trades.length === 0) {
    return {
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_risk_reward: 0,
      total_pnl: 0,
      avg_pnl: 0,
      max_win: 0,
      max_loss: 0,
    };
  }

  let winningTrades = 0;
  let losingTrades = 0;
  let totalPnl = 0;
  let totalRiskReward = 0;
  let maxWin = -Infinity;
  let maxLoss = Infinity;

  for (const trade of trades) {
    const pnl = trade.pnl || 0;
    totalPnl += pnl;

    if (pnl > 0) {
      winningTrades++;
      maxWin = Math.max(maxWin, pnl);
    } else if (pnl < 0) {
      losingTrades++;
      maxLoss = Math.min(maxLoss, pnl);
    }

    // Calculate risk:reward ratio if available
    if (trade.risk && trade.reward) {
      totalRiskReward += trade.reward / trade.risk;
    }
  }

  const winRate = trades.length > 0 ? (winningTrades / trades.length) * 100 : 0;
  const avgRiskReward = winningTrades > 0 ? totalRiskReward / winningTrades : 0;
  const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;

  return {
    total_trades: trades.length,
    winning_trades: winningTrades,
    losing_trades: losingTrades,
    win_rate: parseFloat(winRate.toFixed(2)),
    avg_risk_reward: parseFloat(avgRiskReward.toFixed(2)),
    total_pnl: parseFloat(totalPnl.toFixed(2)),
    avg_pnl: parseFloat(avgPnl.toFixed(2)),
    max_win: maxWin === -Infinity ? 0 : parseFloat(maxWin.toFixed(2)),
    max_loss: maxLoss === Infinity ? 0 : parseFloat(maxLoss.toFixed(2)),
  };
}

/**
 * Generate CSV from trades and analytics
 * Requirements: 14.3 (Return CSV file with column headers)
 * 
 * @param {Array} trades - Array of trade records
 * @param {Object} analytics - Analytics object
 * @returns {string} CSV string
 */
function generateCSV(trades, analytics) {
  // CSV header
  const headers = [
    'timestamp',
    'symbol',
    'side',
    'entry_price',
    'exit_price',
    'size',
    'pnl',
    'pnl_pct',
    'risk',
    'reward',
    'risk_reward_ratio',
    'phase',
    'strategy',
  ];

  let csv = headers.join(',') + '\n';

  // Add trade rows
  for (const trade of trades) {
    const row = [
      new Date(trade.timestamp).toISOString(),
      trade.symbol || '',
      trade.side || '',
      trade.entry_price || '',
      trade.exit_price || '',
      trade.size || '',
      trade.pnl || 0,
      trade.pnl_pct || 0,
      trade.risk || '',
      trade.reward || '',
      trade.risk && trade.reward ? (trade.reward / trade.risk).toFixed(2) : '',
      trade.phase || '',
      trade.strategy || '',
    ];

    csv += row.join(',') + '\n';
  }

  // Add analytics summary at the end
  csv += '\n';
  csv += 'ANALYTICS SUMMARY\n';
  csv += `Total Trades,${analytics.total_trades}\n`;
  csv += `Winning Trades,${analytics.winning_trades}\n`;
  csv += `Losing Trades,${analytics.losing_trades}\n`;
  csv += `Win Rate,${analytics.win_rate}%\n`;
  csv += `Avg Risk:Reward,${analytics.avg_risk_reward}\n`;
  csv += `Total P&L,${analytics.total_pnl}\n`;
  csv += `Avg P&L,${analytics.avg_pnl}\n`;
  csv += `Max Win,${analytics.max_win}\n`;
  csv += `Max Loss,${analytics.max_loss}\n`;

  return csv;
}

/**
 * Stream CSV response for large exports
 * Requirements: 14.7 (Stream response for >1000 trades)
 * 
 * @param {Object} reply - Fastify reply object
 * @param {Array} trades - Array of trade records
 * @param {Object} analytics - Analytics object
 * @returns {Promise} Reply promise
 */
async function streamCSV(reply, trades, analytics) {
  reply.header('Content-Type', 'text/csv');
  reply.header('Content-Disposition', `attachment; filename="trades-${Date.now()}.csv"`);

  // Create readable stream
  const stream = new Readable({
    read() {}
  });

  // Send headers
  const headers = [
    'timestamp',
    'symbol',
    'side',
    'entry_price',
    'exit_price',
    'size',
    'pnl',
    'pnl_pct',
    'risk',
    'reward',
    'risk_reward_ratio',
    'phase',
    'strategy',
  ];

  stream.push(headers.join(',') + '\n');

  // Stream trade rows in chunks
  const chunkSize = 100;
  for (let i = 0; i < trades.length; i += chunkSize) {
    const chunk = trades.slice(i, i + chunkSize);
    
    for (const trade of chunk) {
      const row = [
        new Date(trade.timestamp).toISOString(),
        trade.symbol || '',
        trade.side || '',
        trade.entry_price || '',
        trade.exit_price || '',
        trade.size || '',
        trade.pnl || 0,
        trade.pnl_pct || 0,
        trade.risk || '',
        trade.reward || '',
        trade.risk && trade.reward ? (trade.reward / trade.risk).toFixed(2) : '',
        trade.phase || '',
        trade.strategy || '',
      ];

      stream.push(row.join(',') + '\n');
    }
  }

  // Add analytics summary
  stream.push('\n');
  stream.push('ANALYTICS SUMMARY\n');
  stream.push(`Total Trades,${analytics.total_trades}\n`);
  stream.push(`Winning Trades,${analytics.winning_trades}\n`);
  stream.push(`Losing Trades,${analytics.losing_trades}\n`);
  stream.push(`Win Rate,${analytics.win_rate}%\n`);
  stream.push(`Avg Risk:Reward,${analytics.avg_risk_reward}\n`);
  stream.push(`Total P&L,${analytics.total_pnl}\n`);
  stream.push(`Avg P&L,${analytics.avg_pnl}\n`);
  stream.push(`Max Win,${analytics.max_win}\n`);
  stream.push(`Max Loss,${analytics.max_loss}\n`);

  stream.push(null); // End stream

  return reply.send(stream);
}

export default registerTradeRoutes;
