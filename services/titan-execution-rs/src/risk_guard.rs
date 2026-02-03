use crate::execution_constraints::{ConstraintsStore, PolicyMode, RiskMode};
use crate::model::Intent;
use crate::risk_policy::RiskPolicy;
use crate::risk_policy::RiskState;

use crate::risk_state_manager::RiskStateManager;
use crate::shadow_state::ShadowState;
use crate::staleness::StalenessMonitor;
use parking_lot::RwLock;
use rust_decimal::Decimal;
use std::sync::Arc;
use tracing::{info, warn};

#[derive(Debug, Clone, PartialEq)]
pub enum RiskRejectionReason {
    SymbolNotWhitelisted(String),
    MaxPositionNotionalExceeded {
        symbol: String,
        current: Decimal,
        additional: Decimal,
        limit: Decimal,
    },
    MaxOpenOrdersExceeded {
        symbol: String,
        current: usize,
        limit: usize,
    },
    DailyLossLimitExceeded {
        current_loss: Decimal,
        limit: Decimal,
    },
    MaxAccountLeverageExceeded {
        current: Decimal,
        limit: Decimal,
    },
    InvalidSize,

    PolicyMissing,
    PolicyHashMismatch {
        expected: String,
        actual: String,
    },
    MarketDataStale(String),

    // Execution Constraints Violations (PowerLaw)
    ConstraintMaxOrderNotionalExceeded {
        symbol: String,
        order_notional: Decimal,
        limit: Decimal,
    },
    ConstraintReduceOnlyViolation {
        symbol: String,
    },
    ConstraintMaxLeverageExceeded {
        current: Decimal,
        limit: Decimal,
    },
}

impl std::fmt::Display for RiskRejectionReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskRejectionReason::SymbolNotWhitelisted(s) => {
                write!(f, "Symbol '{}' not in whitelist", s)
            }
            RiskRejectionReason::MarketDataStale(details) => {
                write!(f, "Market Data Stale: {}", details)
            }
            RiskRejectionReason::MaxPositionNotionalExceeded {
                symbol,
                current,
                additional,
                limit,
            } => write!(
                f,
                "Position cap exceeded for {}: Curr {:.2} + Add {:.2} > Limit {:.2}",
                symbol, current, additional, limit
            ),
            RiskRejectionReason::MaxOpenOrdersExceeded {
                symbol,
                current,
                limit,
            } => write!(
                f,
                "Too many open orders for {}: {} >= Limit {}",
                symbol, current, limit
            ),
            RiskRejectionReason::DailyLossLimitExceeded {
                current_loss,
                limit,
            } => write!(
                f,
                "Daily loss limit hit: {:.2} <= {:.2}",
                current_loss, limit
            ),
            RiskRejectionReason::MaxAccountLeverageExceeded { current, limit } => write!(
                f,
                "Account Leverage Limit Exceeded: {:.2}x > {:.2}x",
                current, limit
            ),

            RiskRejectionReason::InvalidSize => write!(f, "Invalid size (<= 0)"),
            RiskRejectionReason::PolicyMissing => write!(f, "Risk Policy not loaded"),
            RiskRejectionReason::PolicyHashMismatch { expected, actual } => write!(
                f,
                "Policy Hash Mismatch: Expected {}, Got {}",
                expected, actual
            ),
            RiskRejectionReason::ConstraintMaxOrderNotionalExceeded {
                symbol,
                order_notional,
                limit,
            } => write!(
                f,
                "Constraint: Order notional {} exceeds limit {} for {}",
                order_notional, limit, symbol
            ),
            RiskRejectionReason::ConstraintReduceOnlyViolation { symbol } => {
                write!(
                    f,
                    "Constraint: {} is reduce-only, new positions blocked",
                    symbol
                )
            }
            RiskRejectionReason::ConstraintMaxLeverageExceeded { current, limit } => {
                write!(
                    f,
                    "Constraint: Leverage {:.2}x exceeds limit {:.2}x",
                    current, limit
                )
            }
        }
    }
}

