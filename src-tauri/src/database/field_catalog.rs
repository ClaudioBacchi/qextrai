use super::connection_manager::pool;
use super::models::CommandErrorCode;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgDatabaseError;
use sqlx::{Error, PgPool, Row};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldDefinitionRecord {
    pub id: String,
    pub name: String,
    pub normalized_name: String,
    pub kind: FieldKind,
    pub value_type: Option<ScalarValueType>,
    pub revision: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFieldDefinitionInput {
    pub id: String,
    pub name: String,
    pub kind: FieldKind,
    pub value_type: Option<ScalarValueType>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFieldDefinitionFormatInput {
    pub id: String,
    pub expected_revision: i64,
    pub kind: FieldKind,
    pub value_type: Option<ScalarValueType>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Single,
    List,
    Table,
}

impl FieldKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Single => "single",
            Self::List => "list",
            Self::Table => "table",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScalarValueType {
    Text,
    Number,
    Date,
    Datetime,
    Money,
    Boolean,
}

impl ScalarValueType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Number => "number",
            Self::Date => "date",
            Self::Datetime => "datetime",
            Self::Money => "money",
            Self::Boolean => "boolean",
        }
    }
}

pub async fn list_field_definitions(
    app_local_data_dir: &std::path::Path,
) -> Result<Vec<FieldDefinitionRecord>, CatalogError> {
    let pool = pool(app_local_data_dir).await.map_err(CatalogError::from)?;
    list_with_pool(&pool).await
}

pub async fn create_field_definition(
    app_local_data_dir: &std::path::Path,
    input: CreateFieldDefinitionInput,
) -> Result<FieldDefinitionRecord, CatalogError> {
    validate_field_shape(input.kind, input.value_type)?;
    let cleaned_name = clean_field_name(&input.name);
    validate_field_name(&cleaned_name)?;
    let normalized_name = normalize_field_name(&cleaned_name);
    let pool = pool(app_local_data_dir).await.map_err(CatalogError::from)?;

    let row = sqlx::query(
        "INSERT INTO qextrai.field_definitions (id, name, normalized_name, kind, value_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, normalized_name, kind, value_type, revision",
    )
    .bind(input.id)
    .bind(cleaned_name)
    .bind(normalized_name)
    .bind(input.kind.as_str())
    .bind(input.value_type.map(ScalarValueType::as_str))
    .fetch_one(&pool)
    .await
    .map_err(classify_sqlx_error)?;

    map_row(row)
}

pub async fn update_field_definition_format(
    app_local_data_dir: &std::path::Path,
    input: UpdateFieldDefinitionFormatInput,
) -> Result<FieldDefinitionRecord, CatalogError> {
    validate_field_shape(input.kind, input.value_type)?;
    if input.expected_revision <= 0 {
        return Err(CatalogError::InvalidData(
            "Revisione attesa non valida.".to_string(),
        ));
    }
    let pool = pool(app_local_data_dir).await.map_err(CatalogError::from)?;
    let row = sqlx::query(
        "UPDATE qextrai.field_definitions
         SET kind = $1, value_type = $2, revision = revision + 1, updated_at = NOW()
         WHERE id = $3 AND revision = $4
         RETURNING id, name, normalized_name, kind, value_type, revision",
    )
    .bind(input.kind.as_str())
    .bind(input.value_type.map(ScalarValueType::as_str))
    .bind(input.id)
    .bind(input.expected_revision)
    .fetch_optional(&pool)
    .await
    .map_err(classify_sqlx_error)?;

    match row {
        Some(row) => map_row(row),
        None => Err(CatalogError::RevisionConflict),
    }
}

