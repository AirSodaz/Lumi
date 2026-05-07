use std::{collections::HashMap, sync::RwLock};

use keyring_core::{Entry, Error as KeyringError};
use serde_json::json;

use crate::{
    errors::{AppError, AppResult},
    providers::ServerProfile,
};

use super::provider_kind_slug;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CredentialKey {
    service: String,
    account: String,
}

impl CredentialKey {
    pub fn new(service: impl Into<String>, account: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            account: account.into(),
        }
    }

    pub fn server_token(profile: &ServerProfile) -> Self {
        Self::new(
            format!(
                "app.lumi.desktop.{}.token",
                provider_kind_slug(profile.provider_kind)
            ),
            format!("server:{}:user:{}", profile.id, profile.user_id),
        )
    }

    pub fn service(&self) -> &str {
        &self.service
    }

    pub fn account(&self) -> &str {
        &self.account
    }
}

pub trait CredentialStore: Send + Sync {
    fn get_token(&self, key: &CredentialKey) -> AppResult<Option<String>>;

    fn set_token(&self, key: &CredentialKey, token: &str) -> AppResult<()>;

    fn delete_token(&self, key: &CredentialKey) -> AppResult<()>;
}

#[derive(Default)]
pub struct MemoryCredentialStore {
    entries: RwLock<HashMap<CredentialKey, String>>,
}

impl CredentialStore for MemoryCredentialStore {
    fn get_token(&self, key: &CredentialKey) -> AppResult<Option<String>> {
        Ok(self
            .entries
            .read()
            .map_err(|_| AppError::state_lock_poisoned("credential_store"))?
            .get(key)
            .cloned())
    }

    fn set_token(&self, key: &CredentialKey, token: &str) -> AppResult<()> {
        self.entries
            .write()
            .map_err(|_| AppError::state_lock_poisoned("credential_store"))?
            .insert(key.clone(), token.to_string());

        Ok(())
    }

    fn delete_token(&self, key: &CredentialKey) -> AppResult<()> {
        self.entries
            .write()
            .map_err(|_| AppError::state_lock_poisoned("credential_store"))?
            .remove(key);

        Ok(())
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SystemCredentialStore;

impl SystemCredentialStore {
    pub fn new() -> AppResult<Self> {
        keyring::use_native_store(false).map_err(map_keyring_error)?;
        Ok(Self)
    }

    fn entry(&self, key: &CredentialKey) -> AppResult<Entry> {
        Entry::new(key.service(), key.account()).map_err(map_keyring_error)
    }
}

impl CredentialStore for SystemCredentialStore {
    fn get_token(&self, key: &CredentialKey) -> AppResult<Option<String>> {
        match self.entry(key)?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(map_keyring_error(error)),
        }
    }

    fn set_token(&self, key: &CredentialKey, token: &str) -> AppResult<()> {
        self.entry(key)?
            .set_password(token)
            .map_err(map_keyring_error)
    }

    fn delete_token(&self, key: &CredentialKey) -> AppResult<()> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(map_keyring_error(error)),
        }
    }
}

fn map_keyring_error(error: KeyringError) -> AppError {
    AppError::new(
        "persistence.credential_store",
        "Credential store operation failed",
    )
    .with_recoverable(true)
    .with_detail(json!({ "source": error.to_string() }))
}