use std::sync::atomic::{AtomicI64, Ordering};

pub struct RiskGuard {
    policy: RwLock<RiskPolicy>,
    shadow_state: Arc<RwLock<ShadowState>>,
    // current_state: AtomicI64, // Removed unused field
    last_heartbeat: AtomicI64,
    state_manager: RwLock<RiskStateManager>,
    staleness_monitor: RwLock<StalenessMonitor>,
    constraints_store: Option<Arc<ConstraintsStore>>,
}

impl RiskGuard {
    pub fn new(policy: RiskPolicy, shadow_state: Arc<RwLock<ShadowState>>) -> Self {
        info!("🛡️ RiskGuard Initialized with policy: {:?}", policy);
        Self {
            policy: RwLock::new(policy),
            shadow_state,
            // current_state: AtomicI64::new(0),
            last_heartbeat: AtomicI64::new(chrono::Utc::now().timestamp_millis()),
            state_manager: RwLock::new(RiskStateManager::new()),
            staleness_monitor: RwLock::new(StalenessMonitor::new()),
            constraints_store: None,
        }
    }

    /// Create RiskGuard with ConstraintsStore for PowerLaw enforcement
    pub fn with_constraints(
        policy: RiskPolicy,
        shadow_state: Arc<RwLock<ShadowState>>,
        constraints_store: Arc<ConstraintsStore>,
    ) -> Self {
        info!("🛡️ RiskGuard Initialized with PowerLaw constraints enforcement");
        Self {
            policy: RwLock::new(policy),
            shadow_state,
            last_heartbeat: AtomicI64::new(chrono::Utc::now().timestamp_millis()),
            state_manager: RwLock::new(RiskStateManager::new()),
            staleness_monitor: RwLock::new(StalenessMonitor::new()),
            constraints_store: Some(constraints_store),
        }
    }

    /// Set constraints store after construction
    pub fn set_constraints_store(&mut self, store: Arc<ConstraintsStore>) {
        self.constraints_store = Some(store);
    }

    pub fn record_market_data_update(&self, exchange: &str, symbol: &str) {
        self.staleness_monitor.write().update(exchange, symbol);
    }

    pub fn update_policy(&self, new_policy: RiskPolicy) {
        let mut policy = self.policy.write();
        *policy = new_policy;
        info!("🛡️ Risk Policy Updated: {:?}", policy);
    }

    pub fn update_risk_state(&self, new_state: crate::risk_policy::RiskState) {
        let mut policy = self.policy.write();
        if policy.current_state != new_state {
            warn!(
                "🛡️ Risk State Transition: {:?} -> {:?}",
                policy.current_state, new_state
            );
            policy.current_state = new_state;

            // Metrics Export
            let metric_val = match new_state {
                crate::risk_policy::RiskState::Normal => 0,
                crate::risk_policy::RiskState::Cautious => 1,
                crate::risk_policy::RiskState::Defensive => 2,
                crate::risk_policy::RiskState::Emergency => 3,
            };
            use crate::metrics;
            metrics::set_risk_state(metric_val);
        }
    }

    pub fn record_heartbeat(&self) {
        self.last_heartbeat
            .store(chrono::Utc::now().timestamp_millis(), Ordering::Relaxed);
    }

