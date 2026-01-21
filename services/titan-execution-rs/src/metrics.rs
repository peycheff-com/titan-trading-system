use once_cell::sync::Lazy;
use prometheus::{register_int_counter, register_int_gauge, IntCounter, IntGauge};

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
