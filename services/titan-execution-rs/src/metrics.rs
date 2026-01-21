use once_cell::sync::Lazy;
use prometheus::{
    register_histogram, register_int_counter, register_int_gauge, Histogram, IntCounter, IntGauge,
};

// --- Execution Metrics (Phase 2 Remediation) ---

pub static ORDER_LATENCY: Lazy<Histogram> = Lazy::new(|| {
    register_histogram!(
        "titan_execution_order_latency_seconds",
        "End-to-end order execution latency (Intent -> Fill)",
        vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
    )
    .expect("order_latency histogram")
});

pub static SLIPPAGE_BPS: Lazy<Histogram> = Lazy::new(|| {
    register_histogram!(
        "titan_execution_slippage_bps",
        "Execution slippage in basis points",
        vec![0.0, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0]
    )
    .expect("slippage_bps histogram")
});

pub static RISK_STATE: Lazy<IntGauge> = Lazy::new(|| {
    register_int_gauge!(
        "titan_execution_risk_state",
        "Current Risk State (0=Normal, 1=Cautious, 2=Defensive)"
    )
    .expect("risk_state gauge")
});

pub static ACTIVE_POSITIONS: Lazy<IntGauge> = Lazy::new(|| {
    register_int_gauge!(
        "titan_execution_active_positions",
        "Number of currently active positions"
    )
    .expect("active_positions gauge")
});

pub static FILLED_ORDERS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_filled_orders_total",
        "Total orders successfully filled"
    )
    .expect("filled_orders counter")
});

pub static INVALID_INTENTS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_invalid_intents_total",
        "Total invalid intent payloads received"
    )
    .expect("invalid_intents counter")
});

pub static EXPIRED_INTENTS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_expired_intents_total",
        "Total intents rejected due to expiry"
    )
    .expect("expired_intents counter")
});

pub static DLQ_PUBLISHED: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_dlq_published_total",
        "Total intents published to DLQ"
    )
    .expect("dlq_published counter")
});

pub static FANOUT_ORDERS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_fanout_orders_total",
        "Total fan-out child orders created"
    )
    .expect("fanout_orders counter")
});

pub static POSITION_FLIPS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_position_flips_total",
        "Total position flips executed"
    )
    .expect("position_flips counter")
});

pub static RISK_REJECTIONS: Lazy<IntCounter> = Lazy::new(|| {
    register_int_counter!(
        "titan_execution_risk_rejections_total",
        "Total risk guard rejections"
    )
    .expect("risk_rejections counter")
});

// --- NATS Telemetry ---
pub static NATS_LAG: Lazy<IntGauge> = Lazy::new(|| {
    register_int_gauge!("nats_lag_messages", "Current consumer lag in messages")
        .expect("nats_lag gauge")
});

pub static NATS_IN_PROCESS: Lazy<IntGauge> = Lazy::new(|| {
    register_int_gauge!(
        "nats_messages_in_process",
        "Messages currently being processed"
    )
    .expect("nats_in_process gauge")
});

pub static NATS_STORAGE_BYTES: Lazy<IntGauge> = Lazy::new(|| {
    register_int_gauge!(
        "nats_storage_pressure_bytes",
        "Stream storage usage in bytes"
    )
    .expect("nats_storage_pressure gauge")
});

pub fn inc_invalid_intents() {
    INVALID_INTENTS.inc();
}

pub fn inc_expired_intents() {
    EXPIRED_INTENTS.inc();
}

pub fn inc_dlq_published() {
    DLQ_PUBLISHED.inc();
}

pub fn inc_fanout_orders(count: u64) {
    FANOUT_ORDERS.inc_by(count);
}

pub fn inc_position_flips() {
    POSITION_FLIPS.inc();
}

pub fn inc_risk_rejections() {
    RISK_REJECTIONS.inc();
}

pub fn set_nats_lag(val: i64) {
    NATS_LAG.set(val);
}

pub fn set_nats_storage_bytes(val: i64) {
    NATS_STORAGE_BYTES.set(val);
}

// --- Phase 2 Helpers ---

pub fn observe_order_latency(duration_sec: f64) {
    ORDER_LATENCY.observe(duration_sec);
}

pub fn observe_slippage(bps: f64) {
    SLIPPAGE_BPS.observe(bps);
}

pub fn set_risk_state(state: i64) {
    RISK_STATE.set(state);
}

pub fn set_active_positions(count: i64) {
    ACTIVE_POSITIONS.set(count);
}

pub fn inc_filled_orders() {
    FILLED_ORDERS.inc();
}