    /// Record a slippage event observed during execution.
    /// If slippage exceeds policy limits, trigger state transition.
    pub fn record_slippage(&self, slippage_bps: u32) {
        let policy = self.policy.read();

        // Simple Logic: If single trade slippage > max_slippage_bps, we degrade state.
        // A more robust system would use a windowed error rate.
        if slippage_bps > policy.max_slippage_bps {
            warn!(
                "⚠️ High Slippage Detected: {} bps > {} bps limit",
                slippage_bps, policy.max_slippage_bps
            );

            // If massive slippage (> 2x limit), go DEFENSIVE immediately.
            // If just above limit, go CAUTIOUS.
            drop(policy); // Drop read lock to acquire write lock

            let mut policy_write = self.policy.write();
            if slippage_bps > policy_write.max_slippage_bps * 2 {
                if policy_write.current_state != crate::risk_policy::RiskState::Defensive
                    && policy_write.current_state != crate::risk_policy::RiskState::Emergency
                {
                    tracing::error!("🛡️ CIRCUIT BREAKER: Excessive Slippage -> DEFENSIVE");
                    policy_write.current_state = crate::risk_policy::RiskState::Defensive;
                    use crate::metrics;
                    metrics::set_risk_state(2); // Defensive
                }
            } else if policy_write.current_state == crate::risk_policy::RiskState::Normal {
                warn!("🛡️ CIRCUIT BREAKER: High Slippage -> CAUTIOUS");
                policy_write.current_state = crate::risk_policy::RiskState::Cautious;
                use crate::metrics;
                metrics::set_risk_state(1); // Cautious
            }
        }
    }

    pub fn get_policy(&self) -> RiskPolicy {
        self.policy.read().clone()
    }

    pub fn get_current_policy_hash(&self) -> String {
        self.policy.read().compute_hash()
    }

