use super::models::{
    CommandError, ConnectionStatus, ConnectionTestResult, DatabaseSettingsInput,
    DatabaseSettingsPublic,
};
use super::postgres_service;
use super::storage::{load_public_settings, resolve_password, save_settings};
use super::validation::validate_settings;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub async fn get_database_settings(app: AppHandle) -> Result<DatabaseSettingsPublic, CommandError> {
    let directory = app_local_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || load_public_settings(&directory))
        .await
        .map_err(|error| {
            CommandError::new(
                "Impossibile leggere le impostazioni database.",
                error.to_string(),
            )
        })?
        .map_err(|error| CommandError::new("Impossibile leggere le impostazioni database.", error))
}

#[tauri::command]
pub async fn save_database_settings(
    app: AppHandle,
    settings: DatabaseSettingsInput,
) -> Result<DatabaseSettingsPublic, CommandError> {
    validate_settings(&settings)
        .map_err(|error| CommandError::new("Controllare i dati inseriti.", error))?;
    let directory = app_local_data_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || save_settings(&directory, &settings))
        .await
        .map_err(|error| {
            CommandError::new(
                "Impossibile salvare le impostazioni database.",
                error.to_string(),
            )
        })?
        .map_err(|error| CommandError::new("Impossibile salvare le impostazioni database.", error))
}

#[tauri::command]
pub async fn test_database_connection(
    app: AppHandle,
    settings: DatabaseSettingsInput,
) -> Result<ConnectionTestResult, CommandError> {
    validate_settings(&settings)
        .map_err(|error| CommandError::new("Controllare i dati inseriti.", error))?;
    let directory = app_local_data_dir(&app)?;
    let resolved = tauri::async_runtime::spawn_blocking(move || {
        let Some(password) = resolve_password(&directory, &settings.password)? else {
            return Ok(ConnectionInput::MissingPassword(ConnectionTestResult {
                success: false,
                status: ConnectionStatus::ConfigurationIncomplete,
                message: "Password PostgreSQL non configurata.".to_string(),
            }));
        };
        Ok::<ConnectionInput, String>(ConnectionInput::Ready(settings, password))
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "Impossibile verificare la connessione database.",
            error.to_string(),
        )
    })?
    .map_err(|error| CommandError::new("Impossibile verificare la connessione database.", error))?;

    match resolved {
        ConnectionInput::Ready(settings, password) => {
            postgres_service::test_connection(settings, password)
                .await
                .map_err(|error| {
                    CommandError::new("Impossibile verificare la connessione database.", error)
                })
        }
        ConnectionInput::MissingPassword(result) => Ok(result),
    }
}

enum ConnectionInput {
    Ready(DatabaseSettingsInput, String),
    MissingPassword(ConnectionTestResult),
}

fn app_local_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, CommandError> {
    app.path().app_local_data_dir().map_err(|error| {
        CommandError::new(
            "Cartella configurazione locale non disponibile.",
            error.to_string(),
        )
    })
}
