use super::models::{ConnectionStatus, ConnectionTestResult, DatabaseSettingsInput, SslMode};
use super::validation::validate_settings;
use sqlx::postgres::{PgConnectOptions, PgSslMode};
use sqlx::{Connection, PgConnection};
use std::time::Duration;

pub fn build_pg_connect_options(
    settings: &DatabaseSettingsInput,
    password: &str,
) -> PgConnectOptions {
    PgConnectOptions::new()
        .host(settings.server.trim())
        .port(settings.port)
        .database(settings.database.trim())
        .username(settings.username.trim())
        .password(password)
        .ssl_mode(map_ssl_mode(settings.ssl_mode))
        .application_name("qExtrai")
}

pub fn map_ssl_mode(ssl_mode: SslMode) -> PgSslMode {
    match ssl_mode {
        SslMode::Prefer => PgSslMode::Prefer,
        SslMode::Require => PgSslMode::Require,
        SslMode::VerifyCa => PgSslMode::VerifyCa,
        SslMode::VerifyFull => PgSslMode::VerifyFull,
    }
}

pub async fn test_connection(
    settings: DatabaseSettingsInput,
    password: String,
) -> Result<ConnectionTestResult, String> {
    validate_settings(&settings)?;
    if password.is_empty() {
        return Ok(failed(
            ConnectionStatus::ConfigurationIncomplete,
            "Password PostgreSQL non configurata.",
        ));
    }

    let result = tokio::time::timeout(Duration::from_secs(7), async {
        let options = build_pg_connect_options(&settings, &password);
        let mut connection = PgConnection::connect_with(&options).await?;
        sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&mut connection)
            .await?;
        connection.close().await?;
        Ok::<(), sqlx::Error>(())
    })
    .await;

    match result {
        Ok(Ok(())) => Ok(ConnectionTestResult {
            success: true,
            status: ConnectionStatus::Success,
            message: "Connessione riuscita.".to_string(),
        }),
        Ok(Err(error)) => {
            let detail = error.to_string();
            eprintln!(
                "PostgreSQL connection test failed: {}",
                redact_error_detail(&detail)
            );
            Ok(classify_sqlx_error(&error))
        }
        Err(_) => Ok(failed(
            ConnectionStatus::Timeout,
            "Connessione non riuscita: timeout durante il collegamento.",
        )),
    }
}

fn classify_sqlx_error(error: &sqlx::Error) -> ConnectionTestResult {
    if let sqlx::Error::Database(database_error) = error {
        let code = database_error.code().map(|value| value.to_string());
        return match code.as_deref() {
            Some("28P01") => failed(
                ConnectionStatus::AuthenticationFailed,
                "Connessione non riuscita: utente o password non validi.",
            ),
            Some("3D000") => failed(
                ConnectionStatus::DatabaseMissing,
                "Connessione non riuscita: database non trovato.",
            ),
            _ => failed(
                ConnectionStatus::PostgresError,
                "Connessione non riuscita: errore PostgreSQL.",
            ),
        };
    }

    let detail = error.to_string().to_lowercase();
    if detail.contains("certificate") || detail.contains("tls") || detail.contains("ssl") {
        failed(
            ConnectionStatus::TlsError,
            "Connessione non riuscita: verificare le impostazioni TLS.",
        )
    } else if detail.contains("timeout") {
        failed(
            ConnectionStatus::Timeout,
            "Connessione non riuscita: timeout durante il collegamento.",
        )
    } else if detail.contains("connection refused")
        || detail.contains("could not connect")
        || detail.contains("network")
        || detail.contains("dns")
        || detail.contains("no such host")
    {
        failed(
            ConnectionStatus::ServerUnreachable,
            "Connessione non riuscita: server non raggiungibile.",
        )
    } else {
        failed(
            ConnectionStatus::PostgresError,
            "Connessione non riuscita: errore PostgreSQL.",
        )
    }
}

fn failed(status: ConnectionStatus, message: &str) -> ConnectionTestResult {
    ConnectionTestResult {
        success: false,
        status,
        message: message.to_string(),
    }
}

pub fn redact_error_detail(detail: &str) -> String {
    super::models::redact_secret_text(detail)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> DatabaseSettingsInput {
        DatabaseSettingsInput {
            server: "db.local".to_string(),
            port: 5432,
            database: "qextrai".to_string(),
            username: "operator".to_string(),
            ssl_mode: SslMode::Prefer,
            password: "secret;with@chars".to_string(),
        }
    }

    #[test]
    fn maps_ssl_mode() {
        assert_eq!(
            std::mem::discriminant(&map_ssl_mode(SslMode::Prefer)),
            std::mem::discriminant(&PgSslMode::Prefer)
        );
        assert_eq!(
            std::mem::discriminant(&map_ssl_mode(SslMode::Require)),
            std::mem::discriminant(&PgSslMode::Require)
        );
        assert_eq!(
            std::mem::discriminant(&map_ssl_mode(SslMode::VerifyCa)),
            std::mem::discriminant(&PgSslMode::VerifyCa)
        );
        assert_eq!(
            std::mem::discriminant(&map_ssl_mode(SslMode::VerifyFull)),
            std::mem::discriminant(&PgSslMode::VerifyFull)
        );
    }

    #[test]
    fn builds_connect_options_without_manual_url() {
        let settings = settings();
        let _options = build_pg_connect_options(&settings, &settings.password);
    }

    #[test]
    fn redacts_error_details() {
        let detail = redact_error_detail("password=secret; user=operator");
        assert!(!detail.contains("secret"));
        assert!(detail.contains("password=<redacted>;"));
    }

    #[test]
    fn classifies_timeout_text() {
        let result = classify_sqlx_error(&sqlx::Error::Io(std::io::Error::new(
            std::io::ErrorKind::TimedOut,
            "timeout",
        )));
        assert_eq!(result.status, ConnectionStatus::Timeout);
    }
}
