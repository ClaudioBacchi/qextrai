use super::models::DatabaseSettingsInput;
use super::postgres_service::build_pg_connect_options;
use super::storage::resolve_password;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

static FIELD_CATALOG_POOL: Mutex<Option<PgPool>> = Mutex::new(None);

pub async fn pool(app_local_data_dir: &Path) -> Result<PgPool, ConnectionManagerError> {
    if let Some(existing) = FIELD_CATALOG_POOL
        .lock()
        .map_err(|_| {
            ConnectionManagerError::Postgres("Pool PostgreSQL non disponibile.".to_string())
        })?
        .clone()
    {
        return Ok(existing);
    }

    let settings = super::storage::load_public_settings(app_local_data_dir)
        .map_err(ConnectionManagerError::Postgres)?;
    if settings.server.trim().is_empty() {
        return Err(ConnectionManagerError::NotConfigured);
    }

    let password = resolve_password(app_local_data_dir, "")
        .map_err(ConnectionManagerError::Postgres)?
        .ok_or(ConnectionManagerError::NotConfigured)?;

    let input = DatabaseSettingsInput {
        server: settings.server,
        port: settings.port,
        database: settings.database,
        username: settings.username,
        ssl_mode: settings.ssl_mode,
        password: String::new(),
    };
    let options = build_pg_connect_options(&input, &password);
    let pool = PgPoolOptions::new()
        .min_connections(0)
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(7))
        .connect_with(options)
        .await
        .map_err(|error| ConnectionManagerError::Postgres(redact(&error.to_string())))?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|error| ConnectionManagerError::MigrationFailed(redact(&error.to_string())))?;

    *FIELD_CATALOG_POOL.lock().map_err(|_| {
        ConnectionManagerError::Postgres("Pool PostgreSQL non disponibile.".to_string())
    })? = Some(pool.clone());
    Ok(pool)
}

pub fn invalidate_pool() {
    if let Ok(mut guard) = FIELD_CATALOG_POOL.lock() {
        if let Some(pool) = guard.take() {
            tauri::async_runtime::spawn(async move {
                pool.close().await;
            });
        }
    }
}

#[cfg(test)]
pub fn is_pool_cached_for_tests() -> bool {
    FIELD_CATALOG_POOL
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

fn redact(detail: &str) -> String {
    super::models::redact_secret_text(detail)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionManagerError {
    NotConfigured,
    MigrationFailed(String),
    Postgres(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidates_cached_pool_without_panicking() {
        invalidate_pool();
        assert!(!is_pool_cached_for_tests());
    }
}
