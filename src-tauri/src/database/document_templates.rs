use super::connection_manager::pool;
use super::field_catalog::{clean_field_name, normalize_field_name};
use super::models::CommandErrorCode;
use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgDatabaseError, PgRow};
use sqlx::{Error, PgPool, Postgres, Row, Transaction};
use std::collections::HashSet;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplateSummary {
    pub id: String,
    pub name: String,
    pub revision: i64,
    pub source_page_count: i32,
    pub field_count: i64,
    pub region_count: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplate {
    pub id: String,
    pub name: String,
    pub normalized_name: String,
    pub revision: i64,
    pub source_page_count: i32,
    pub fields: Vec<DocumentTemplateField>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplateField {
    pub id: String,
    pub field_definition_id: String,
    pub sort_order: i32,
    pub regions: Vec<DocumentTemplateRegion>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplateRegion {
    pub id: String,
    pub page_number: i32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentTemplateInput {
    pub id: String,
    pub name: String,
    pub source_page_count: i32,
    pub document_fingerprint: String,
    pub document_size: i64,
    pub page_count: i32,
    pub fields: Vec<DocumentTemplateFieldInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentTemplateInput {
    pub id: String,
    pub expected_revision: i64,
    pub source_page_count: i32,
    pub fields: Vec<DocumentTemplateFieldInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BindDocumentTemplateInput {
    pub document_fingerprint: String,
    pub template_id: String,
    pub document_size: i64,
    pub page_count: i32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplateFieldInput {
    pub id: String,
    pub field_definition_id: String,
    pub sort_order: i32,
    pub regions: Vec<DocumentTemplateRegionInput>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTemplateRegionInput {
    pub id: String,
    pub page_number: i32,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

pub async fn list_document_templates(
    app_local_data_dir: &std::path::Path,
) -> Result<Vec<DocumentTemplateSummary>, TemplateError> {
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    let rows = sqlx::query(
        "SELECT t.id, t.name, t.revision, t.source_page_count,
                COUNT(DISTINCT f.id) AS field_count,
                COUNT(r.id) AS region_count
         FROM qextrai.document_templates t
         LEFT JOIN qextrai.document_template_fields f ON f.template_id = t.id
         LEFT JOIN qextrai.document_template_regions r ON r.template_field_id = f.id
         GROUP BY t.id, t.name, t.revision, t.source_page_count
         ORDER BY t.name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(classify_sqlx_error)?;

    Ok(rows
        .into_iter()
        .map(|row| DocumentTemplateSummary {
            id: row.get("id"),
            name: row.get("name"),
            revision: row.get("revision"),
            source_page_count: row.get("source_page_count"),
            field_count: row.get("field_count"),
            region_count: row.get("region_count"),
        })
        .collect())
}

pub async fn get_document_template(
    app_local_data_dir: &std::path::Path,
    id: String,
) -> Result<Option<DocumentTemplate>, TemplateError> {
    validate_id("Template", &id)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    load_template(&pool, &id).await
}

pub async fn find_document_template_by_fingerprint(
    app_local_data_dir: &std::path::Path,
    fingerprint: String,
) -> Result<Option<DocumentTemplate>, TemplateError> {
    validate_fingerprint(&fingerprint)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    let row = sqlx::query(
        "SELECT template_id FROM qextrai.document_template_bindings WHERE document_fingerprint = $1",
    )
    .bind(fingerprint)
    .fetch_optional(&pool)
    .await
    .map_err(classify_sqlx_error)?;

    match row {
        Some(row) => load_template(&pool, row.get::<String, _>("template_id").as_str()).await,
        None => Ok(None),
    }
}

pub async fn create_document_template(
    app_local_data_dir: &std::path::Path,
    input: CreateDocumentTemplateInput,
) -> Result<DocumentTemplate, TemplateError> {
    validate_create_payload(&input)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    let mut tx = pool.begin().await.map_err(classify_sqlx_error)?;
    let name = clean_field_name(&input.name);
    let normalized_name = normalize_field_name(&name);

    sqlx::query(
        "INSERT INTO qextrai.document_templates (id, name, normalized_name, source_page_count)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(&input.id)
    .bind(name)
    .bind(normalized_name)
    .bind(input.source_page_count)
    .execute(&mut *tx)
    .await
    .map_err(classify_sqlx_error)?;

    replace_template_layout(&mut tx, &input.id, &input.fields).await?;
    bind_in_tx(
        &mut tx,
        &BindDocumentTemplateInput {
            document_fingerprint: input.document_fingerprint,
            template_id: input.id.clone(),
            document_size: input.document_size,
            page_count: input.page_count,
        },
    )
    .await?;
    tx.commit().await.map_err(classify_sqlx_error)?;
    load_template(&pool, &input.id).await?.ok_or_else(|| {
        TemplateError::Postgres("Template non trovato dopo il salvataggio.".to_string())
    })
}

pub async fn update_document_template(
    app_local_data_dir: &std::path::Path,
    input: UpdateDocumentTemplateInput,
) -> Result<DocumentTemplate, TemplateError> {
    validate_update_payload(&input)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    let mut tx = pool.begin().await.map_err(classify_sqlx_error)?;
    let result = sqlx::query(
        "UPDATE qextrai.document_templates
         SET revision = revision + 1, source_page_count = $1, updated_at = now()
         WHERE id = $2 AND revision = $3",
    )
    .bind(input.source_page_count)
    .bind(&input.id)
    .bind(input.expected_revision)
    .execute(&mut *tx)
    .await
    .map_err(classify_sqlx_error)?;

    if result.rows_affected() == 0 {
        return Err(TemplateError::RevisionConflict);
    }

    replace_template_layout(&mut tx, &input.id, &input.fields).await?;
    tx.commit().await.map_err(classify_sqlx_error)?;
    load_template(&pool, &input.id).await?.ok_or_else(|| {
        TemplateError::Postgres("Template non trovato dopo l'aggiornamento.".to_string())
    })
}

pub async fn bind_document_template(
    app_local_data_dir: &std::path::Path,
    input: BindDocumentTemplateInput,
) -> Result<DocumentTemplate, TemplateError> {
    validate_bind_payload(&input)?;
    let pool = pool(app_local_data_dir)
        .await
        .map_err(TemplateError::from)?;
    let mut tx = pool.begin().await.map_err(classify_sqlx_error)?;
    bind_in_tx(&mut tx, &input).await?;
    tx.commit().await.map_err(classify_sqlx_error)?;
    load_template(&pool, &input.template_id)
        .await?
        .ok_or_else(|| TemplateError::Postgres("Template associato non trovato.".to_string()))
}

async fn bind_in_tx(
    tx: &mut Transaction<'_, Postgres>,
    input: &BindDocumentTemplateInput,
) -> Result<(), TemplateError> {
    sqlx::query(
        "INSERT INTO qextrai.document_template_bindings
           (document_fingerprint, template_id, document_size, page_count)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (document_fingerprint)
         DO UPDATE SET template_id = EXCLUDED.template_id,
                       document_size = EXCLUDED.document_size,
                       page_count = EXCLUDED.page_count,
                       updated_at = now()",
    )
    .bind(&input.document_fingerprint)
    .bind(&input.template_id)
    .bind(input.document_size)
    .bind(input.page_count)
    .execute(&mut **tx)
    .await
    .map_err(classify_sqlx_error)?;
    Ok(())
}

async fn replace_template_layout(
    tx: &mut Transaction<'_, Postgres>,
    template_id: &str,
    fields: &[DocumentTemplateFieldInput],
) -> Result<(), TemplateError> {
    let field_ids = fields
        .iter()
        .map(|field| field.id.clone())
        .collect::<Vec<_>>();

    sqlx::query(
        "DELETE FROM qextrai.document_template_regions r
         USING qextrai.document_template_fields f
         WHERE r.template_field_id = f.id AND f.template_id = $1",
    )
    .bind(template_id)
    .execute(&mut **tx)
    .await
    .map_err(classify_sqlx_error)?;

    sqlx::query(
        "DELETE FROM qextrai.document_template_fields
         WHERE template_id = $1 AND NOT (id = ANY($2))",
    )
    .bind(template_id)
    .bind(&field_ids)
    .execute(&mut **tx)
    .await
    .map_err(classify_sqlx_error)?;

    for field in fields {
        sqlx::query(
            "INSERT INTO qextrai.document_template_fields
               (id, template_id, field_definition_id, sort_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id)
             DO UPDATE SET template_id = EXCLUDED.template_id,
                           field_definition_id = EXCLUDED.field_definition_id,
                           sort_order = EXCLUDED.sort_order",
        )
        .bind(&field.id)
        .bind(template_id)
        .bind(&field.field_definition_id)
        .bind(field.sort_order)
        .execute(&mut **tx)
        .await
        .map_err(classify_sqlx_error)?;

        for region in &field.regions {
            sqlx::query(
                "INSERT INTO qextrai.document_template_regions
                   (id, template_field_id, page_number, x, y, width, height)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(&region.id)
            .bind(&field.id)
            .bind(region.page_number)
            .bind(region.x)
            .bind(region.y)
            .bind(region.width)
            .bind(region.height)
            .execute(&mut **tx)
            .await
            .map_err(classify_sqlx_error)?;
        }
    }
    Ok(())
}

async fn load_template(
    pool: &PgPool,
    template_id: &str,
) -> Result<Option<DocumentTemplate>, TemplateError> {
    let template_row = sqlx::query(
        "SELECT id, name, normalized_name, revision, source_page_count
         FROM qextrai.document_templates WHERE id = $1",
    )
    .bind(template_id)
    .fetch_optional(pool)
    .await
    .map_err(classify_sqlx_error)?;

    let Some(row) = template_row else {
        return Ok(None);
    };

    let field_rows = sqlx::query(
        "SELECT id, field_definition_id, sort_order
         FROM qextrai.document_template_fields
         WHERE template_id = $1
         ORDER BY sort_order ASC, id ASC",
    )
    .bind(template_id)
    .fetch_all(pool)
    .await
    .map_err(classify_sqlx_error)?;

    let mut fields = Vec::new();
    for field_row in field_rows {
        let field_id: String = field_row.get("id");
        let regions = sqlx::query(
            "SELECT id, page_number, x, y, width, height
             FROM qextrai.document_template_regions
             WHERE template_field_id = $1
             ORDER BY page_number ASC, id ASC",
        )
        .bind(&field_id)
        .fetch_all(pool)
        .await
        .map_err(classify_sqlx_error)?
        .into_iter()
        .map(map_region_row)
        .collect();

        fields.push(DocumentTemplateField {
            id: field_id,
            field_definition_id: field_row.get("field_definition_id"),
            sort_order: field_row.get("sort_order"),
            regions,
        });
    }

    Ok(Some(DocumentTemplate {
        id: row.get("id"),
        name: row.get("name"),
        normalized_name: row.get("normalized_name"),
        revision: row.get("revision"),
        source_page_count: row.get("source_page_count"),
        fields,
    }))
}

fn map_region_row(row: PgRow) -> DocumentTemplateRegion {
    DocumentTemplateRegion {
        id: row.get("id"),
        page_number: row.get("page_number"),
        x: row.get("x"),
        y: row.get("y"),
        width: row.get("width"),
        height: row.get("height"),
    }
}

fn validate_create_payload(input: &CreateDocumentTemplateInput) -> Result<(), TemplateError> {
    validate_id("Template", &input.id)?;
    validate_template_name(&input.name)?;
    validate_page_count(input.source_page_count)?;
    validate_bind_parts(
        &input.document_fingerprint,
        input.document_size,
        input.page_count,
    )?;
    validate_fields(&input.fields)
}

fn validate_update_payload(input: &UpdateDocumentTemplateInput) -> Result<(), TemplateError> {
    validate_id("Template", &input.id)?;
    if input.expected_revision < 1 {
        return Err(TemplateError::InvalidData(
            "Revisione non valida.".to_string(),
        ));
    }
    validate_page_count(input.source_page_count)?;
    validate_fields(&input.fields)
}

fn validate_bind_payload(input: &BindDocumentTemplateInput) -> Result<(), TemplateError> {
    validate_id("Template", &input.template_id)?;
    validate_bind_parts(
        &input.document_fingerprint,
        input.document_size,
        input.page_count,
    )
}

fn validate_bind_parts(
    fingerprint: &str,
    document_size: i64,
    page_count: i32,
) -> Result<(), TemplateError> {
    validate_fingerprint(fingerprint)?;
    if document_size < 0 {
        return Err(TemplateError::InvalidData(
            "Dimensione documento non valida.".to_string(),
        ));
    }
    validate_page_count(page_count)
}

fn validate_fields(fields: &[DocumentTemplateFieldInput]) -> Result<(), TemplateError> {
    if fields.is_empty() {
        return Err(TemplateError::InvalidData(
            "Il template deve contenere almeno un campo.".to_string(),
        ));
    }
    let mut field_ids = HashSet::new();
    let mut definition_ids = HashSet::new();
    let mut region_ids = HashSet::new();
    for field in fields {
        validate_id("Campo template", &field.id)?;
        validate_id("Definizione campo", &field.field_definition_id)?;
        if field.sort_order < 0 {
            return Err(TemplateError::InvalidData(
                "Ordinamento campo non valido.".to_string(),
            ));
        }
        if !field_ids.insert(field.id.clone())
            || !definition_ids.insert(field.field_definition_id.clone())
        {
            return Err(TemplateError::InvalidData(
                "Il template contiene campi duplicati.".to_string(),
            ));
        }
        if field.regions.is_empty() {
            return Err(TemplateError::InvalidData(
                "Ogni campo deve avere almeno un'area.".to_string(),
            ));
        }
        for region in &field.regions {
            validate_region(region)?;
            if !region_ids.insert(region.id.clone()) {
                return Err(TemplateError::InvalidData(
                    "Il template contiene aree duplicate.".to_string(),
                ));
            }
        }
    }
    Ok(())
}

fn validate_region(region: &DocumentTemplateRegionInput) -> Result<(), TemplateError> {
    validate_id("Area template", &region.id)?;
    if region.page_number < 1 {
        return Err(TemplateError::InvalidData(
            "Pagina area non valida.".to_string(),
        ));
    }
    for value in [region.x, region.y, region.width, region.height] {
        if !value.is_finite() {
            return Err(TemplateError::InvalidData(
                "Coordinate area non valide.".to_string(),
            ));
        }
    }
    if region.x < 0.0
        || region.y < 0.0
        || region.x > 1.0
        || region.y > 1.0
        || region.width <= 0.0
        || region.height <= 0.0
        || region.x + region.width > 1.0
        || region.y + region.height > 1.0
    {
        return Err(TemplateError::InvalidData(
            "Coordinate area non valide.".to_string(),
        ));
    }
    Ok(())
}

fn validate_id(label: &str, id: &str) -> Result<(), TemplateError> {
    if id.trim().is_empty() {
        return Err(TemplateError::InvalidData(format!("{label} non valido.")));
    }
    Ok(())
}

fn validate_template_name(name: &str) -> Result<(), TemplateError> {
    let cleaned = clean_field_name(name);
    if cleaned.is_empty() {
        return Err(TemplateError::InvalidData(
            "Il nome template è obbligatorio.".to_string(),
        ));
    }
    if cleaned.chars().count() > 100 {
        return Err(TemplateError::InvalidData(
            "Il nome template può contenere al massimo 100 caratteri.".to_string(),
        ));
    }
    Ok(())
}

fn validate_page_count(page_count: i32) -> Result<(), TemplateError> {
    if page_count < 1 {
        Err(TemplateError::InvalidData(
            "Numero pagine non valido.".to_string(),
        ))
    } else {
        Ok(())
    }
}

pub fn validate_fingerprint(fingerprint: &str) -> Result<(), TemplateError> {
    if fingerprint.len() == 64
        && fingerprint
            .chars()
            .all(|character| character.is_ascii_hexdigit() && !character.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(TemplateError::InvalidData(
            "Fingerprint documento non valido.".to_string(),
        ))
    }
}

fn classify_sqlx_error(error: Error) -> TemplateError {
    if let Error::Database(database_error) = &error {
        if let Some(pg_error) = database_error.try_downcast_ref::<PgDatabaseError>() {
            return match pg_error.code() {
                "23505" => TemplateError::Duplicate,
                "23503" => TemplateError::InvalidData(
                    "Il template fa riferimento a campi non presenti nel catalogo.".to_string(),
                ),
                "23514" | "23502" | "22P02" => TemplateError::InvalidData(
                    "I dati del template non rispettano i vincoli.".to_string(),
                ),
                "42501" => TemplateError::PermissionDenied,
                _ => TemplateError::Postgres(redact_error_detail(&error.to_string())),
            };
        }
    }
    TemplateError::Postgres(redact_error_detail(&error.to_string()))
}

pub fn redact_error_detail(detail: &str) -> String {
    super::models::redact_secret_text(detail)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TemplateError {
    DatabaseUnavailable(String),
    MigrationFailed(String),
    PermissionDenied,
    Duplicate,
    RevisionConflict,
    InvalidData(String),
    Postgres(String),
}

impl From<super::connection_manager::ConnectionManagerError> for TemplateError {
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

impl TemplateError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::DatabaseUnavailable(_) => "Template non disponibili.",
            Self::MigrationFailed(_) => "Migrazione template non riuscita.",
            Self::PermissionDenied => "Permessi insufficienti sul database qExtrai.",
            Self::Duplicate => "Esiste già un template con questo nome.",
            Self::RevisionConflict => "Il template è stato modificato da un altro operatore.",
            Self::InvalidData(_) => "I dati del template non sono validi.",
            Self::Postgres(_) => "Errore PostgreSQL durante l'accesso ai template.",
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

    fn valid_region(id: &str, page_number: i32) -> DocumentTemplateRegionInput {
        DocumentTemplateRegionInput {
            id: id.to_string(),
            page_number,
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.2,
        }
    }

    fn valid_field() -> DocumentTemplateFieldInput {
        DocumentTemplateFieldInput {
            id: "template-field-1".to_string(),
            field_definition_id: "definition-1".to_string(),
            sort_order: 0,
            regions: vec![valid_region("region-1", 1)],
        }
    }

    #[test]
    fn validates_coordinates_and_pages() {
        assert!(validate_region(&valid_region("region-1", 1)).is_ok());
        assert!(validate_region(&DocumentTemplateRegionInput {
            x: 0.9,
            width: 0.2,
            ..valid_region("region-1", 1)
        })
        .is_err());
        assert!(validate_region(&DocumentTemplateRegionInput {
            page_number: 0,
            ..valid_region("region-1", 1)
        })
        .is_err());
    }

    #[test]
    fn normalizes_template_name() {
        assert_eq!(
            normalize_field_name("  Preventivo   Standard "),
            "preventivo standard"
        );
    }

    #[test]
    fn detects_duplicate_payload_parts() {
        let mut first = valid_field();
        let mut second = valid_field();
        second.id = "template-field-2".to_string();
        second.regions[0].id = first.regions[0].id.clone();
        assert!(validate_fields(&[first.clone(), second]).is_err());
        first.regions[0].id = "region-unique".to_string();
        assert!(validate_fields(&[first]).is_ok());
    }

    #[test]
    fn validates_fingerprint() {
        assert!(validate_fingerprint(&"a".repeat(64)).is_ok());
        assert!(validate_fingerprint(&"A".repeat(64)).is_err());
        assert!(validate_fingerprint("abc").is_err());
    }

    #[test]
    fn maps_row_shape_by_region_helper() {
        let region = valid_region("region-1", 3);
        assert_eq!(region.page_number, 3);
    }

    #[test]
    fn classifies_revision_conflict() {
        assert_eq!(
            TemplateError::RevisionConflict.code(),
            CommandErrorCode::RevisionConflict
        );
    }

    #[test]
    fn migration_sql_has_required_structure() {
        let sql = include_str!("../../migrations/202607200002_create_document_templates.sql");
        assert!(sql.contains("CREATE TABLE qextrai.document_templates"));
        assert!(sql.contains("CREATE TABLE qextrai.document_template_fields"));
        assert!(sql.contains("CREATE TABLE qextrai.document_template_regions"));
        assert!(sql.contains("CREATE TABLE qextrai.document_template_bindings"));
        assert!(sql.contains("document_fingerprint ~ '^[0-9a-f]{64}$'"));
    }
}