    /// Validates an Intent BEFORE it enters the Order Manager.
    /// Returns Ok(()) if safe, Err(RiskRejectionReason) if unsafe.
    pub fn check_pre_trade(&self, intent: &Intent) -> Result<(), RiskRejectionReason> {
        let policy = self.policy.read();

        // 0. CHECK DEFCON STATE
        {
            let manager = self.state_manager.read();
            let state = manager.get_state();

            // Allow ForceSync always
            if let crate::model::IntentType::ForceSync = intent.intent_type {
                return Ok(());
            }

            // In Emergency, reject all new opens. Reduce-only might be allowed.
            if *state == RiskState::Emergency {
                // If reduce only, maybe allow?
                if !RiskGuard::is_reduce_only(intent) {
                    warn!(signal_id = %intent.signal_id, "Rejected due to EMERGENCY state");
                    return Err(RiskRejectionReason::PolicyMissing); // Use existing or add new?
                                                                    // Ideally add RiskRejectionReason::SystemEmergency
                }
            }
        }

        // 0.5. Check Policy Hash (Final Veto)
        if let Some(ref intent_hash) = intent.policy_hash {
            let current_hash = policy.compute_hash();
            if *intent_hash != current_hash {
                warn!(
                    signal_id = %intent.signal_id,
                    expected = %current_hash,
                    actual = %intent_hash,
                    "Risk Reject: Policy Hash Mismatch"
                );
                return Err(RiskRejectionReason::PolicyHashMismatch {
                    expected: current_hash,
                    actual: intent_hash.clone(),
                });
            }
        }

        // 1. Check Circuit Breakers (Staleness)
        // If we haven't heard from Brain in 5 seconds, assume Brain is dead -> DEFENSIVE
        let now = chrono::Utc::now().timestamp_millis();
        let last = self.last_heartbeat.load(Ordering::Relaxed);
        let time_since_heartbeat = now - last;

        let mut is_stale = false;
        if time_since_heartbeat > 5000 {
            // We don't write lock here to update policy state to avoid contention in hot path,
            // but we treat it as DEFENSIVE locally.
            // Ideally we should have an atomic flag for "derived state".
            // For now, let's log once per stale check (might be spammy, but safe).
            warn!(
                "⚠️ Heartbeat STALE ({}ms). Treating as DEFENSIVE.",
                time_since_heartbeat
            );
            is_stale = true;
        }

        // Check Market Data Staleness
        if let Some(exchange) = &intent.exchange {
            let monitor = self.staleness_monitor.read();
            let max_staleness = policy.max_staleness_ms;
            if max_staleness > 0 && monitor.is_stale(exchange, &intent.symbol, max_staleness) {
                warn!(signal_id = %intent.signal_id, exchange, symbol = %intent.symbol, "Rejected due to STALE market data");
                return Err(RiskRejectionReason::MarketDataStale(format!(
                    "{} on {}",
                    intent.symbol, exchange
                )));
            }
        }

        let state = self.shadow_state.read(); // Read-only access to state

        // Determine Effective State

        let effective_state = if is_stale {
            crate::risk_policy::RiskState::Defensive
        } else {
            policy.current_state
        };

        // 0. Risk State Enforcement
        match effective_state {
            crate::risk_policy::RiskState::Emergency => {
                return Err(RiskRejectionReason::DailyLossLimitExceeded {
                    current_loss: Decimal::ZERO,
                    limit: Decimal::ZERO,
                }); // Generic "Halt" mapping
            }
            crate::risk_policy::RiskState::Defensive => {
                // Reject OPEN, Allow CLOSE
                if !Self::is_reduce_only(intent) {
                    warn!("Risk Reject: State is DEFENSIVE (Stale or Explicit). Close only.");
                    return Err(RiskRejectionReason::DailyLossLimitExceeded {
                        current_loss: Decimal::ZERO,
                        limit: Decimal::ZERO,
                    });
                }
            }
            _ => {} // Normal/Cautious allow trading subject to limits
        }

        // 1. Symbol Whitelist
        // Normalize symbol (e.g., BTC/USD -> BTC/USD)
        // Ideally we should handle standardization, but let's assume valid format from upstream.
        if !policy.symbol_whitelist.contains(&intent.symbol) && !policy.symbol_whitelist.is_empty()
        {
            // Check if it's a CLOSE intent. We might allow closes even on non-whitelisted symbols if we have a position?
            // "Fail Closed" implies strictly following whitelist. But if we are trying to exit a delisted symbol, we might need a bypass.
            // For now, stricly enforce. Flatten command should bypass this check or add ephemeral whitelist.
            warn!("Risk Reject: Symbol {} not in whitelist", intent.symbol);
            return Err(RiskRejectionReason::SymbolNotWhitelisted(
                intent.symbol.clone(),
            ));
        }

        // 2. Validate Size
        if intent.size <= Decimal::ZERO {
            return Err(RiskRejectionReason::InvalidSize);
        }

        // 2.5. EXECUTION CONSTRAINTS ENFORCEMENT (PowerLaw)
        // If we have a constraints store, check the symbol-specific constraints
        if let Some(ref constraints_store) = self.constraints_store {
            let venue = intent.exchange.as_deref().unwrap_or("unknown");
            let account = "main"; // TODO: Get from intent or config
            let constraints = constraints_store.get(venue, account, &intent.symbol);

            // Only enforce if mode is ENFORCEMENT (skip for SHADOW/ADVISORY)
            if matches!(constraints.mode, PolicyMode::Enforcement) {
                // Check reduce_only constraint
                if constraints.limits.reduce_only && !Self::is_reduce_only(intent) {
                    warn!(
                        symbol = %intent.symbol,
                        risk_mode = ?constraints.risk_mode,
                        "Constraint Reject: reduce_only mode active"
                    );
                    return Err(RiskRejectionReason::ConstraintReduceOnlyViolation {
                        symbol: intent.symbol.clone(),
                    });
                }

                // Check max_order_notional
                let check_price = intent.entry_zone.first().cloned().unwrap_or(Decimal::ZERO);
                if check_price > Decimal::ZERO {
                    let order_notional = intent.size * check_price;
                    if order_notional > constraints.limits.max_order_notional {
                        warn!(
                            symbol = %intent.symbol,
                            order_notional = %order_notional,
                            limit = %constraints.limits.max_order_notional,
                            "Constraint Reject: max_order_notional exceeded"
                        );
                        return Err(RiskRejectionReason::ConstraintMaxOrderNotionalExceeded {
                            symbol: intent.symbol.clone(),
                            order_notional,
                            limit: constraints.limits.max_order_notional,
                        });
                    }
                }

                // Check max_leverage against current account leverage
                if !Self::is_reduce_only(intent) && constraints.limits.max_leverage > Decimal::ZERO
                {
                    let total_pos_notional: Decimal = state
                        .get_all_positions()
                        .values()
                        .map(|p| p.size * p.entry_price)
                        .sum();

                    let new_notional = intent.size * check_price;
                    let total_exposure = total_pos_notional + new_notional;
                    let equity = state.get_equity();

                    if equity > Decimal::ZERO {
                        let current_leverage = total_exposure / equity;
                        if current_leverage > constraints.limits.max_leverage {
                            warn!(
                                symbol = %intent.symbol,
                                current_leverage = %current_leverage,
                                limit = %constraints.limits.max_leverage,
                                "Constraint Reject: max_leverage exceeded"
                            );
                            return Err(RiskRejectionReason::ConstraintMaxLeverageExceeded {
                                current: current_leverage,
                                limit: constraints.limits.max_leverage,
                            });
                        }
                    }
                }

                // Log advisory info for other risk modes
                if matches!(
                    constraints.risk_mode,
                    RiskMode::Caution | RiskMode::Defensive
                ) {
                    info!(
                        symbol = %intent.symbol,
                        risk_mode = ?constraints.risk_mode,
                        "Constraint Advisory: elevated risk mode"
                    );
                }
            }
        }

        // 3. Max Open Orders
        // Logic: active intents + live open orders
        let open_orders_count = state.count_open_intents_for_symbol(&intent.symbol);
        if open_orders_count >= policy.max_open_orders_per_symbol {
            // Check if reduce only (allow closing even if limit hit?)
            if !Self::is_reduce_only(intent) {
                warn!(
                    "Risk Reject: Max Open Orders {} >= Limit {}",
                    open_orders_count, policy.max_open_orders_per_symbol
                );
                return Err(RiskRejectionReason::MaxOpenOrdersExceeded {
                    symbol: intent.symbol.clone(),
                    current: open_orders_count,
                    limit: policy.max_open_orders_per_symbol,
                });
            }
        }

        // 4. Daily Loss Limit

        // 4. Daily Loss Limit
        // Sum PnL from trade history for today (UTC).
        let today = chrono::Utc::now().date_naive();
        let current_pnl: Decimal = state
            .get_trade_history()
            .iter()
            .filter(|t| t.closed_at.date_naive() == today)
            .map(|t| t.pnl)
            .sum();

        if current_pnl <= policy.max_daily_loss {
            // Allow CLOSE intents to reduce risk?
            // Simple guard: Block ALL new risk.
            // If intent is "Close", allow it.
            if !Self::is_reduce_only(intent) {
                warn!(
                    "Risk Reject: Daily Loss Limit {:.2} <= {:.2}",
                    current_pnl, policy.max_daily_loss
                );
                return Err(RiskRejectionReason::DailyLossLimitExceeded {
                    current_loss: current_pnl,
                    limit: policy.max_daily_loss,
                });
            }
        }

        // 5. Max Position Notional
        // If opening/increasing position, check size limit.
        let is_reduce = Self::is_reduce_only(intent);

        // Estimate entry price (limit or current market price?)
        // Use intent entry_zone first, else 0 (which makes notional 0, dangerous).
        // If entry zone empty, use a safe fallback or error?
        // We shouldn't block market orders if price is unknown, but we need price for notional.
        // Let's use the first entry zone price if available.
        let check_price = intent.entry_zone.first().cloned().unwrap_or(Decimal::ZERO);

        if !is_reduce && check_price > Decimal::ZERO {
            let existing_pos_size = state
                .get_position(&intent.symbol)
                .map(|p| p.size)
                .unwrap_or(Decimal::ZERO);
            let existing_pos_price = state
                .get_position(&intent.symbol)
                .map(|p| p.entry_price)
                .unwrap_or(Decimal::ZERO);

            let current_notional = existing_pos_size * existing_pos_price;
            let new_notional = intent.size * check_price;
            let total_notional = current_notional + new_notional;

            if total_notional > policy.max_position_notional {
                warn!(
                    "Risk Reject: Max Position Notional {:.2} > {:.2}",
                    total_notional, policy.max_position_notional
                );
                return Err(RiskRejectionReason::MaxPositionNotionalExceeded {
                    symbol: intent.symbol.clone(),
                    current: current_notional,
                    additional: new_notional,
                    limit: policy.max_position_notional,
                });
            }
        }

        // 6. Max Account Leverage (Global)
        // Leverage = Total Notional / Equity
        // Total Notional = Sum(|Position Notional|) + New Intent Notional
        if !is_reduce {
            let total_pos_notional: Decimal = state
                .get_all_positions()
                .values()
                .map(|p| p.size * p.entry_price) // using entry price as approximation for now
                .sum();

            // New Intent Notional (using check_price calculated earlier)
            let new_notional = intent.size * check_price;
            let total_exposure = total_pos_notional + new_notional;

            let equity = state.get_equity();

            // Avoid division by zero or negative equity edge cases
            if equity > Decimal::ZERO {
                let current_leverage = total_exposure / equity;
                if current_leverage > policy.max_account_leverage {
                    warn!(
                        "Risk Reject: Max Account Leverage {:.2}x > {:.2}x",
                        current_leverage, policy.max_account_leverage
                    );
                    return Err(RiskRejectionReason::MaxAccountLeverageExceeded {
                        current: current_leverage,
                        limit: policy.max_account_leverage,
                    });
                }
            } else if total_exposure > Decimal::ZERO {
                // Positive exposure with <= 0 equity is infinite leverage - REJECT
                warn!("Risk Reject: Positive exposure with <= 0 Equity");
                return Err(RiskRejectionReason::MaxAccountLeverageExceeded {
                    current: Decimal::from(999), // Infinite
                    limit: policy.max_account_leverage,
                });
            }
        }

        Ok(())
    }

