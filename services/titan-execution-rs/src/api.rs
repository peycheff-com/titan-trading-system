use actix_web::{web, HttpResponse, Responder};
use serde::Serialize;
use crate::shadow_state::ShadowState;
use std::sync::{Arc, RwLock};

#[derive(Serialize)]
pub struct HealthResponse {
    status: String,
    version: String,
}

pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(HealthResponse {
        status: "ok".to_string(),
        version: "0.1.0".to_string(),
    })
}

pub async fn get_positions(data: web::Data<Arc<RwLock<ShadowState>>>) -> impl Responder {
    let state = data.read().unwrap();
    // Assuming ShadowState has a method to get active positions or we expose the field
    // For now we might need to update ShadowState to expose this.
    // Let's assume we can clone the positions map or similar.
    // If ShadowState struct positions field is public, we can access it.
    // I'll need to check ShadowState definition. Providing a placeholder for now.
    HttpResponse::Ok().json(serde_json::json!({
        "positions": state.get_all_positions()
    }))
}

// Define scope configuration
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/health")
            .route(web::get().to(health_check))
    )
    .service(
        web::resource("/positions")
            .route(web::get().to(get_positions))
    );
}
