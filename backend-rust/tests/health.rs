use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use toolgate_core::{listen_address, router};
use tower::ServiceExt;

#[tokio::test]
async fn health_contract() {
    for (method, path, status, body) in [
        ("GET", "/health/live", 200, Some(r#"{"status":"ok"}"#)),
        (
            "GET",
            "/health/ready",
            503,
            Some(r#"{"status":"not_ready"}"#),
        ),
        ("POST", "/health/live", 405, None),
        ("GET", "/health/live/extra", 404, None),
        ("HEAD", "/health/live", 200, Some("")),
    ] {
        let response = router()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .body(Body::empty())
                    .expect("valid test request"),
            )
            .await
            .expect("infallible router");
        assert_eq!(response.status().as_u16(), status, "{method} {path}");
        if let Some(body) = body {
            assert_eq!(response.headers()["content-type"], "application/json");
            assert_eq!(response.headers()["cache-control"], "no-store");
            let bytes = to_bytes(response.into_body(), 1024)
                .await
                .expect("bounded health body");
            assert_eq!(bytes.as_ref(), body.as_bytes());
        }
    }
}

#[test]
fn local_configuration() {
    assert_eq!(
        listen_address("").expect("default address").to_string(),
        "127.0.0.1:9082"
    );
    for valid in ["127.0.0.1:19082", "[::1]:9082"] {
        assert_eq!(
            listen_address(valid).expect("loopback address").to_string(),
            valid
        );
    }
    for invalid in [
        "0.0.0.0:9082",
        ":9082",
        "remote.example:9082",
        "127.0.0.1:0",
        "127.0.0.1:invalid",
    ] {
        assert!(listen_address(invalid).is_err(), "accepted {invalid}");
    }
}
