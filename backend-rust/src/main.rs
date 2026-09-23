//! Local bootstrap server with bounded graceful shutdown.
#![forbid(unsafe_code)]

use std::{env, future::IntoFuture, io, process::ExitCode, time::Duration};
use tokio::{
    net::TcpListener,
    signal::unix::{SignalKind, signal},
    sync::oneshot,
    time::timeout,
};
use toolgate_core::{listen_address, router};

#[tokio::main(worker_threads = 2)]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => {
            // Never emit arbitrary configuration or error chains.
            eprintln!("bootstrap failed");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let raw = match env::var("TOOLGATE_LISTEN_ADDR") {
        Ok(value) => value,
        Err(env::VarError::NotPresent) => String::new(),
        Err(error) => return Err(error.into()),
    };
    let address = listen_address(&raw).map_err(io::Error::other)?;
    let listener = TcpListener::bind(address).await?;
    let mut terminate = signal(SignalKind::terminate())?;
    let mut interrupt = signal(SignalKind::interrupt())?;
    let (shutdown, receive) = oneshot::channel();
    let router = if let Ok(database) = env::var("TOOLGATE_DATABASE_URL") {
        toolgate_core::runtime::Core::new(
            &database,
            &env::var("TOOLGATE_KEY_PEPPER")?,
            env::var("TOOLGATE_JEV_BASE_URL")
                .unwrap_or_else(|_| "https://api.typesafe.ai/v1/systemone".into()),
            env::var("TYPESAFE_AI_API_KEY").unwrap_or_default(),
            env::var("TOOLGATE_JEV_MODEL").unwrap_or_else(|_| "jev-1.13.0".into()),
            env::var("TOOLGATE_CONNECT_TIMEOUT_MS")
                .unwrap_or_else(|_| "300".into())
                .parse::<u64>()?,
            env::var("TOOLGATE_SELECTOR_MODE").unwrap_or_else(|_| "choice".into()),
        )
        .await?
        .router()
    } else {
        router()
    };
    let server = axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = receive.await;
        })
        .into_future();
    tokio::pin!(server);
    eprintln!("bootstrap listening address={address} readiness=not_ready");
    tokio::select! {
        result = &mut server => { result?; return Ok(()); }
        _ = terminate.recv() => {}
        _ = interrupt.recv() => {}
    }
    shutdown
        .send(())
        .map_err(|_| io::Error::other("shutdown receiver closed"))?;
    timeout(Duration::from_secs(10), &mut server).await??;
    Ok(())
}
