use super::dpapi::{protect_password, unprotect_password};
use super::models::{
    DatabaseSettingsInput, DatabaseSettingsPublic, StoredDatabaseSettings, SETTINGS_VERSION,
};
use base64::prelude::*;
use std::fs::{self, File};
use std::io::{Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};

pub const SETTINGS_FILE_NAME: &str = "database-settings.json";

pub fn settings_file_path(app_local_data_dir: &Path) -> PathBuf {
    app_local_data_dir.join(SETTINGS_FILE_NAME)
}

pub fn load_public_settings(app_local_data_dir: &Path) -> Result<DatabaseSettingsPublic, String> {
    Ok(match load_stored_settings(app_local_data_dir)? {
        Some(stored) => stored.public(),
        None => DatabaseSettingsPublic::default(),
    })
}

pub fn load_stored_settings(
    app_local_data_dir: &Path,
) -> Result<Option<StoredDatabaseSettings>, String> {
    let path = settings_file_path(app_local_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let mut content = String::new();
    File::open(&path)
        .map_err(|error| format!("Impossibile aprire la configurazione: {error}"))?
        .read_to_string(&mut content)
        .map_err(|error| format!("Impossibile leggere la configurazione: {error}"))?;
    let stored: StoredDatabaseSettings = serde_json::from_str(&content)
        .map_err(|error| format!("Configurazione database non valida: {error}"))?;
    if stored.version != SETTINGS_VERSION {
        return Err("Versione configurazione database non supportata.".to_string());
    }
    Ok(Some(stored))
}

pub fn resolve_password(
    app_local_data_dir: &Path,
    new_password: &str,
) -> Result<Option<String>, String> {
    if !new_password.is_empty() {
        return Ok(Some(new_password.to_string()));
    }

    let Some(stored) = load_stored_settings(app_local_data_dir)? else {
        return Ok(None);
    };
    let Some(encrypted) = stored.encrypted_password_base64 else {
        return Ok(None);
    };
    let bytes = BASE64_STANDARD
        .decode(encrypted)
        .map_err(|_| "Password protetta non valida.".to_string())?;
    Ok(Some(unprotect_password(&bytes)?))
}

pub fn save_settings(
    app_local_data_dir: &Path,
    settings: &DatabaseSettingsInput,
) -> Result<DatabaseSettingsPublic, String> {
    fs::create_dir_all(app_local_data_dir)
        .map_err(|error| format!("Impossibile creare la cartella configurazione: {error}"))?;

    let encrypted_password_base64 = if settings.password.is_empty() {
        load_stored_settings(app_local_data_dir)?
            .and_then(|stored| stored.encrypted_password_base64)
    } else {
        Some(BASE64_STANDARD.encode(protect_password(&settings.password)?))
    };

    let stored = StoredDatabaseSettings {
        version: SETTINGS_VERSION,
        server: settings.server.trim().to_string(),
        port: settings.port,
        database: settings.database.trim().to_string(),
        username: settings.username.trim().to_string(),
        ssl_mode: settings.ssl_mode,
        encrypted_password_base64,
    };

    write_atomically(&settings_file_path(app_local_data_dir), &stored)?;
    Ok(stored.public())
}

fn write_atomically(path: &Path, stored: &StoredDatabaseSettings) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Percorso configurazione non valido.".to_string())?;
    let temp_path = directory.join(format!("{SETTINGS_FILE_NAME}.tmp"));
    let serialized = serde_json::to_vec_pretty(stored)
        .map_err(|error| format!("Impossibile serializzare la configurazione: {error}"))?;

    {
        let mut file = File::create(&temp_path)
            .map_err(|error| format!("Impossibile scrivere la configurazione: {error}"))?;
        file.write_all(&serialized)
            .map_err(|error| format!("Impossibile completare la configurazione: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Impossibile sincronizzare la configurazione: {error}"))?;
    }

    replace_file(&temp_path, path)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let from_wide = wide_null(from);
    let to_wide = wide_null(to);
    let ok = unsafe {
        MoveFileExW(
            from_wide.as_ptr(),
            to_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        return Err("Impossibile sostituire la configurazione locale.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn wide_null(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain(Some(0)).collect()
}

#[cfg(not(target_os = "windows"))]
fn replace_file(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        fs::remove_file(to)
            .map_err(|error| format!("Impossibile sostituire la configurazione: {error}"))?;
    }
    fs::rename(from, to)
        .map_err(|error| format!("Impossibile sostituire la configurazione: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::SslMode;

    fn settings(password: &str) -> DatabaseSettingsInput {
        DatabaseSettingsInput {
            server: "db.local".to_string(),
            port: 5432,
            database: "qextrai".to_string(),
            username: "operator".to_string(),
            ssl_mode: SslMode::Prefer,
            password: password.to_string(),
        }
    }

    #[test]
    fn rejects_unsupported_version() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            settings_file_path(directory.path()),
            r#"{"version":99,"server":"","port":5432,"database":"","username":"","sslMode":"prefer","encryptedPasswordBase64":null}"#,
        )
        .unwrap();
        assert!(load_stored_settings(directory.path())
            .unwrap_err()
            .contains("non supportata"));
    }

    #[test]
    fn reads_previous_format_with_legacy_driver_field() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(
            settings_file_path(directory.path()),
            r#"{"version":1,"driver":"legacy","server":"db.local","port":5432,"database":"qextrai","username":"operator","sslMode":"prefer","encryptedPasswordBase64":null}"#,
        )
        .unwrap();
        let public = load_public_settings(directory.path()).unwrap();
        assert_eq!(public.server, "db.local");
        assert!(!public.password_configured);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn writes_and_reads_without_plain_password() {
        let directory = tempfile::tempdir().unwrap();
        save_settings(directory.path(), &settings("secret")).unwrap();
        let content = fs::read_to_string(settings_file_path(directory.path())).unwrap();
        assert!(!content.contains("secret"));
        let public = load_public_settings(directory.path()).unwrap();
        assert!(public.password_configured);
        assert_eq!(public.database, "qextrai");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn preserves_password_when_new_field_is_empty() {
        let directory = tempfile::tempdir().unwrap();
        save_settings(directory.path(), &settings("first")).unwrap();
        save_settings(directory.path(), &settings("")).unwrap();
        assert_eq!(
            resolve_password(directory.path(), "").unwrap().unwrap(),
            "first"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn replaces_password() {
        let directory = tempfile::tempdir().unwrap();
        save_settings(directory.path(), &settings("first")).unwrap();
        save_settings(directory.path(), &settings("second")).unwrap();
        assert_eq!(
            resolve_password(directory.path(), "").unwrap().unwrap(),
            "second"
        );
    }
}
