use crate::risk_guard::RiskGuard;
use crate::risk_policy::RiskState;
use crate::shadow_state::ShadowState;
use actix_web::{web, HttpResponse, Responder};
use async_nats::Client as NatsClient;
use parking_lot::RwLock;
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
pub struct HealthResponse {
    status: String,
    version: String,
    dependencies: Dependencies,
}

#[derive(Serialize)]
pub struct Dependencies {
    nats: String,
}

#[derive(Serialize)]
pub struct StatusResponse {
    mode: String,
    reasons: Vec<String>,
    actions: Vec<String>,
    unsafe_actions: Vec<String>,
}

pub async fn health_check(nats: web::Data<NatsClient>) -> impl Responder {
    let nats_status = nats.connection_state();
    let is_connected = matches!(nats_status, async_nats::connection::State::Connected);

    let status = if is_connected { "ok" } else { "unhealthy" };
    let mut http_status = if is_connected {
        HttpResponse::Ok()
    } else {
        HttpResponse::ServiceUnavailable()
    };

    http_status.json(HealthResponse {
        status: status.to_string(),
        version: "0.1.0".to_string(),
        dependencies: Dependencies {
            nats: format!("{:?}", nats_status),
        },
    })
}

pub async fn system_status(risk_guard: web::Data<Arc<RiskGuard>>) -> impl Responder {
    let policy = risk_guard.get_policy();

    let (mode, actions, unsafe_actions) = match policy.current_state {
        RiskState::Normal => ("NORMAL", vec!["Monitor Logs"], vec![]),
        RiskState::Cautious => (
            "CAUTIOUS",
            vec!["Monitor Slippage", "Check Market Volatility"],
            vec![],
        ),
        RiskState::Defensive => (
            "DEFENSIVE",
            vec![
                "Investigate Cause",
                "Manual Reset Required to Resume Opening",
            ],
            vec!["Do NOT Force Open Positions"],
        ),
        RiskState::Emergency => (
            "EMERGENCY",
            vec!["ALL TRADING HALTED", "Investigate IMMEDIATELY"],
            vec!["Do NOT Restart without Audit"],
        ),
    };

    HttpResponse::Ok().json(StatusResponse {
        mode: mode.to_string(),
        reasons: vec![format!("Risk State: {:?}", policy.current_state)],
        actions: actions.into_iter().map(String::from).collect(),
        unsafe_actions: unsafe_actions.into_iter().map(String::from).collect(),
    })
}

pub async fn get_positions(data: web::Data<Arc<RwLock<ShadowState>>>) -> impl Responder {
    let state = data.read();
    HttpResponse::Ok().json(serde_json::json!({
        "positions": state.get_all_positions()
    }))
}

// Define scope configuration
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(web::resource("/health").route(web::get().to(health_check)))
        .service(web::resource("/status").route(web::get().to(system_status)))
        .service(web::resource("/positions").route(web::get().to(get_positions)));
}
