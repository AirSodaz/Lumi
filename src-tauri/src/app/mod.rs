use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use crate::{
    errors::{AppError, AppResult},
    providers::{ProviderRegistry, ServerProfile},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemePreference,
    pub material_effects_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemePreference::System,
            material_effects_enabled: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPatch {
    pub theme: Option<ThemePreference>,
    pub material_effects_enabled: Option<bool>,
}

#[derive(Default)]
pub struct AppState {
    provider_registry: ProviderRegistry,
    server_profiles: RwLock<Vec<ServerProfile>>,
    settings: RwLock<AppSettings>,
}

impl AppState {
    pub fn provider_registry(&self) -> &ProviderRegistry {
        &self.provider_registry
    }

    pub fn list_servers(&self) -> AppResult<Vec<ServerProfile>> {
        Ok(self
            .server_profiles
            .read()
            .map_err(|_| AppError::state_lock_poisoned("server_profiles"))?
            .clone())
    }

    pub fn settings(&self) -> AppSettings {
        self.settings
            .read()
            .map(|settings| settings.clone())
            .unwrap_or_else(|_| AppSettings::default())
    }

    pub fn update_settings(&self, patch: AppSettingsPatch) -> AppResult<AppSettings> {
        let mut settings = self
            .settings
            .write()
            .map_err(|_| AppError::state_lock_poisoned("settings"))?;

        if let Some(theme) = patch.theme {
            settings.theme = theme;
        }

        if let Some(material_effects_enabled) = patch.material_effects_enabled {
            settings.material_effects_enabled = material_effects_enabled;
        }

        Ok(settings.clone())
    }
}
