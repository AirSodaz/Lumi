use std::fmt::{self, Display};

use serde::Serialize;
use serde_json::{json, Value};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    code: String,
    message: String,
    recoverable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<Value>,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recoverable: false,
            detail: None,
        }
    }

    pub fn with_recoverable(mut self, recoverable: bool) -> Self {
        self.recoverable = recoverable;
        self
    }

    pub fn with_detail(mut self, detail: Value) -> Self {
        self.detail = Some(detail);
        self
    }

    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn recoverable(&self) -> bool {
        self.recoverable
    }

    pub fn state_lock_poisoned(resource: &'static str) -> Self {
        Self::new("state.lock_poisoned", "Application state lock was poisoned")
            .with_detail(json!({ "resource": resource }))
    }
}

impl Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        Self::new("persistence.sqlite", "SQLite persistence operation failed")
            .with_detail(json!({ "source": error.to_string() }))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::new(
            "persistence.json",
            "Stored JSON data could not be processed",
        )
        .with_detail(json!({ "source": error.to_string() }))
    }
}
