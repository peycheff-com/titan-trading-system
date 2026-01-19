pub mod api;
pub mod exchange;
pub mod model;
pub mod order_manager;
pub mod rate_limiter;
pub mod shadow_state;

#[cfg(test)]
mod tests;

pub mod circuit_breaker;
pub mod config;
pub mod impact_calculator;
pub mod market_data;
pub mod nats_engine;
pub mod simulation_engine;
