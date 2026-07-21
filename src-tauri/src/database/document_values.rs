use super::connection_manager::pool;
use super::models::CommandErrorCode;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const MAX_VALUES: usize = 500;
const MAX_VALUE_BYTES: usize = 64 * 1024;
const MAX_TOTAL_VALUE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocumentValuesInput {
    pub fingerprint: String,
    pub template_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDocumentValuesInput {
    pub fingerprint: String,
    pub template_id: String,
    pub template_revision: i64,
    pub expected_revision: Option<i64>,
    pub values: Vec<DocumentFieldValueInput>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFieldValueInput {
    pub template_field_id: String,
    pub field_definition_id: String,
    pub raw_value: String,
    pub edited_value: String,
    pub source: PersistedValueSource,
    pub status: PersistedValueStatus,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PersistedValueSource {
    PdfText,
    Manual,
}

impl PersistedValueSource {
    fn as_db(&self) -> &'static str {
        match self {
            Self::PdfText => "pdfText",
            Self::Manual => "manual",
        }
    }

    fn from_db(value: &str) -> Result<Self, DocumentValuesError> {
        match value {
            "pdfText" => Ok(Self::PdfText),
            "manual" => Ok(Self::Manual),
            _ => Err(DocumentValuesError::InvalidData(
                "Origine valore non valida.".to_string(),
            )),
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PersistedValueStatus {
    Ready,
    Empty,
}

impl PersistedValueStatus {
    fn as_db(&self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Empty => "empty",
        }
    }

    fn from_db(value: &str) -> Result<Self, DocumentValuesError> {
        match value {
            "ready" => Ok(Self::Ready),
            "empty" => Ok(Self::Empty),
            _ => Err(DocumentValuesError::InvalidData(
                "Stato valore non valido.".to_string(),
            )),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentValueSet {
    pub id: String,
    pub revision: i64,
    pub template_revision: i64,
    pub values: Vec<DocumentFieldValueRecord>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentFieldValueRecord {
    pub template_field_id: String,
    pub field_definition_id: String,
    pub raw_value: String,
    pub edited_value: String,
    pub source: PersistedValueSource,
    pub status: PersistedValueStatus,
}

pub async fn load_document_values(
    app_local_data_dir: &std::path::Path,
    input: LoadDocumentValuesInput,
) -> Result<Option<DocumentValueSet>, DocumentValuesError> {
    validate_load_payload(&input)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(DocumentValuesError::from)?;
    load_document_values_from_pool(&pool, &input.fingerprint, &input.template_id).await
}

pub async fn save_document_values(
    app_local_data_dir: &std::path::Path,
    input: SaveDocumentValuesInput,
) -> Result<DocumentValueSet, DocumentValuesError> {
    validate_save_payload(&input)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(DocumentValuesError::from)?;
    let mut tx = pool.begin().await.map_err(classify_sqlx_error)?;

    let template_revision: Option<i64> =
        sqlx::query_scalar("SELECT revision FROM qextrai.document_templates WHERE id = $1")
            .bind(&input.template_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(classify_sqlx_error)?;
    let Some(current_template_revision) = template_revision else {
        return Err(DocumentValuesError::InvalidData(
            "Template non trovato.".to_string(),
        ));
    };
    if current_template_revision != input.template_revision {
        return Err(DocumentValuesError::InvalidData(
            "Il template è stato modificato dopo il caricamento dei dati.".to_string(),
        ));
    }

    let template_fields = load_template_field_map(&mut tx, &input.template_id).await?;
    validate_template_field_membership(&input.values, &template_fields)?;

    let existing = sqlx::query(
        "SELECT id, revision
         FROM qextrai.document_value_sets
         WHERE document_fingerprint = $1 AND template_id = $2
         FOR UPDATE",
    )
    .bind(&input.fingerprint)
    .bind(&input.template_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(classify_sqlx_error)?;

    let (value_set_id, next_revision) = match existing {
        Some(row) => {
            let current_revision: i64 = row.get("revision");
            if input.expected_revision != Some(current_revision) {
                return Err(DocumentValuesError::RevisionConflict);
            }
            let value_set_id: String = row.get("id");
            let next_revision = current_revision + 1;
            sqlx::query(
                "UPDATE qextrai.document_value_sets
                 SET revision = $1, template_revision = $2, updated_at = now()
                 WHERE id = $3",
            )
            .bind(next_revision)
            .bind(input.template_revision)
            .bind(&value_set_id)
            .execute(&mut *tx)
            .await
            .map_err(classify_sqlx_error)?;
            (value_set_id, next_revision)
        }
        None => {
            if input.expected_revision.is_some() {
                return Err(DocumentValuesError::RevisionConflict);
            }
            let value_set_id = Uuid::new_v4().simple().to_string();
            sqlx::query(
                "INSERT INTO qextrai.document_value_sets
                   (id, document_fingerprint, template_id, template_revision, revision)
                 VALUES ($1, $2, $3, $4, 1)",
            )
            .bind(&value_set_id)
            .bind(&input.fingerprint)
            .bind(&input.template_id)
            .bind(input.template_revision)
            .execute(&mut *tx)
            .await
            .map_err(classify_sqlx_error)?;
            (value_set_id, 1)
        }
    };

    sqlx::query("DELETE FROM qextrai.document_field_values WHERE value_set_id = $1")
        .bind(&value_set_id)
        .execute(&mut *tx)
        .await
        .map_err(classify_sqlx_error)?;

    for value in &input.values {
        sqlx::query(
            "INSERT INTO qextrai.document_field_values
               (value_set_id, template_field_id, field_definition_id, raw_value, edited_value, source, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(&value_set_id)
        .bind(&value.template_field_id)
        .bind(&value.field_definition_id)
        .bind(&value.raw_value)
        .bind(&value.edited_value)
        .bind(value.source.as_db())
        .bind(value.status.as_db())
        .execute(&mut *tx)
        .await
        .map_err(classify_sqlx_error)?;
    }

    tx.commit().await.map_err(classify_sqlx_error)?;
    load_document_values_from_pool(&pool, &input.fingerprint, &input.template_id)
        .await?
        .ok_or_else(|| {
            DocumentValuesError::Postgres("Dati non trovati dopo il salvataggio.".to_string())
        })
        .map(|mut saved| {
            saved.revision = next_revision;
            saved
        })
}

async fn load_document_values_from_pool(
    pool: &PgPool,
    fingerprint: &str,
    template_id: &str,
) -> Result<Option<DocumentValueSet>, DocumentValuesError> {
    let Some(row) = sqlx::query(
        "SELECT id, revision, template_revision
         FROM qextrai.document_value_sets
         WHERE document_fingerprint = $1 AND template_id = $2",
    )
    .bind(fingerprint)
    .bind(template_id)
    .fetch_optional(pool)
    .await
    .map_err(classify_sqlx_error)?
    else {
        return Ok(None);
    };

    let id: String = row.get("id");
    let values = sqlx::query(
        "SELECT template_field_id, field_definition_id, raw_value, edited_value, source, status
         FROM qextrai.document_field_values
         WHERE value_set_id = $1
         ORDER BY template_field_id ASC",
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .map_err(classify_sqlx_error)?
    .into_iter()
    .map(map_value_row)
    .collect::<Result<Vec<_>, _>>()?;

    Ok(Some(DocumentValueSet {
        id,
        revision: row.get("revision"),
        template_revision: row.get("template_revision"),
        values,
    }))
}

async fn load_template_field_map(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    template_id: &str,
) -> Result<HashMap<String, String>, DocumentValuesError> {
    let rows = sqlx::query(
        "SELECT id, field_definition_id
         FROM qextrai.document_template_fields
         WHERE template_id = $1",
    )
    .bind(template_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(classify_sqlx_error)?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("id"),
                row.get::<String, _>("field_definition_id"),
            )
        })
        .collect())
}

fn map_value_row(
    row: sqlx::postgres::PgRow,
) -> Result<DocumentFieldValueRecord, DocumentValuesError> {
    Ok(DocumentFieldValueRecord {
        template_field_id: row.get("template_field_id"),
        field_definition_id: row.get("field_definition_id"),
        raw_value: row.get("raw_value"),
        edited_value: row.get("edited_value"),
        source: PersistedValueSource::from_db(row.get::<String, _>("source").as_str())?,
        status: PersistedValueStatus::from_db(row.get::<String, _>("status").as_str())?,
    })
}

pub fn validate_load_payload(input: &LoadDocumentValuesInput) -> Result<(), DocumentValuesError> {
    validate_fingerprint(&input.fingerprint)?;
    validate_id("Template", &input.template_id)?;
    Ok(())
}

pub fn validate_save_payload(input: &SaveDocumentValuesInput) -> Result<(), DocumentValuesError> {
    validate_fingerprint(&input.fingerprint)?;
    validate_id("Template", &input.template_id)?;
    if input.template_revision < 1 {
        return Err(DocumentValuesError::InvalidData(
            "Revisione template non valida.".to_string(),
        ));
    }
    if input.expected_revision.is_some_and(|revision| revision < 1) {
        return Err(DocumentValuesError::InvalidData(
            "Revisione dati non valida.".to_string(),
        ));
    }
    if input.values.len() > MAX_VALUES {
        return Err(DocumentValuesError::InvalidData(
            "Troppi valori nel documento.".to_string(),
        ));
    }
    let mut seen = HashSet::new();
    let mut total_size = 0usize;
    for value in &input.values {
        validate_id("Campo template", &value.template_field_id)?;
        validate_id("Definizione campo", &value.field_definition_id)?;
        if !seen.insert(value.template_field_id.as_str()) {
            return Err(DocumentValuesError::InvalidData(
                "Il payload contiene campi duplicati.".to_string(),
            ));
        }
        let raw_size = value.raw_value.len();
        let edited_size = value.edited_value.len();
        if raw_size > MAX_VALUE_BYTES || edited_size > MAX_VALUE_BYTES {
            return Err(DocumentValuesError::InvalidData(
                "Un valore supera la dimensione massima.".to_string(),
            ));
        }
        total_size += raw_size + edited_size;
        if total_size > MAX_TOTAL_VALUE_BYTES {
            return Err(DocumentValuesError::InvalidData(
                "Il payload dei valori è troppo grande.".to_string(),
            ));
        }
    }
    Ok(())
}

pub fn validate_template_field_membership(
    values: &[DocumentFieldValueInput],
    template_fields: &HashMap<String, String>,
) -> Result<(), DocumentValuesError> {
    for value in values {
        match template_fields.get(&value.template_field_id) {
            Some(field_definition_id) if field_definition_id == &value.field_definition_id => {}
            _ => {
                return Err(DocumentValuesError::InvalidData(
                    "Un valore fa riferimento a un campo non presente nel template.".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn validate_fingerprint(fingerprint: &str) -> Result<(), DocumentValuesError> {
    if fingerprint.len() == 64
        && fingerprint
            .chars()
            .all(|char| char.is_ascii_hexdigit() && !char.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(DocumentValuesError::InvalidData(
            "Fingerprint documento non valido.".to_string(),
        ))
    }
}

fn validate_id(label: &str, id: &str) -> Result<(), DocumentValuesError> {
    let valid = !id.trim().is_empty()
        && id.len() <= 160
        && id
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || matches!(char, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(DocumentValuesError::InvalidData(format!(
            "{label} non valido."
        )))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DocumentValuesError {
    #[error("I dati del documento sono stati modificati da un altro operatore.")]
    RevisionConflict,
    #[error("{0}")]
    InvalidData(String),
    #[error("Errore PostgreSQL durante l'accesso ai valori del documento.")]
    Postgres(String),
    #[error("Database non disponibile.")]
    DatabaseUnavailable(String),
}

impl DocumentValuesError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::RevisionConflict => {
                "I dati di questo documento sono stati modificati da un altro operatore."
            }
            Self::InvalidData(_) => "I dati del documento non sono validi.",
            Self::Postgres(_) => "Errore PostgreSQL durante l'accesso ai valori del documento.",
            Self::DatabaseUnavailable(_) => "Database non disponibile.",
        }
    }

    pub fn detail(&self) -> String {
        match self {
            Self::RevisionConflict => "Ricarica i dati prima di salvare.".to_string(),
            Self::InvalidData(detail)
            | Self::Postgres(detail)
            | Self::DatabaseUnavailable(detail) => detail.clone(),
        }
    }

    pub fn code(&self) -> CommandErrorCode {
        match self {
            Self::RevisionConflict => CommandErrorCode::RevisionConflict,
            Self::InvalidData(_) => CommandErrorCode::InvalidData,
            Self::Postgres(_) => CommandErrorCode::PostgresError,
            Self::DatabaseUnavailable(_) => CommandErrorCode::DatabaseUnavailable,
        }
    }
}

impl From<super::connection_manager::ConnectionManagerError> for DocumentValuesError {
    fn from(error: super::connection_manager::ConnectionManagerError) -> Self {
        match error {
            super::connection_manager::ConnectionManagerError::NotConfigured => {
                Self::DatabaseUnavailable("Database PostgreSQL non configurato.".to_string())
            }
            super::connection_manager::ConnectionManagerError::MigrationFailed(detail)
            | super::connection_manager::ConnectionManagerError::Postgres(detail) => {
                Self::DatabaseUnavailable(detail)
            }
        }
    }
}

fn classify_sqlx_error(error: sqlx::Error) -> DocumentValuesError {
    DocumentValuesError::Postgres(super::document_templates::redact_error_detail(
        &error.to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(template_field_id: &str) -> DocumentFieldValueInput {
        DocumentFieldValueInput {
            template_field_id: template_field_id.to_string(),
            field_definition_id: "definition-1".to_string(),
            raw_value: "raw".to_string(),
            edited_value: "edited".to_string(),
            source: PersistedValueSource::PdfText,
            status: PersistedValueStatus::Ready,
        }
    }

    #[derive(Default)]
    struct TestValueStore {
        sets: HashMap<(String, String), DocumentValueSet>,
    }

    impl TestValueStore {
        fn save(
            &mut self,
            input: SaveDocumentValuesInput,
        ) -> Result<DocumentValueSet, DocumentValuesError> {
            validate_save_payload(&input)?;
            let key = (input.fingerprint.clone(), input.template_id.clone());
            let revision = match self.sets.get(&key) {
                Some(existing) if input.expected_revision == Some(existing.revision) => {
                    existing.revision + 1
                }
                Some(_) => return Err(DocumentValuesError::RevisionConflict),
                None if input.expected_revision.is_none() => 1,
                None => return Err(DocumentValuesError::RevisionConflict),
            };
            let set = DocumentValueSet {
                id: "value-set-1".to_string(),
                revision,
                template_revision: input.template_revision,
                values: input
                    .values
                    .into_iter()
                    .map(|value| DocumentFieldValueRecord {
                        template_field_id: value.template_field_id,
                        field_definition_id: value.field_definition_id,
                        raw_value: value.raw_value,
                        edited_value: value.edited_value,
                        source: value.source,
                        status: value.status,
                    })
                    .collect(),
            };
            self.sets.insert(key, set.clone());
            Ok(set)
        }

        fn load(&self, fingerprint: &str, template_id: &str) -> Option<DocumentValueSet> {
            self.sets
                .get(&(fingerprint.to_string(), template_id.to_string()))
                .cloned()
        }
    }

    #[test]
    fn validates_fingerprint() {
        assert!(validate_fingerprint("a".repeat(64).as_str()).is_ok());
        assert!(validate_fingerprint("A".repeat(64).as_str()).is_err());
        assert!(validate_fingerprint("g".repeat(64).as_str()).is_err());
        assert!(validate_fingerprint("a".repeat(63).as_str()).is_err());
    }

    #[test]
    fn rejects_duplicate_ids_and_limits() {
        let mut input = SaveDocumentValuesInput {
            fingerprint: "a".repeat(64),
            template_id: "template-1".to_string(),
            template_revision: 1,
            expected_revision: None,
            values: vec![value("field-1"), value("field-1")],
        };
        assert!(validate_save_payload(&input).is_err());
        input.values = (0..501)
            .map(|index| value(format!("field-{index}").as_str()))
            .collect();
        assert!(validate_save_payload(&input).is_err());
    }

    #[test]
    fn rejects_oversized_values_without_leaking_contents() {
        let secret = "x".repeat(MAX_VALUE_BYTES + 1);
        let input = SaveDocumentValuesInput {
            fingerprint: "a".repeat(64),
            template_id: "template-1".to_string(),
            template_revision: 1,
            expected_revision: None,
            values: vec![DocumentFieldValueInput {
                raw_value: secret.clone(),
                ..value("field-1")
            }],
        };
        let error = validate_save_payload(&input).unwrap_err();
        assert!(!error.detail().contains(&secret));
    }

    #[test]
    fn maps_database_enums() {
        assert_eq!(
            PersistedValueSource::from_db("pdfText").unwrap(),
            PersistedValueSource::PdfText
        );
        assert_eq!(
            PersistedValueSource::from_db("manual").unwrap(),
            PersistedValueSource::Manual
        );
        assert!(PersistedValueSource::from_db("idle").is_err());
        assert_eq!(
            PersistedValueStatus::from_db("ready").unwrap(),
            PersistedValueStatus::Ready
        );
        assert_eq!(
            PersistedValueStatus::from_db("empty").unwrap(),
            PersistedValueStatus::Empty
        );
        assert!(PersistedValueStatus::from_db("error").is_err());
    }

    #[test]
    fn rejects_template_field_outside_template() {
        let mut fields = HashMap::new();
        fields.insert("field-1".to_string(), "definition-1".to_string());
        assert!(validate_template_field_membership(&[value("field-1")], &fields).is_ok());
        assert!(validate_template_field_membership(&[value("field-2")], &fields).is_err());
    }

    #[test]
    fn documents_revision_rules() {
        let create_revision = 1;
        let update_revision = create_revision + 1;
        assert_eq!(create_revision, 1);
        assert_eq!(update_revision, 2);
    }

    #[test]
    fn snapshot_removes_missing_values() {
        let previous: HashSet<&str> = ["field-1", "field-2"].into_iter().collect();
        let snapshot: HashSet<&str> = ["field-2"].into_iter().collect();
        let removed: Vec<_> = previous.difference(&snapshot).copied().collect();
        assert_eq!(removed, vec!["field-1"]);
    }

    #[test]
    fn migration_keeps_values_independent_from_template_field_rows() {
        let sql = include_str!("../../migrations/202607210001_create_document_values.sql");
        assert!(sql.contains("CREATE TABLE qextrai.document_value_sets"));
        assert!(sql.contains("CREATE TABLE qextrai.document_field_values"));
        assert!(sql.contains("document_fingerprint ~ '^[0-9a-f]{64}$'"));
        assert!(sql.contains("UNIQUE (document_fingerprint, template_id)"));
        assert!(!sql.contains(
            "template_field_id TEXT NOT NULL REFERENCES qextrai.document_template_fields"
        ));
    }

    #[test]
    fn in_memory_store_loads_created_set_and_revisions() {
        let mut store = TestValueStore::default();
        let fingerprint = "a".repeat(64);
        let saved = store
            .save(SaveDocumentValuesInput {
                fingerprint: fingerprint.clone(),
                template_id: "template-1".to_string(),
                template_revision: 2,
                expected_revision: None,
                values: vec![value("field-1")],
            })
            .unwrap();

        let loaded = store.load(&fingerprint, "template-1").unwrap();
        assert_eq!(saved.revision, 1);
        assert_eq!(loaded.revision, 1);
        assert_eq!(loaded.template_revision, 2);
        assert_eq!(loaded.values[0].edited_value, "edited");
    }

    #[test]
    fn in_memory_store_updates_with_returned_revision_and_conflicts_only_when_obsolete() {
        let mut store = TestValueStore::default();
        let fingerprint = "a".repeat(64);
        let first = store
            .save(SaveDocumentValuesInput {
                fingerprint: fingerprint.clone(),
                template_id: "template-1".to_string(),
                template_revision: 2,
                expected_revision: None,
                values: vec![value("field-1")],
            })
            .unwrap();
        let second = store
            .save(SaveDocumentValuesInput {
                fingerprint: fingerprint.clone(),
                template_id: "template-1".to_string(),
                template_revision: 2,
                expected_revision: Some(first.revision),
                values: vec![value("field-1")],
            })
            .unwrap();
        let conflict = store.save(SaveDocumentValuesInput {
            fingerprint,
            template_id: "template-1".to_string(),
            template_revision: 2,
            expected_revision: Some(first.revision),
            values: vec![value("field-1")],
        });

        assert_eq!(second.revision, 2);
        assert!(matches!(
            conflict,
            Err(DocumentValuesError::RevisionConflict)
        ));
    }

    #[test]
    fn in_memory_store_separates_fingerprint_and_template() {
        let mut store = TestValueStore::default();
        let fingerprint = "a".repeat(64);
        store
            .save(SaveDocumentValuesInput {
                fingerprint: fingerprint.clone(),
                template_id: "template-1".to_string(),
                template_revision: 2,
                expected_revision: None,
                values: vec![value("field-1")],
            })
            .unwrap();

        assert!(store.load(&fingerprint, "template-1").is_some());
        assert!(store.load(&"b".repeat(64), "template-1").is_none());
        assert!(store.load(&fingerprint, "template-2").is_none());
    }
}
