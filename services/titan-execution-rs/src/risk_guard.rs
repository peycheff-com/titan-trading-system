use crate::model::Intent;
use crate::risk_policy::RiskPolicy;
use crate::shadow_state::ShadowState;
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
    InvalidSize,
    PolicyMissing,
}

impl std::fmt::Display for RiskRejectionReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RiskRejectionReason::SymbolNotWhitelisted(s) => {
                write!(f, "Symbol '{}' not in whitelist", s)
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
            RiskRejectionReason::InvalidSize => write!(f, "Invalid size (<= 0)"),
            RiskRejectionReason::PolicyMissing => write!(f, "Risk Policy not loaded"),
        }
    }
}

use std::sync::atomic::{AtomicI64, Ordering};

pub struct RiskGuard {
    policy: Arc<RwLock<RiskPolicy>>,
    shadow_state: Arc<RwLock<ShadowState>>,
    last_heartbeat: Arc<AtomicI64>,
}

impl RiskGuard {
    pub fn new(policy: RiskPolicy, shadow_state: Arc<RwLock<ShadowState>>) -> Self {
        info!("🛡️ RiskGuard Initialized with policy: {:?}", policy);
        Self {
            policy: Arc::new(RwLock::new(policy)),
            shadow_state,
            last_heartbeat: Arc::new(AtomicI64::new(chrono::Utc::now().timestamp_millis())),
        }
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
                }
            } else if policy_write.current_state == crate::risk_policy::RiskState::Normal {
                warn!("🛡️ CIRCUIT BREAKER: High Slippage -> CAUTIOUS");
                policy_write.current_state = crate::risk_policy::RiskState::Cautious;
            }
        }
    }

    pub fn get_policy(&self) -> RiskPolicy {
        self.policy.read().clone()
    }

    /// Validates an Intent BEFORE it enters the Order Manager.
    /// Returns Ok(()) if safe, Err(RiskRejectionReason) if unsafe.
    pub fn check_pre_trade(&self, intent: &Intent) -> Result<(), RiskRejectionReason> {
        // 0. Fail Closed Check (Heartbeat)
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

        let policy = self.policy.read();
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

        // 3. Max Open Orders
        // Logic: active intents + live open orders
        if let Some(_child_orders) = state.get_child_orders(&intent.signal_id) {
            // This is a rough proxy since we don't track ALL open orders in ShadowState perfectly yet
            // (we only track child orders of intents).
            // Better check: How many PENDING intents for this symbol?
            // For MVP, skip complex count.
        }

        // 4. Daily Loss Limit
        // Sum PnL from trade history for today.
        // TODO: Filter history by 'today'. For now, use total history buffer (assuming it's recent).
        let current_pnl: Decimal = state.get_trade_history().iter().map(|t| t.pnl).sum();
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

        Ok(())
    }

    fn is_reduce_only(intent: &Intent) -> bool {
        use crate::model::IntentType;
        match intent.intent_type {
            IntentType::Close | IntentType::CloseLong | IntentType::CloseShort => true,
            _ => false,
        }
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
            t_ingress: None,
            t_exchange: None,
            max_slippage_bps: None,
            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
            exchange: None,
            position_mode: None,
        }
    }

    #[test]
    fn test_whitelist_rejection() {
        let (p, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx)));
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
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx)));
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
        let state = Arc::new(RwLock::new(ShadowState::new(p, ctx)));
        let mut policy = RiskPolicy::default();
        policy.max_daily_loss = dec!(-1000.0);

        let guard = RiskGuard::new(policy, state.clone());

        // inject loss into history
        {
            let mut s = state.write();

            // 1. Open Position

            let open = simple_intent("SOL/USDT", dec!(100.0), dec!(10.0), IntentType::BuySetup);
            s.process_intent(open.clone());
            s.confirm_execution(
                &open.signal_id,
                dec!(10.0),
                dec!(100.0),
                true,
                dec!(0),
                "USDT".to_string(),
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
                dec!(5.0),
                dec!(100.0),
                true,
                dec!(0),
                "USDT".to_string(),
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
                dec!(10.0),
                dec!(100.0),
                true,
                dec!(0),
                "USDT".to_string(),
            );

            let close = simple_intent("SOL/USDT", dec!(100.0), dec!(5.0), IntentType::CloseLong);
            let sid2 = close.signal_id.clone();
            s.process_intent(close);
            s.confirm_execution(
                &sid2,
                dec!(4.0),
                dec!(100.0),
                true,
                dec!(0),
                "USDT".to_string(),
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
}
