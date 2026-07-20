use super::models::DatabaseSettingsInput;

pub fn validate_settings(settings: &DatabaseSettingsInput) -> Result<(), String> {
    validate_required("Server", &settings.server)?;
    validate_required("Database", &settings.database)?;
    validate_required("Utente", &settings.username)?;
    validate_port(settings.port)?;
    validate_no_control_chars("Server", &settings.server)?;
    validate_no_control_chars("Database", &settings.database)?;
    validate_no_control_chars("Utente", &settings.username)?;
    Ok(())
}

pub fn validate_port(port: u16) -> Result<(), String> {
    if port == 0 {
        Err("La porta PostgreSQL non è valida.".to_string())
    } else {
        Ok(())
    }
}

fn validate_required(label: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{label} è obbligatorio."))
    } else {
        Ok(())
    }
}

fn validate_no_control_chars(label: &str, value: &str) -> Result<(), String> {
    if value.chars().any(|character| character.is_control()) {
        Err(format!("{label} contiene caratteri non validi."))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::models::{DatabaseSettingsInput, SslMode};

    fn valid() -> DatabaseSettingsInput {
        DatabaseSettingsInput {
            server: "db.example.local".to_string(),
            port: 5432,
            database: "qextrai".to_string(),
            username: "operator".to_string(),
            ssl_mode: SslMode::Prefer,
            password: String::new(),
        }
    }

    #[test]
    fn validates_server_database_and_user() {
        let mut settings = valid();
        settings.server = " ".to_string();
        assert!(validate_settings(&settings).unwrap_err().contains("Server"));

        settings = valid();
        settings.database.clear();
        assert!(validate_settings(&settings)
            .unwrap_err()
            .contains("Database"));

        settings = valid();
        settings.username.clear();
        assert!(validate_settings(&settings).unwrap_err().contains("Utente"));
    }

    #[test]
    fn rejects_invalid_port() {
        assert!(validate_port(0).is_err());
    }
}
