use lumi_lib::errors::{AppError, AppResult};
use serde_json::json;

#[test]
fn app_error_serializes_stable_contract_fields() {
    let error = AppError::new("bootstrap.unavailable", "Bootstrap unavailable")
        .with_recoverable(true)
        .with_detail(json!({ "command": "get_bootstrap_status" }));

    let serialized = serde_json::to_value(&error).expect("serialize AppError");

    assert_eq!(serialized["code"], "bootstrap.unavailable");
    assert_eq!(serialized["message"], "Bootstrap unavailable");
    assert_eq!(serialized["recoverable"], true);
    assert_eq!(
        serialized["detail"],
        json!({ "command": "get_bootstrap_status" })
    );
}

#[test]
fn app_result_alias_supports_app_error() {
    fn fail() -> AppResult<()> {
        Err(AppError::new("bootstrap.failed", "Bootstrap failed"))
    }

    let error = fail().expect_err("expected AppError");

    assert_eq!(error.code(), "bootstrap.failed");
    assert!(!error.recoverable());
}