async fn list_with_pool(pool: &PgPool) -> Result<Vec<FieldDefinitionRecord>, CatalogError> {
    let rows = sqlx::query(
        "SELECT id, name, normalized_name, kind, value_type, revision
         FROM qextrai.field_definitions
         ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(classify_sqlx_error)?;

    rows.into_iter().map(map_row).collect()
}

fn map_row(row: sqlx::postgres::PgRow) -> Result<FieldDefinitionRecord, CatalogError> {
    let kind_text: String = row.get("kind");
    let value_text: Option<String> = row.get("value_type");
    Ok(FieldDefinitionRecord {
        id: row.get("id"),
        name: row.get("name"),
        normalized_name: row.get("normalized_name"),
        kind: parse_kind(&kind_text)?,
        value_type: value_text.as_deref().map(parse_value_type).transpose()?,
        revision: row.get("revision"),
    })
}

pub fn clean_field_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn normalize_field_name(name: &str) -> String {
    clean_field_name(name).to_lowercase()
}

fn validate_field_name(name: &str) -> Result<(), CatalogError> {
    if name.is_empty() {
        return Err(CatalogError::InvalidData(
            "Il nome è obbligatorio.".to_string(),
        ));
    }
    if name.chars().count() < 2 {
        return Err(CatalogError::InvalidData(
            "Inserisci almeno 2 caratteri.".to_string(),
        ));
    }
    if name.chars().count() > 80 {
        return Err(CatalogError::InvalidData(
            "Il nome può contenere al massimo 80 caratteri.".to_string(),
        ));
    }
    Ok(())
}

pub fn validate_field_shape(
    kind: FieldKind,
    value_type: Option<ScalarValueType>,
) -> Result<(), CatalogError> {
    match (kind, value_type) {
        (FieldKind::Table, Some(_)) => Err(CatalogError::InvalidData(
            "Le tabelle non usano un formato scalare.".to_string(),
        )),
        (FieldKind::Single | FieldKind::List, None) => Err(CatalogError::InvalidData(
            "Il formato è obbligatorio per campi singoli ed elenchi.".to_string(),
        )),
        _ => Ok(()),
    }
}

fn parse_kind(value: &str) -> Result<FieldKind, CatalogError> {
    match value {
        "single" => Ok(FieldKind::Single),
        "list" => Ok(FieldKind::List),
        "table" => Ok(FieldKind::Table),
        _ => Err(CatalogError::InvalidData(
            "Struttura campo non valida.".to_string(),
        )),
    }
}

fn parse_value_type(value: &str) -> Result<ScalarValueType, CatalogError> {
    match value {
        "text" => Ok(ScalarValueType::Text),
        "number" => Ok(ScalarValueType::Number),
        "date" => Ok(ScalarValueType::Date),
        "datetime" => Ok(ScalarValueType::Datetime),
        "money" => Ok(ScalarValueType::Money),
        "boolean" => Ok(ScalarValueType::Boolean),
        _ => Err(CatalogError::InvalidData(
            "Formato campo non valido.".to_string(),
        )),
    }
}

fn classify_sqlx_error(error: Error) -> CatalogError {
    if let Error::Database(database_error) = &error {
        if let Some(pg_error) = database_error.try_downcast_ref::<PgDatabaseError>() {
            return match pg_error.code() {
                "23505" => CatalogError::Duplicate,
                "23514" | "23502" | "22P02" => CatalogError::InvalidData(
                    "I dati del campo non rispettano i vincoli del catalogo.".to_string(),
                ),
                "42501" => CatalogError::PermissionDenied,
                _ => CatalogError::Postgres(redact_error_detail(&error.to_string())),
            };
        }
    }
    CatalogError::Postgres(redact_error_detail(&error.to_string()))
}

pub fn redact_error_detail(detail: &str) -> String {
    super::models::redact_secret_text(detail)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CatalogError {
    DatabaseUnavailable(String),
    MigrationFailed(String),
    PermissionDenied,
    Duplicate,
    RevisionConflict,
    InvalidData(String),
    Postgres(String),
}

impl From<super::connection_manager::ConnectionManagerError> for CatalogError {
    fn from(error: super::connection_manager::ConnectionManagerError) -> Self {
        match error {
            super::connection_manager::ConnectionManagerError::NotConfigured => {
                Self::DatabaseUnavailable("Database PostgreSQL non configurato.".to_string())
            }
            super::connection_manager::ConnectionManagerError::MigrationFailed(detail) => {
                Self::MigrationFailed(detail)
            }
            super::connection_manager::ConnectionManagerError::Postgres(detail) => {
                Self::Postgres(detail)
            }
        }
    }
}

impl CatalogError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::DatabaseUnavailable(_) => "Catalogo non disponibile.",
            Self::MigrationFailed(_) => "Migrazione catalogo non riuscita.",
            Self::PermissionDenied => "Permessi insufficienti sul database qExtrai.",
            Self::Duplicate => {
                "Questo campo è stato appena creato da un altro operatore. Selezionalo dal catalogo."
            }
            Self::RevisionConflict => {
                "Il campo è stato modificato da un altro operatore. Il catalogo è stato aggiornato."
            }
            Self::InvalidData(_) => "I dati del campo non sono validi.",
            Self::Postgres(_) => "Errore PostgreSQL durante l'accesso al catalogo.",
        }
    }

    pub fn code(&self) -> CommandErrorCode {
        match self {
            Self::DatabaseUnavailable(_) => CommandErrorCode::DatabaseUnavailable,
            Self::MigrationFailed(_) => CommandErrorCode::MigrationFailed,
            Self::PermissionDenied => CommandErrorCode::PermissionDenied,
            Self::Duplicate => CommandErrorCode::Duplicate,
            Self::RevisionConflict => CommandErrorCode::RevisionConflict,
            Self::InvalidData(_) => CommandErrorCode::InvalidData,
            Self::Postgres(_) => CommandErrorCode::PostgresError,
        }
    }

    pub fn detail(&self) -> String {
        match self {
            Self::DatabaseUnavailable(detail)
            | Self::MigrationFailed(detail)
            | Self::InvalidData(detail)
            | Self::Postgres(detail) => detail.clone(),
            Self::PermissionDenied => "permission denied".to_string(),
            Self::Duplicate => "unique violation".to_string(),
            Self::RevisionConflict => "revision conflict".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_names_like_typescript() {
        assert_eq!(
            normalize_field_name("  Numero   Preventivo "),
            "numero preventivo"
        );
        assert_eq!(normalize_field_name("MANSIONI"), "mansioni");
        assert_eq!(normalize_field_name("Città   Cliente"), "città cliente");
        assert_eq!(normalize_field_name(""), "");
        assert_eq!(
            normalize_field_name("  Numero preventivo"),
            normalize_field_name("numero   PREVENTIVO ")
        );
    }

    #[test]
    fn validates_kind_and_value_type() {
        assert!(validate_field_shape(FieldKind::Single, Some(ScalarValueType::Text)).is_ok());
        assert!(validate_field_shape(FieldKind::List, Some(ScalarValueType::Date)).is_ok());
        assert!(validate_field_shape(FieldKind::Table, None).is_ok());
        assert!(validate_field_shape(FieldKind::Table, Some(ScalarValueType::Text)).is_err());
        assert!(validate_field_shape(FieldKind::Single, None).is_err());
    }

    #[test]
    fn classifies_conflict_and_redacts_errors() {
        assert_eq!(
            CatalogError::RevisionConflict.code(),
            CommandErrorCode::RevisionConflict
        );
        let detail = redact_error_detail("password=secret; statement failed");
        assert!(!detail.contains("secret"));
    }

    #[test]
    fn migration_sql_has_required_structure() {
        let sql = include_str!("../../migrations/202607200001_create_field_definitions.sql");
        assert!(sql.contains("CREATE SCHEMA IF NOT EXISTS qextrai"));
        assert!(sql.contains("CREATE TABLE qextrai.field_definitions"));
        assert!(sql.contains("UNIQUE (normalized_name)"));
        assert!(sql.contains("revision BIGINT NOT NULL DEFAULT 1"));
    }
}
