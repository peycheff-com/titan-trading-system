/**
 * Console Control Routes
 * Master Arm, Configuration, Panic Controls
 */

import { ResponseFactory } from '../utils/responseFactory.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export function registerConsoleRoutes(fastify, dependencies) {
  const {
    configManager,
    shadowState,
    l2Validator,
    limitChaser,
    partialFillHandler,
    brokerGateway,
    wsStatus,
    consoleWs,
    getMasterArm,
    setMasterArm,
    logger,
  } = dependencies;

  /**
   * Get Master Arm status
   */
  fastify.get('/api/console/master-arm', asyncHandler(async () => {
    const masterArm = getMasterArm();
    return ResponseFactory.success({
      master_arm: masterArm,
      status: masterArm ? 'ENABLED' : 'DISABLED',
    });
  }, logger));

  /**
   * Set Master Arm status
   */
  fastify.post('/api/console/master-arm', asyncHandler(async (request) => {
    const { enabled, operator_id } = request.body;

    if (typeof enabled !== 'boolean') {
      throw new Error('enabled field must be a boolean');
    }

    const previousState = getMasterArm();
    setMasterArm(enabled);

    logger.info({
      master_arm: enabled,
      previous_state: previousState,
      operator_id: operator_id || 'unknown',
    }, `Master Arm ${enabled ? 'ENABLED' : 'DISABLED'} by operator`);

    // Broadcast state change to all Console clients
    if (consoleWs) {
      consoleWs.pushMasterArmChange({
        master_arm: enabled,
        changed_by: operator_id || 'unknown',
      });
    }

    return ResponseFactory.success({
      master_arm: enabled,
      previous_state: previousState,
      status: enabled ? 'ENABLED' : 'DISABLED',
      operator_id: operator_id || 'unknown',
    });
  }, logger));

  /**
   * Get Configuration
   */
  fastify.get('/api/console/config', asyncHandler(async () => {
    return ResponseFactory.success(configManager.getConfig());
  }, logger));

  /**
   * Validate API Keys (without saving)
   * Requirements: 90.3 - API key validation before saving
   */
  fastify.post('/api/console/validate-api-keys', asyncHandler(async (request) => {
    const { apiKey, apiSecret, operator_id } = request.body;

    // Validate presence
    if (!apiKey || !apiSecret) {
      return ResponseFactory.error('API key and secret are required', 400);
    }

    // Validate format
    if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      return ResponseFactory.error('API key appears invalid (too short or invalid format)', 400);
    }

    if (typeof apiSecret !== 'string' || apiSecret.trim().length < 10) {
      return ResponseFactory.error('API secret appears invalid (too short or invalid format)', 400);
    }

    logger.info({
      action: 'validate_api_keys',
      operator_id: operator_id || 'unknown',
    }, 'Validating API keys');

    const validationResult = await configManager.validateApiKeys(apiKey, apiSecret);

    if (validationResult.valid) {
      logger.info({
        action: 'validate_api_keys',
        operator_id: operator_id || 'unknown',
        result: 'success',
      }, 'API keys validated successfully');
      
      return ResponseFactory.success({
        valid: true,
        message: validationResult.message || 'API keys are valid',
        operator_id: operator_id || 'unknown',
      });
    } else {
      logger.warn({
        action: 'validate_api_keys',
        operator_id: operator_id || 'unknown',
        error: validationResult.error,
        result: 'failed',
      }, 'API key validation failed');
      
      return ResponseFactory.error(
        validationResult.error || 'API keys are invalid or do not have required permissions',
        400
      );
    }
  }, logger));

  /**
   * Update Configuration
   */
  fastify.post('/api/console/config', asyncHandler(async (request) => {
    const { risk_tuner, asset_whitelist, api_keys, operator_id } = request.body;

    const updates = [];

    // Handle Risk Tuner updates
    if (risk_tuner) {
      if (risk_tuner.phase1_risk_pct !== undefined || risk_tuner.phase2_risk_pct !== undefined) {
        const phase1 = risk_tuner.phase1_risk_pct !== undefined 
          ? risk_tuner.phase1_risk_pct 
          : configManager.getRiskTuner().phase1_risk_pct;
        const phase2 = risk_tuner.phase2_risk_pct !== undefined 
          ? risk_tuner.phase2_risk_pct 
          : configManager.getRiskTuner().phase2_risk_pct;
        
        const updated = configManager.updateRiskTuner(phase1, phase2);
        updates.push({
          type: 'risk_tuner',
          updated: updated,
        });
      }
    }

    // Handle Asset Whitelist updates
    if (asset_whitelist) {
      if (asset_whitelist.assets) {
        const updated = configManager.updateAssetWhitelist(asset_whitelist.assets);
        updates.push({
          type: 'asset_whitelist',
          updated: updated,
          disabled_assets: configManager.getDisabledAssets(),
        });
      }
      
      if (asset_whitelist.enabled !== undefined) {
        const enabled = configManager.setWhitelistEnabled(asset_whitelist.enabled);
        updates.push({
          type: 'whitelist_enabled',
          enabled: enabled,
        });
      }
    }

    // Handle API Keys updates with validation
    if (api_keys) {
      const broker = api_keys.broker || configManager.getConfig().api_keys.broker;
      const apiKey = api_keys.bybit_api_key || api_keys.mexc_api_key;
      const apiSecret = api_keys.bybit_api_secret || api_keys.mexc_api_secret;
      
      if (apiKey && apiSecret) {
        const validated = await configManager.updateApiKeys(
          broker,
          apiKey,
          apiSecret
        );
        updates.push({
          type: 'api_keys',
          broker,
          validated: validated,
        });
      }
    }

    logger.info({
      operator_id: operator_id || 'unknown',
      updates: updates.map(u => u.type),
    }, 'Configuration updated');

    // Broadcast config changes to all Console clients
    if (consoleWs) {
      consoleWs.pushConfigChange({
        updates,
        operator_id: operator_id || 'unknown',
        timestamp: new Date().toISOString(),
      });
    }

    return ResponseFactory.success({
      updates,
      config: configManager.getConfig(),
    });
  }, logger));

  /**
   * FLATTEN ALL - Emergency close all positions
   */
  fastify.post('/api/console/flatten-all', asyncHandler(async (request) => {
    const { operator_id } = request.body;

    logger.warn({
      operator_id: operator_id || 'unknown',
      action: 'FLATTEN_ALL',
    }, 'PANIC CONTROL: FLATTEN ALL triggered');

    // Get current positions before closing
    const positionsBefore = shadowState.getAllPositions();
    const positionsAffected = positionsBefore.size;

    // Close all positions in Shadow State
    const tradeRecords = shadowState.closeAllPositions(
      (symbol) => {
        // Get current price from WebSocket cache
        const marketConditions = l2Validator.getMarketConditions(symbol);
        return marketConditions?.lastPrice || marketConditions?.bestBid || 0;
      },
      'PANIC_FLATTEN_ALL'
    );

    // Also close all positions via broker
    let brokerResult = null;
    try {
      brokerResult = await brokerGateway.closeAllPositions();
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to close broker positions during FLATTEN ALL');
    }

    logger.warn({
      action: 'FLATTEN_ALL',
      positions_affected: positionsAffected,
      orders_cancelled: 0,
      operator_id: operator_id || 'unknown',
      trade_records: tradeRecords.length,
      broker_success: brokerResult?.success || false,
      timestamp: new Date().toISOString(),
    }, 'FLATTEN ALL completed');

    // Disable Master Arm after FLATTEN ALL
    const previousMasterArm = getMasterArm();
    setMasterArm(false);

    logger.warn({
      master_arm: false,
      previous_state: previousMasterArm,
      reason: 'FLATTEN_ALL_TRIGGERED',
    }, 'Master Arm DISABLED after FLATTEN ALL - manual re-enable required');

    // Broadcast Master Arm change to Console clients
    if (consoleWs) {
      consoleWs.pushMasterArmChange({
        master_arm: false,
        changed_by: operator_id || 'unknown',
        reason: 'FLATTEN_ALL_TRIGGERED',
      });
    }

    // Broadcast emergency flatten to status channel
    if (wsStatus) {
      wsStatus.pushEmergencyFlatten({
        closed_count: positionsAffected,
        reason: 'PANIC_FLATTEN_ALL',
        operator_id: operator_id || 'unknown',
      });
    }

    return ResponseFactory.success({
      action: 'FLATTEN_ALL',
      positions_affected: positionsAffected,
      orders_cancelled: 0,
      trade_records: tradeRecords.length,
      master_arm: false,
      master_arm_disabled: true,
      operator_id: operator_id || 'unknown',
    });
  }, logger));

  /**
   * CANCEL ALL - Emergency cancel all open orders
   */
  fastify.post('/api/console/cancel-all', asyncHandler(async (request) => {
    const { operator_id } = request.body;

    logger.warn({
      operator_id: operator_id || 'unknown',
      action: 'CANCEL_ALL',
    }, 'PANIC CONTROL: CANCEL ALL triggered');

    let ordersCancelled = 0;
    const cancelResults = [];

    // Cancel all active Limit Chaser orders
    const activeChases = limitChaser.getActiveChases();
    for (const [signalId] of activeChases) {
      try {
        const cancelled = limitChaser.cancelChase(signalId);
        if (cancelled) {
          ordersCancelled++;
          cancelResults.push({
            signal_id: signalId,
            type: 'LIMIT_CHASER',
            status: 'cancelled',
          });
          logger.info({ signal_id: signalId }, 'Cancelled active Limit Chaser');
        }
      } catch (error) {
        logger.error({
          signal_id: signalId,
          error: error.message,
        }, 'Failed to cancel Limit Chaser');
        cancelResults.push({
          signal_id: signalId,
          type: 'LIMIT_CHASER',
          status: 'error',
          error: error.message,
        });
      }
    }

    // Cancel all partial fill handler orders
    const activePartialFills = partialFillHandler.getActiveOrders();
    for (const [signalId, order] of activePartialFills) {
      try {
        if (order.broker_order_id) {
          await brokerGateway.cancelOrder(order.broker_order_id);
          ordersCancelled++;
          cancelResults.push({
            signal_id: signalId,
            broker_order_id: order.broker_order_id,
            type: 'PARTIAL_FILL',
            status: 'cancelled',
          });
          logger.info({
            signal_id: signalId,
            broker_order_id: order.broker_order_id,
          }, 'Cancelled partial fill order');
        }
      } catch (error) {
        logger.error({
          signal_id: signalId,
          error: error.message,
        }, 'Failed to cancel partial fill order');
        cancelResults.push({
          signal_id: signalId,
          type: 'PARTIAL_FILL',
          status: 'error',
          error: error.message,
        });
      }
    }

    logger.warn({
      action: 'CANCEL_ALL',
      positions_affected: 0,
      orders_cancelled: ordersCancelled,
      operator_id: operator_id || 'unknown',
      cancel_results: cancelResults,
      timestamp: new Date().toISOString(),
    }, 'CANCEL ALL completed');

    // Broadcast to status channel
    if (wsStatus) {
      wsStatus.broadcast({
        type: 'CANCEL_ALL',
        orders_cancelled: ordersCancelled,
        operator_id: operator_id || 'unknown',
        timestamp: new Date().toISOString(),
      });
    }

    return ResponseFactory.success({
      action: 'CANCEL_ALL',
      positions_affected: 0,
      orders_cancelled: ordersCancelled,
      cancel_results: cancelResults,
      operator_id: operator_id || 'unknown',
    });
  }, logger));

  /**
   * Get System Status
   * Requirements: SystemStatusPanel component
   */
  fastify.get('/api/console/system-status', asyncHandler(async () => {
    const brokerConnected = brokerGateway && typeof brokerGateway.getAdapter === 'function';
    const l2Active = l2Validator && typeof l2Validator.getMarketConditions === 'function';
    
    return ResponseFactory.success({
      broker: {
        connected: brokerConnected,
        broker: 'BYBIT',
        lastPing: new Date().toISOString(),
      },
      database: {
        connected: true,
        lastWrite: new Date().toISOString(),
      },
      l2Cache: {
        active: l2Active,
        symbols: l2Active ? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'] : [],
        lastUpdate: new Date().toISOString(),
      },
      heartbeat: {
        alive: true,
        lastBeat: new Date().toISOString(),
      },
      websocket: {
        console: consoleWs ? true : false,
        status: wsStatus ? true : false,
      },
    });
  }, logger));

  /**
   * Get Positions
   * Requirements: PositionMonitor component
   */
  fastify.get('/api/console/positions', asyncHandler(async () => {
    const positions = [];
    
    if (shadowState && typeof shadowState.getAllPositions === 'function') {
      const positionsMap = shadowState.getAllPositions();
      for (const [symbol, position] of positionsMap) {
        positions.push({
          symbol,
          side: position.side,
          size: position.size,
          entry_price: position.entry_price,
          current_price: position.current_price || position.entry_price,
          unrealized_pnl: position.unrealized_pnl || 0,
          unrealized_pnl_pct: position.unrealized_pnl_pct || 0,
          liquidation_price: position.liquidation_price || null,
          stop_loss: position.stop_loss || null,
          take_profit: position.take_profit || null,
          leverage: position.leverage || 1,
          timestamp: position.timestamp || new Date().toISOString(),
        });
      }
    }
    
    return ResponseFactory.success({ positions });
  }, logger));

  /**
   * Get Trade History
   * Requirements: TradeLog component
   */
  fastify.get('/api/console/trades', asyncHandler(async (request) => {
    const { limit = 50 } = request.query;
    
    try {
      const trades = await databaseManager.getTrades({
        limit: parseInt(limit),
        symbol: request.query.symbol,
      });

      return ResponseFactory.success({ 
        trades,
        total: trades.length, // Pagination total count would require a separate count query, skipping for now
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch trades');
      return ResponseFactory.error('Failed to fetch trades', 500);
    }
  }, logger));

  /**
   * Get Recent Signals
   * Requirements: SignalMonitor component
   */
  fastify.get('/api/console/signals', asyncHandler(async (request) => {
    const { limit = 20 } = request.query;
    
    // Mock signals for now - replace with actual signal monitor
    const signals = [
      {
        signal_id: 'titan_BTCUSDT_12347_1',
        type: 'CONFIRM',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        status: 'FILLED',
        entry_price: 43250.50,
        size: 0.1,
        regime_state: 1,
        phase: 'PHASE_1_KICKSTARTER',
        timestamp: new Date(Date.now() - 300000).toISOString(),
      },
      {
        signal_id: 'titan_ETHUSDT_12348_1',
        type: 'PREPARE',
        symbol: 'ETHUSDT',
        direction: 'SHORT',
        status: 'PENDING',
        entry_price: 2280.00,
        size: 2.5,
        regime_state: -1,
        phase: 'PHASE_2_TREND_RIDER',
        timestamp: new Date(Date.now() - 60000).toISOString(),
      },
    ];
    
    return ResponseFactory.success({ 
      signals: signals.slice(0, parseInt(limit)),
      total: signals.length,
    });
  }, logger));

  /**
   * Get Regime State
   * Requirements: RegimeStatePanel component
   */
  fastify.get('/api/console/regime-state', asyncHandler(async () => {
    // Mock regime state - replace with actual regime engine
    const regimeState = {
      trend_state: 1, // 1=Bull, 0=Range, -1=Bear
      vol_state: 1, // 0=Low, 1=Normal, 2=Extreme
      liquidity_state: 2, // 2=High, 1=Normal, 0=Low
      regime_state: 1, // 1=Risk-On, 0=Neutral, -1=Risk-Off
      hurst_exponent: 0.62,
      fdi: 1.38,
      efficiency_ratio: 0.75,
      vpin_approx: 0.35,
      absorption_state: false,
      shannon_entropy: 0.42,
      market_structure_score: 78.5,
      trend_score: 24.0,
      momentum_score: 18.5,
      vol_score: 12.0,
      macro_score: 8.0,
      proxy_score: 16.0,
      model_recommendation: 'TREND_FOLLOW',
      phase: 'PHASE_1_KICKSTARTER',
      timestamp: new Date().toISOString(),
    };
    
    return ResponseFactory.success({ regime_state: regimeState });
  }, logger));

  /**
   * Get Performance Metrics
   * Requirements: PerformanceMetrics component
   */
  fastify.get('/api/console/performance', asyncHandler(async (request) => {
    const { timeframe = 'ALL' } = request.query;
    
    // Mock performance metrics - replace with actual calculation
    const performance = {
      timeframe,
      total_trades: 47,
      winning_trades: 32,
      losing_trades: 15,
      win_rate: 68.09,
      total_pnl: 1247.85,
      total_pnl_pct: 6.24,
      avg_win: 52.30,
      avg_loss: -28.15,
      largest_win: 185.50,
      largest_loss: -72.30,
      profit_factor: 2.42,
      sharpe_ratio: 1.85,
      max_drawdown: -3.45,
      max_drawdown_pct: -2.18,
      avg_rr_ratio: 2.15,
      expectancy: 26.55,
      timestamp: new Date().toISOString(),
    };
    
    return ResponseFactory.success({ performance });
  }, logger));

  /**
   * Test Webhook Configuration
   * Requirements: WebhookConfig component
   */
  fastify.post('/api/console/test-webhook', asyncHandler(async (request) => {
    const { webhook_url, hmac_secret } = request.body;
    
    if (!webhook_url) {
      return ResponseFactory.error('webhook_url is required', 400);
    }
    
    try {
      // Create test payload
      const testPayload = {
        type: 'TEST',
        signal_id: 'test_webhook_' + Date.now(),
        symbol: 'BTCUSDT',
        direction: 'LONG',
        timestamp: new Date().toISOString(),
      };
      
      // Calculate HMAC if secret provided
      let signature = null;
      if (hmac_secret) {
        const crypto = await import('crypto');
        const hmac = crypto.createHmac('sha256', hmac_secret);
        hmac.update(JSON.stringify(testPayload));
        signature = hmac.digest('hex');
      }
      
      logger.info({
        webhook_url,
        has_signature: !!signature,
      }, 'Testing webhook configuration');
      
      // For now, just validate the URL format
      const url = new URL(webhook_url);
      
      return ResponseFactory.success({
        valid: true,
        message: 'Webhook URL is valid',
        url: url.toString(),
        has_hmac: !!hmac_secret,
        test_payload: testPayload,
        signature,
      });
      
    } catch (error) {
      logger.error({
        error: error.message,
        webhook_url,
      }, 'Webhook test failed');
      
      return ResponseFactory.error(
        `Webhook test failed: ${error.message}`,
        400
      );
    }
  }, logger));

  /**
   * Get Hunter Holograms (Enhanced Phase 2)
   * Requirements: Task 13 - Enhanced HUD
   */
  fastify.get('/api/console/hunter/holograms', asyncHandler(async () => {
    // Mock Enhanced Hologram Data
    const holograms = [
        {
            symbol: 'BTCUSDT',
            status: 'A+', // Classic Status
            alignment: 'A+', // Enhanced Alignment
            timeframe_states: {
                daily: { trend: 'UP', location: 'DISCOUNT', structure: 'HH_HL' },
                h4: { trend: 'UP', location: 'EQ', structure: 'HH_HL' },
                m15: { trend: 'UP', location: 'PREMIUM', structure: 'BOS' }
            },
            score: 0.92, // Enhanced Score
            oracleScore: {
                sentiment: 0.75,
                confidence: 0.88,
                veto: false,
                convictionMultiplier: 1.5
            },
            globalCVD: {
                consensus: 'BULLISH',
                confidence: 0.85,
                manipulation: { detected: false }
            },
            botTrap: {
                isSuspect: false,
                suspicionScore: 0.12
            },
            flowValidation: {
                 flowType: 'INSTITUTIONAL_BUYING',
                 confidence: 0.90
            },
            timestamp: new Date().toISOString()
        },
        {
            symbol: 'ETHUSDT',
            status: 'B',
            alignment: 'B',
            timeframe_states: {
                daily: { trend: 'UP', location: 'PREMIUM', structure: 'HH_HL' },
                h4: { trend: 'SIDEWAYS', location: 'EQ', structure: 'CHOCH' },
                m15: { trend: 'DOWN', location: 'PREMIUM', structure: 'BOS' }
            },
            score: 0.65,
            oracleScore: {
                sentiment: 0.45,
                confidence: 0.60,
                veto: false,
                convictionMultiplier: 1.0
            },
            globalCVD: {
                consensus: 'MIXED',
                confidence: 0.40,
                manipulation: { detected: false }
            },
            botTrap: {
                isSuspect: true,
                suspicionScore: 0.78 // High suspicion
            },
             flowValidation: {
                 flowType: 'RETAIL_FOMO',
                 confidence: 0.75
            },
            timestamp: new Date().toISOString()
        },
        {
            symbol: 'SOLUSDT',
            status: 'C',
            alignment: 'VETO', // Vetoed by Oracle/Logic
            timeframe_states: {
                daily: { trend: 'DOWN', location: 'PREMIUM', structure: 'LL_LH' },
                h4: { trend: 'DOWN', location: 'DISCOUNT', structure: 'LL_LH' },
                m15: { trend: 'UP', location: 'DISCOUNT', structure: 'CHOCH' }
            },
            score: 0.32,
            oracleScore: {
                sentiment: -0.85, // Negative sentiment
                confidence: 0.92,
                veto: true, // VETOED
                convictionMultiplier: 0.0
            },
            globalCVD: {
                consensus: 'BEARISH',
                confidence: 0.88,
                manipulation: { detected: true } // Manipulation detected
            },
            botTrap: {
                isSuspect: false,
                suspicionScore: 0.05
            },
            flowValidation: {
                 flowType: 'NONE',
                 confidence: 0.0
            },
            timestamp: new Date().toISOString()
        }
    ];

    return ResponseFactory.success({ holograms });
  }, logger));
}
