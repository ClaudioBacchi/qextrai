use serde::{Deserialize, Serialize};
use std::fmt;

pub const SETTINGS_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSettingsPublic {
    pub server: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub ssl_mode: SslMode,
    pub password_configured: bool,
}

impl Default for DatabaseSettingsPublic {
    fn default() -> Self {
        Self {
            server: String::new(),
            port: 5432,
            database: String::new(),
            username: String::new(),
            ssl_mode: SslMode::Prefer,
            password_configured: false,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSettingsInput {
    pub server: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub ssl_mode: SslMode,
    pub password: String,
}

impl fmt::Debug for DatabaseSettingsInput {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("DatabaseSettingsInput")
            .field("server", &self.server)
            .field("port", &self.port)
            .field("database", &self.database)
            .field("username", &self.username)
            .field("ssl_mode", &self.ssl_mode)
            .field("password", &"<redacted>")
            .finish()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    Prefer,
    Require,
    VerifyCa,
    VerifyFull,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub success: bool,
    pub status: ConnectionStatus,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionStatus {
    Success,
    ServerUnreachable,
    Timeout,
    AuthenticationFailed,
    DatabaseMissing,
    TlsError,
    ConfigurationIncomplete,
    PostgresError,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub message: String,
    pub detail: String,
}

impl CommandError {
    pub fn new(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            detail: redact_secret_text(&detail.into()),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDatabaseSettings {
    pub version: u32,
    pub server: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub ssl_mode: SslMode,
    pub encrypted_password_base64: Option<String>,
}

impl StoredDatabaseSettings {
    pub fn public(&self) -> DatabaseSettingsPublic {
        DatabaseSettingsPublic {
            server: self.server.clone(),
            port: self.port,
            database: self.database.clone(),
            username: self.username.clone(),
            ssl_mode: self.ssl_mode,
            password_configured: self.encrypted_password_base64.is_some(),
        }
    }
}

pub fn redact_secret_text(input: &str) -> String {
    let mut redacted = input.to_string();
    for key in ["PWD", "Password", "password", "pwd"] {
        redacted = redact_key_value(&redacted, key);
    }
    redacted
}

fn redact_key_value(input: &str, key: &str) -> String {
    let lower = input.to_lowercase();
    let pattern = format!("{}=", key.to_lowercase());
    let Some(start) = lower.find(&pattern) else {
        return input.to_string();
    };
    let value_start = start + key.len() + 1;
    let value_end = input[value_start..]
        .find(';')
        .map(|offset| value_start + offset)
        .unwrap_or(input.len());
    format!("{}<redacted>{}", &input[..value_start], &input[value_end..])
}