    pub fn is_reduce_only(intent: &Intent) -> bool {
        use crate::model::IntentType;
        matches!(
            intent.intent_type,
            IntentType::Close
                | IntentType::CloseLong
                | IntentType::CloseShort
                | IntentType::ForceSync
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::ExecutionContext;
    use crate::model::{IntentStatus, IntentType};
    use crate::persistence::store::PersistenceStore;

    use chrono::Utc;
    use rust_decimal_macros::dec;

    use crate::persistence::redb_store::RedbStore;
    use crate::persistence::wal::WalManager;

    fn create_test_persistence() -> (Arc<PersistenceStore>, String) {
        let path = format!("/tmp/test_rg_{}.redb", uuid::Uuid::new_v4());
        let redb = Arc::new(RedbStore::new(&path).expect("Failed to create RedbStore"));
        let wal = Arc::new(WalManager::new(redb.clone()));
        let store = Arc::new(PersistenceStore::new(redb, wal));
        (store, path)
    }

    fn simple_intent(
        symbol: &str,
        size: Decimal,
        price: Decimal,
        intent_type: IntentType,
    ) -> Intent {
        Intent {
            signal_id: uuid::Uuid::new_v4().to_string(),
            symbol: symbol.to_string(),
            direction: 1,
            intent_type,
            entry_zone: vec![price],
            stop_loss: dec!(0),
            take_profits: vec![],
            size,
            status: IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
            t_analysis: None,
            t_decision: None,
            // Envelope
            ttl_ms: None,
            partition_key: None,
            causation_id: None,
            env: None,
            subject: None,
            t_ingress: None,
            t_exchange: None,
            max_slippage_bps: None,
            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
            exchange: None,
            position_mode: None,
            child_fills: vec![],
            filled_size: dec!(0),
            policy_hash: None,
        }
    }

    #[test]
    fn test_whitelist_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx, Some(10000.0))));
        let mut policy = RiskPolicy::default();
        policy.symbol_whitelist.clear();
        policy.symbol_whitelist.insert("BTC/USDT".to_string());

        let guard = RiskGuard::new(policy, state);

        let intent = simple_intent("ETH/USDT", dec!(1.0), dec!(2000), IntentType::BuySetup);
        let res = guard.check_pre_trade(&intent);
        assert!(matches!(
            res,
            Err(RiskRejectionReason::SymbolNotWhitelisted(_))
        ));

        let valid = simple_intent("BTC/USDT", dec!(1.0), dec!(50000), IntentType::BuySetup);
        assert!(guard.check_pre_trade(&valid).is_ok());

        std::fs::remove_file(path).unwrap_or(());
    }

    #[test]
    fn test_max_notional_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx, Some(10000.0))));
        let mut policy = RiskPolicy::default();
        policy.max_position_notional = dec!(10000.0); // Max $10k

        let guard = RiskGuard::new(policy, state);

        // $11k intent -> Reject
        let intent = simple_intent("BTC/USDT", dec!(1.1), dec!(10000), IntentType::BuySetup);
        let res = guard.check_pre_trade(&intent);
        assert!(matches!(
            res,
            Err(RiskRejectionReason::MaxPositionNotionalExceeded { .. })
        ));

        // $5k intent -> OK
        let valid = simple_intent("BTC/USDT", dec!(0.5), dec!(10000), IntentType::BuySetup);
        assert!(guard.check_pre_trade(&valid).is_ok());

        std::fs::remove_file(path).unwrap_or(());
    }

    #[test]
    fn test_daily_loss_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx, Some(10000.0))));
        let mut policy = RiskPolicy::default();
        policy.max_daily_loss = dec!(-800.0);

        let guard = RiskGuard::new(policy, state.clone());

        // inject loss into history
        {
            let mut s = state.write();

            // 1. Open Position

            let open = simple_intent("SOL/USDT", dec!(100.0), dec!(10.0), IntentType::BuySetup);
            s.process_intent(open.clone());
            s.confirm_execution(
                &open.signal_id,
                "child-open",
                dec!(100.0), // fill price
                dec!(10.0),  // fill size
                true,
                dec!(0),
                "USDT".to_string(),
                "MOCK",
            );
        }

        // 2. Close Position with LOSS
        {
            let mut s = state.write();
            let close = simple_intent("SOL/USDT", dec!(100.0), dec!(5.0), IntentType::CloseLong); // 50% loss
                                                                                                  // Entry 10, Limit 5. Loss (5-10)*100 = -500.
            s.process_intent(close.clone());
            s.confirm_execution(
                &close.signal_id,
                "child-close",
                dec!(5.0),
                dec!(5.0),
                true,
                dec!(0),
                "USDT".to_string(),
                "MOCK",
            );
        }

        // 3. Close AGAIN with LOSS (Need another pos)
        {
            let mut s = state.write();
            let open = simple_intent("SOL/USDT", dec!(100.0), dec!(10.0), IntentType::BuySetup);
            let sid = open.signal_id.clone();
            s.process_intent(open);
            s.confirm_execution(
                &sid,
                "child-open",
                dec!(100.0),
                dec!(10.0),
                true,
                dec!(0),
                "USDT".to_string(),
                "MOCK",
            );

            let close = simple_intent("SOL/USDT", dec!(100.0), dec!(5.0), IntentType::CloseLong);
            let sid2 = close.signal_id.clone();
            s.process_intent(close);
            s.confirm_execution(
                &sid2,
                "child-close",
                dec!(5.0),
                dec!(4.0),
                true,
                dec!(0),
                "USDT".to_string(),
                "MOCK",
            );
            // Loss (4-10)*100 = -600. Total = -1100.
        }

        // 4. Send new Intent -> Should Reject
        let intent = simple_intent("BTC/USDT", dec!(0.1), dec!(50000), IntentType::BuySetup);
        let res = guard.check_pre_trade(&intent);
        // Total loss -1100 <= -1000 limit.
        assert!(matches!(
            res,
            Err(RiskRejectionReason::DailyLossLimitExceeded { .. })
        ));

        // 5. Send CLOSE intent -> Should Allow
        let close_attempt = simple_intent("BTC/USDT", dec!(0.1), dec!(50000), IntentType::Close);
        assert!(guard.check_pre_trade(&close_attempt).is_ok());

        std::fs::remove_file(path).unwrap_or(());
    }
    #[test]
    fn test_max_account_leverage_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        // Equity = 1000
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx, Some(1000.0))));
        let mut policy = RiskPolicy::default();
        policy.max_account_leverage = dec!(5.0); // 5x Leverage Limit

        let guard = RiskGuard::new(policy, state.clone());

        // 1. Open Position: Notional $4000 (4x leverage). Should be OK.
        // 4000 / 1000 = 4.0 <= 5.0
        let intent1 = simple_intent("BTC/USDT", dec!(0.1), dec!(40000), IntentType::BuySetup);

        {
            let mut s = state.write();
            s.process_intent(intent1.clone());
            // Mock Fill to update position
            s.confirm_execution(
                &intent1.signal_id,
                "fill-1",
                dec!(40000),
                dec!(0.1),
                true,
                dec!(0),
                "USDT".to_string(),
                "Binance",
            );
        }

        // 2. New Intent: Notional $2000. Total = $6000. Leverage = 6.0 > 5.0 -> Reject
        let intent2 = simple_intent("ETH/USDT", dec!(1.0), dec!(2000), IntentType::BuySetup);
        let res = guard.check_pre_trade(&intent2);

        assert!(matches!(
            res,
            Err(RiskRejectionReason::MaxAccountLeverageExceeded { current, limit })
            if current == dec!(6.0) && limit == dec!(5.0)
        ));

        // 3. Reduce Only -> Allow even if leverage high (e.g. if equity dropped)
        // Simulate equity drop to $500. Leverage becomes 4000/500 = 8x.
        // Sending Close intent should be allowed.
        /* Note: ShadowState equity update logic isn't fully mocked here easily without modifying balance.
           But we can test simple 'reduce only' flag check.
        */
        let close_intent =
            simple_intent("BTC/USDT", dec!(0.05), dec!(40000), IntentType::CloseLong);
        assert!(guard.check_pre_trade(&close_intent).is_ok());

        std::fs::remove_file(path).unwrap_or(());
    }

    #[test]
    fn test_max_open_orders_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx, Some(10000.0))));
        let mut policy = RiskPolicy::default();
        policy.max_open_orders_per_symbol = 2; // Strict limit

        let guard = RiskGuard::new(policy, state.clone());

        // 1. Send 2 Pending Orders
        let i1 = simple_intent("BTC/USDT", dec!(0.1), dec!(50000), IntentType::BuySetup);
        let i2 = simple_intent("BTC/USDT", dec!(0.1), dec!(49000), IntentType::BuySetup);

        {
            let mut s = state.write();
            s.process_intent(i1);
            s.process_intent(i2);
        }

        // 2. Send 3rd Order -> Reject
        let i3 = simple_intent("BTC/USDT", dec!(0.1), dec!(48000), IntentType::BuySetup);
        let res = guard.check_pre_trade(&i3);

        assert!(matches!(
            res,
            Err(RiskRejectionReason::MaxOpenOrdersExceeded {
                current: 2,
                limit: 2,
                ..
            })
        ));

        // 3. Different Symbol -> OK
        let i_eth = simple_intent("ETH/USDT", dec!(1.0), dec!(2000), IntentType::BuySetup);
        assert!(guard.check_pre_trade(&i_eth).is_ok());

        std::fs::remove_file(path).unwrap_or(());
    }
}
