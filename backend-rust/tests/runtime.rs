use serde_json::json;
use toolgate_core::runtime::{canonical, choice, strict_json};
#[test]
fn rejects_duplicate_and_unsafe_json() {
    for raw in [
        r#"{"x":1,"\u0078":2}"#,
        r#"{"constructor":0}"#,
        "9007199254740992",
        "1e999",
        "{} {}",
    ] {
        assert!(strict_json(raw.as_bytes()).is_err());
    }
}
#[test]
fn canonical_and_closed_choice() {
    assert_eq!(
        canonical(&json!({"z":-0.0,"a":0.0000001})).ok().as_deref(),
        Some("{\"a\":1e-7,\"z\":0}")
    );
    let bad = json!({"model":"jev-fixture","answers":{"selection":{"type":"choice","choice":"foreign","confidence":1,"probabilities":{"t0001":1,"none":0}}}});
    assert!(choice(&bad, &["t0001".into(), "none".into()]).is_err());
}
