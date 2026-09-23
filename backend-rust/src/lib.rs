//! Local core bootstrap. Business operations are implemented in later slices.
#![forbid(unsafe_code)]
pub mod runtime;

use axum::{
    Json, Router,
    http::{StatusCode, header},
    routing::get,
};
use serde::Serialize;
use std::net::SocketAddr;

/// Only loopback is supported until authentication and storage are implemented.
pub fn listen_address(raw: &str) -> Result<SocketAddr, &'static str> {
    let raw = if raw.is_empty() {
        "127.0.0.1:9082"
    } else {
        raw
    };
    let address: SocketAddr = raw.parse().map_err(|_| "invalid listen address")?;
    if !address.ip().is_loopback() || address.port() == 0 {
        return Err("listen address must use a loopback IP and nonzero port");
    }
    Ok(address)
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
enum HealthStatus {
    Ok,
    NotReady,
}

#[derive(Serialize)]
struct Health {
    status: HealthStatus,
}

/// Liveness has no dependencies; readiness fails until DB/catalog bootstrap.
pub fn router() -> Router {
    Router::new()
        .route(
            "/health/live",
            get(|| async {
                (
                    [(header::CACHE_CONTROL, "no-store")],
                    Json(Health {
                        status: HealthStatus::Ok,
                    }),
                )
            }),
        )
        .route(
            "/health/ready",
            get(|| async {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    [(header::CACHE_CONTROL, "no-store")],
                    Json(Health {
                        status: HealthStatus::NotReady,
                    }),
                )
            }),
        )
}
