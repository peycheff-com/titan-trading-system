use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpMessage,
};
use futures::future::{ok, Ready};
use futures::Future;
use std::env;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

pub struct AuthMiddleware;

impl<S, B> Transform<S, ServiceRequest> for AuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthMiddlewareMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(AuthMiddlewareMiddleware {
            service: Rc::new(service),
        })
    }
}

pub struct AuthMiddlewareMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuthMiddlewareMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let srv = self.service.clone();

        Box::pin(async move {
            // SCENARIO 1: Skip auth for OPTIONS (CORS preflight) and /metrics
            if req.method() == actix_web::http::Method::OPTIONS
                || req.path() == "/metrics"
                || req.path() == "/health"
            {
                return srv.call(req).await;
            }

            // SCENARIO 2: Check API Key
            let api_key_env = env::var("TITAN_EXECUTION_API_KEY").unwrap_or_default();

            // If explicit "OPEN_ACCESS" is set (dev mode only), or if key provided matches
            // Ideally we fail-closed if key is not set in env.

            // Allow if env var is empty? NO. Should be secure by default.
            if api_key_env.is_empty() {
                // Log warning?
                // For safety, if no key configured, reject everything except health/metrics
                return Err(actix_web::error::ErrorUnauthorized(
                    "API Key not configured on server",
                ));
            }

            if let Some(header) = req.headers().get("x-api-key") {
                if let Ok(key_str) = header.to_str() {
                    if key_str == api_key_env {
                        return srv.call(req).await;
                    }
                }
            }

            // Reject
            Err(actix_web::error::ErrorUnauthorized("Invalid API Key"))
        })
    }
}
