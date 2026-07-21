use pdf_oxide::{geometry::Rect, layout::RectFilterMode, layout::TextChar, PdfDocument};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::ipc::{InvokeBody, Request};
use uuid::Uuid;

const MAX_PDF_BYTES: usize = 50 * 1024 * 1024;
const TOKEN_TTL: Duration = Duration::from_secs(60 * 60 * 8);

#[derive(Default, Clone)]
pub struct StagedDocumentStore {
    documents: Arc<Mutex<HashMap<String, StagedDocument>>>,
}

impl StagedDocumentStore {
    fn insert(&self, document: StagedDocument) {
        self.cleanup_expired();
        self.documents
            .lock()
            .expect("staged document mutex poisoned")
            .insert(document.token.clone(), document);
    }

    fn get_path(&self, token: &str) -> Result<PathBuf, PdfExtractionError> {
        self.cleanup_expired();
        let documents = self
            .documents
            .lock()
            .expect("staged document mutex poisoned");
        let document = documents
            .get(token)
            .ok_or(PdfExtractionError::TokenNotFound)?;
        if document.created_at.elapsed() > TOKEN_TTL {
            return Err(PdfExtractionError::TokenExpired);
        }
        Ok(document.path.clone())
    }

    fn release(&self, token: &str) -> bool {
        let document = self
            .documents
            .lock()
            .expect("staged document mutex poisoned")
            .remove(token);
        if let Some(document) = document {
            let _ = fs::remove_file(document.path);
            return true;
        }
        false
    }

    fn cleanup_expired(&self) {
        let mut documents = self
            .documents
            .lock()
            .expect("staged document mutex poisoned");
        let expired: Vec<String> = documents
            .iter()
            .filter_map(|(token, document)| {
                (document.created_at.elapsed() > TOKEN_TTL).then(|| token.clone())
            })
            .collect();
        for token in expired {
            if let Some(document) = documents.remove(&token) {
                let _ = fs::remove_file(document.path);
            }
        }
    }

    pub fn cleanup_all(&self) {
        let documents = std::mem::take(
            &mut *self
                .documents
                .lock()
                .expect("staged document mutex poisoned"),
        );
        for document in documents.into_values() {
            let _ = fs::remove_file(document.path);
        }
    }
}

impl Drop for StagedDocumentStore {
    fn drop(&mut self) {
        if Arc::strong_count(&self.documents) == 1 {
            self.cleanup_all();
        }
    }
}

#[derive(Clone)]
struct StagedDocument {
    token: String,
    path: PathBuf,
    created_at: Instant,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagePdfDocumentResult {
    token: String,
    fingerprint: String,
    page_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPdfRegionsInput {
    document_token: String,
    regions: Vec<ExtractPdfRegionInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPdfRegionInput {
    region_id: String,
    document_field_id: String,
    field_definition_id: String,
    page_number: usize,
    rect: NormalizedRect,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub struct NormalizedRect {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractPdfRegionResult {
    region_id: String,
    document_field_id: String,
    page_number: usize,
    raw_text: String,
    status: ExtractPdfRegionStatus,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ExtractPdfRegionStatus {
    Read,
    Empty,
}

#[derive(Debug, thiserror::Error)]
pub enum PdfExtractionError {
    #[error("Il corpo della richiesta deve contenere i byte raw del PDF.")]
    MissingRawBody,
    #[error("Il documento supera il limite massimo di 50 MiB.")]
    DocumentTooLarge,
    #[error("Il file non sembra essere un PDF valido.")]
    InvalidPdfSignature,
    #[error("Non è stato possibile aprire il PDF.")]
    PdfOpenFailed,
    #[error("Il PDF è protetto o non consente la lettura.")]
    ProtectedPdf,
    #[error("Documento temporaneo non trovato. Riapri il PDF.")]
    TokenNotFound,
    #[error("Documento temporaneo scaduto. Riapri il PDF.")]
    TokenExpired,
    #[error("La pagina indicata non esiste.")]
    PageNotFound,
    #[error("Coordinate area non valide.")]
    InvalidCoordinates,
    #[error("Questa geometria di pagina non è ancora supportata.")]
    UnsupportedPageGeometry,
    #[error("Errore interno durante la lettura del PDF.")]
    EngineError,
}

impl Serialize for PdfExtractionError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[tauri::command]
pub async fn stage_pdf_document(
    request: Request<'_>,
    state: tauri::State<'_, StagedDocumentStore>,
) -> Result<StagePdfDocumentResult, PdfExtractionError> {
    let body = raw_pdf_body(request.body())?.to_vec();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || stage_pdf_bytes(&state, body))
        .await
        .map_err(|_| PdfExtractionError::EngineError)?
}

#[tauri::command]
pub fn release_staged_document(
    document_token: String,
    state: tauri::State<'_, StagedDocumentStore>,
) -> bool {
    state.release(&document_token)
}

#[tauri::command]
pub async fn extract_pdf_regions(
    input: ExtractPdfRegionsInput,
    state: tauri::State<'_, StagedDocumentStore>,
) -> Result<Vec<ExtractPdfRegionResult>, PdfExtractionError> {
    let path = state.get_path(&input.document_token)?;
    tauri::async_runtime::spawn_blocking(move || extract_regions_from_path(&path, &input.regions))
        .await
        .map_err(|_| PdfExtractionError::EngineError)?
}

pub fn raw_pdf_body(body: &InvokeBody) -> Result<&[u8], PdfExtractionError> {
    let InvokeBody::Raw(bytes) = body else {
        return Err(PdfExtractionError::MissingRawBody);
    };
    validate_pdf_bytes(bytes)?;
    Ok(bytes)
}

pub fn validate_pdf_bytes(bytes: &[u8]) -> Result<(), PdfExtractionError> {
    if bytes.len() > MAX_PDF_BYTES {
        return Err(PdfExtractionError::DocumentTooLarge);
    }
    if !bytes.starts_with(b"%PDF-") {
        return Err(PdfExtractionError::InvalidPdfSignature);
    }
    Ok(())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn stage_pdf_bytes(
    store: &StagedDocumentStore,
    bytes: Vec<u8>,
) -> Result<StagePdfDocumentResult, PdfExtractionError> {
    validate_pdf_bytes(&bytes)?;
    let fingerprint = sha256_hex(&bytes);
    let token = Uuid::new_v4().simple().to_string();
    let path = staged_pdf_path(&token);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| PdfExtractionError::EngineError)?;
    }
    fs::write(&path, &bytes).map_err(|_| PdfExtractionError::EngineError)?;
    let result = verify_staged_pdf(&path, &token, &fingerprint);
    if result.is_err() {
        let _ = fs::remove_file(&path);
    }
    let page_count = result?;

    store.insert(StagedDocument {
        token: token.clone(),
        path,
        created_at: Instant::now(),
    });

    Ok(StagePdfDocumentResult {
        token,
        fingerprint,
        page_count,
    })
}

fn staged_pdf_path(token: &str) -> PathBuf {
    std::env::temp_dir()
        .join("qextrai")
        .join("staged-pdf")
        .join(format!("{token}.pdf"))
}

fn verify_staged_pdf(
    path: &Path,
    _token: &str,
    _fingerprint: &str,
) -> Result<usize, PdfExtractionError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| PdfExtractionError::EngineError)?;
    }
    let doc = PdfDocument::open(path).map_err(|_| PdfExtractionError::PdfOpenFailed)?;
    if doc.is_encrypted() && !doc.is_authenticated() {
        return Err(PdfExtractionError::ProtectedPdf);
    }
    doc.page_count()
        .map_err(|_| PdfExtractionError::PdfOpenFailed)
}

fn extract_regions_from_path(
    path: &Path,
    regions: &[ExtractPdfRegionInput],
) -> Result<Vec<ExtractPdfRegionResult>, PdfExtractionError> {
    let doc = PdfDocument::open(path).map_err(|_| PdfExtractionError::PdfOpenFailed)?;
    if doc.is_encrypted() && !doc.is_authenticated() {
        return Err(PdfExtractionError::ProtectedPdf);
    }
    let page_count = doc
        .page_count()
        .map_err(|_| PdfExtractionError::PdfOpenFailed)?;
    let mut results = Vec::with_capacity(regions.len());

    for region in regions {
        validate_id(&region.region_id)?;
        validate_id(&region.document_field_id)?;
        validate_id(&region.field_definition_id)?;
        if region.page_number == 0 || region.page_number > page_count {
            return Err(PdfExtractionError::PageNotFound);
        }
        let page_index = region.page_number - 1;
        let rect = convert_normalized_rect(&doc, page_index, region.rect)?;
        let raw_text = extract_text_by_character_centers(&doc, page_index, rect)?;
        let status = if raw_text.is_empty() {
            ExtractPdfRegionStatus::Empty
        } else {
            ExtractPdfRegionStatus::Read
        };
        results.push(ExtractPdfRegionResult {
            region_id: region.region_id.clone(),
            document_field_id: region.document_field_id.clone(),
            page_number: region.page_number,
            raw_text,
            status,
        });
    }

    Ok(results)
}

pub fn convert_normalized_rect(
    doc: &PdfDocument,
    page_index: usize,
    rect: NormalizedRect,
) -> Result<Rect, PdfExtractionError> {
    validate_rect(rect)?;
    let page_info = doc
        .get_page_info(page_index)
        .map_err(|_| PdfExtractionError::PageNotFound)?;
    if page_info.rotation != 0 || page_info.crop_box.is_some() {
        return Err(PdfExtractionError::UnsupportedPageGeometry);
    }
    let (left, bottom, right, top) = doc
        .get_page_media_box(page_index)
        .map_err(|_| PdfExtractionError::PageNotFound)?;
    let page_width = right - left;
    let page_height = top - bottom;
    if page_width <= 0.0 || page_height <= 0.0 {
        return Err(PdfExtractionError::UnsupportedPageGeometry);
    }
    Ok(Rect::new(
        left + rect.x * page_width,
        bottom + (1.0 - rect.y - rect.height) * page_height,
        rect.width * page_width,
        rect.height * page_height,
    ))
}

fn validate_rect(rect: NormalizedRect) -> Result<(), PdfExtractionError> {
    let valid = rect.x.is_finite()
        && rect.y.is_finite()
        && rect.width.is_finite()
        && rect.height.is_finite()
        && rect.x >= 0.0
        && rect.y >= 0.0
        && rect.width > 0.0
        && rect.height > 0.0
        && rect.x + rect.width <= 1.0
        && rect.y + rect.height <= 1.0;
    if valid {
        Ok(())
    } else {
        Err(PdfExtractionError::InvalidCoordinates)
    }
}

fn validate_id(value: &str) -> Result<(), PdfExtractionError> {
    if value.trim().is_empty() || value.len() > 160 {
        return Err(PdfExtractionError::InvalidCoordinates);
    }
    Ok(())
}

fn normalize_extracted_text(text: &str) -> String {
    let normalized_lines: Vec<String> = text
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|line| !line.is_empty())
        .collect();
    normalized_lines.join("\n").trim().to_string()
}

fn extract_text_by_character_centers(
    doc: &PdfDocument,
    page_index: usize,
    rect: Rect,
) -> Result<String, PdfExtractionError> {
    let chars = doc
        .extract_chars_in_rect(page_index, rect, RectFilterMode::Intersects)
        .map_err(|_| PdfExtractionError::EngineError)?;
    let selected: Vec<TextChar> = chars
        .into_iter()
        .filter(|character| character_center_inside_rect(character, rect))
        .collect();
    Ok(reconstruct_text_from_chars(selected))
}

fn character_center_inside_rect(character: &TextChar, rect: Rect) -> bool {
    const EPSILON: f32 = 0.001;
    let center_x = character.bbox.x + character.bbox.width / 2.0;
    let center_y = character.bbox.y + character.bbox.height / 2.0;
    center_x >= rect.x - EPSILON
        && center_x <= rect.x + rect.width + EPSILON
        && center_y >= rect.y - EPSILON
        && center_y <= rect.y + rect.height + EPSILON
}

fn reconstruct_text_from_chars(mut chars: Vec<TextChar>) -> String {
    if chars.is_empty() {
        return String::new();
    }

    chars.sort_by(|first, second| {
        let first_center_y = first.bbox.y + first.bbox.height / 2.0;
        let second_center_y = second.bbox.y + second.bbox.height / 2.0;
        second_center_y
            .partial_cmp(&first_center_y)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                first
                    .bbox
                    .x
                    .partial_cmp(&second.bbox.x)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let average_height =
        chars.iter().map(|item| item.bbox.height).sum::<f32>() / chars.len() as f32;
    let line_tolerance = (average_height * 0.55).max(1.0);
    let mut lines: Vec<Vec<TextChar>> = Vec::new();

    for character in chars {
        let center_y = character.bbox.y + character.bbox.height / 2.0;
        if let Some(line) = lines.last_mut() {
            let line_center_y = line
                .iter()
                .map(|item| item.bbox.y + item.bbox.height / 2.0)
                .sum::<f32>()
                / line.len() as f32;
            if (line_center_y - center_y).abs() <= line_tolerance {
                line.push(character);
                continue;
            }
        }
        lines.push(vec![character]);
    }

    let text = lines
        .into_iter()
        .map(|mut line| {
            line.sort_by(|first, second| {
                first
                    .bbox
                    .x
                    .partial_cmp(&second.bbox.x)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            reconstruct_line_from_chars(&line)
        })
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    normalize_extracted_text(&text)
}

fn reconstruct_line_from_chars(chars: &[TextChar]) -> String {
    let mut line = String::new();
    let average_width = (chars
        .iter()
        .filter(|item| !item.char.is_whitespace())
        .map(|item| item.bbox.width.max(0.0))
        .sum::<f32>()
        / chars
            .iter()
            .filter(|item| !item.char.is_whitespace())
            .count()
            .max(1) as f32)
        .max(1.0);
    let space_gap_threshold = average_width * 0.9;
    let mut previous_right: Option<f32> = None;

    for character in chars {
        if let Some(right) = previous_right {
            let gap = character.bbox.x - right;
            if gap > space_gap_threshold && !line.ends_with(' ') && !character.char.is_whitespace()
            {
                line.push(' ');
            }
        }
        line.push(character.char);
        previous_right = Some(character.bbox.x + character.bbox.width);
    }

    line
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_pdf_signature_and_limit() {
        assert!(matches!(
            validate_pdf_bytes(b"not pdf"),
            Err(PdfExtractionError::InvalidPdfSignature)
        ));
        let oversized = vec![b'x'; MAX_PDF_BYTES + 1];
        assert!(matches!(
            validate_pdf_bytes(&oversized),
            Err(PdfExtractionError::DocumentTooLarge)
        ));
    }

    #[test]
    fn computes_sha256() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn converts_a4_normalized_coordinates_to_pdf_points() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), test_pdf_bytes()).unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();
        let rect = convert_normalized_rect(
            &doc,
            0,
            NormalizedRect {
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.4,
            },
        )
        .unwrap();

        assert!((rect.x - 59.528).abs() < 0.1);
        assert!((rect.y - 336.756).abs() < 0.1);
        assert!((rect.width - 178.584).abs() < 0.1);
        assert!((rect.height - 336.756).abs() < 0.1);
    }

    #[test]
    fn rejects_out_of_bounds_coordinates() {
        assert!(matches!(
            validate_rect(NormalizedRect {
                x: 0.9,
                y: 0.0,
                width: 0.2,
                height: 0.2,
            }),
            Err(PdfExtractionError::InvalidCoordinates)
        ));
    }

    #[test]
    fn rejects_missing_page() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), test_pdf_bytes()).unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();

        assert!(matches!(
            convert_normalized_rect(
                &doc,
                99,
                NormalizedRect {
                    x: 0.0,
                    y: 0.0,
                    width: 0.1,
                    height: 0.1,
                },
            ),
            Err(PdfExtractionError::PageNotFound)
        ));
    }

    #[test]
    fn rejects_page_with_crop_box() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(
            file.path(),
            build_pdf_with_page_options(
                "BT /F1 12 Tf 72 720 Td (Hello) Tj ET",
                "/CropBox [10 10 580 830]",
            ),
        )
        .unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();

        assert!(matches!(
            convert_normalized_rect(
                &doc,
                0,
                NormalizedRect {
                    x: 0.0,
                    y: 0.0,
                    width: 0.1,
                    height: 0.1,
                },
            ),
            Err(PdfExtractionError::UnsupportedPageGeometry)
        ));
    }

    #[test]
    fn stages_with_opaque_token_and_cleans_file() {
        let store = StagedDocumentStore::default();
        let result = stage_pdf_bytes(&store, test_pdf_bytes()).unwrap();
        assert_eq!(result.page_count, 1);
        assert_eq!(result.fingerprint.len(), 64);
        assert!(!result.token.contains('\\'));
        assert!(!result.token.contains('/'));
        let path = store.get_path(&result.token).unwrap();
        assert!(path.exists());
        assert!(store.release(&result.token));
        assert!(!path.exists());
    }

    #[test]
    fn reports_expired_token() {
        let store = StagedDocumentStore::default();
        store.insert(StagedDocument {
            token: "expired".to_string(),
            path: PathBuf::from("missing.pdf"),
            created_at: Instant::now() - TOKEN_TTL - Duration::from_secs(1),
        });
        assert!(matches!(
            store.get_path("expired"),
            Err(PdfExtractionError::TokenExpired | PdfExtractionError::TokenNotFound)
        ));
    }

    #[test]
    fn extracts_text_inside_rect_and_excludes_outside() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), positioned_test_pdf_bytes()).unwrap();
        let regions = vec![
            ExtractPdfRegionInput {
                region_id: "region-1".to_string(),
                document_field_id: "field-1".to_string(),
                field_definition_id: "definition-1".to_string(),
                page_number: 1,
                rect: NormalizedRect {
                    x: 0.08,
                    y: 0.78,
                    width: 0.4,
                    height: 0.1,
                },
            },
            ExtractPdfRegionInput {
                region_id: "region-empty".to_string(),
                document_field_id: "field-empty".to_string(),
                field_definition_id: "definition-1".to_string(),
                page_number: 1,
                rect: NormalizedRect {
                    x: 0.01,
                    y: 0.01,
                    width: 0.1,
                    height: 0.05,
                },
            },
        ];

        let results = extract_regions_from_path(file.path(), &regions).unwrap();
        assert!(results[0].raw_text.contains("INSIDE"));
        assert!(!results[0].raw_text.contains("OUTSIDE"));
        assert_eq!(results[0].status, ExtractPdfRegionStatus::Read);
        assert_eq!(results[1].status, ExtractPdfRegionStatus::Empty);
    }

    #[test]
    fn extracts_only_characters_whose_centers_are_inside_preventivo_box() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), regression_pdf_bytes()).unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();

        let text = extract_text_by_character_centers(&doc, 0, Rect::new(188.0, 695.0, 83.0, 28.0))
            .unwrap();

        assert_eq!(text, "S00001");
        assert!(!text.contains("Preventivo"));
        assert!(!text.contains('n'));
    }

    #[test]
    fn extracts_only_characters_whose_centers_are_inside_company_box() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), regression_pdf_bytes()).unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();

        let text = extract_text_by_character_centers(&doc, 0, Rect::new(58.0, 635.0, 130.0, 28.0))
            .unwrap();

        assert_eq!(text, "Briccolani SRL");
        assert!(!text.contains(','));
        assert!(!text.contains("Emanuela"));
    }

    #[test]
    fn returns_empty_when_no_character_center_is_inside_box() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), regression_pdf_bytes()).unwrap();
        let regions = vec![ExtractPdfRegionInput {
            region_id: "region-empty".to_string(),
            document_field_id: "field-empty".to_string(),
            field_definition_id: "definition-1".to_string(),
            page_number: 1,
            rect: NormalizedRect {
                x: 0.02,
                y: 0.02,
                width: 0.06,
                height: 0.04,
            },
        }];

        let results = extract_regions_from_path(file.path(), &regions).unwrap();
        assert_eq!(results[0].raw_text, "");
        assert_eq!(results[0].status, ExtractPdfRegionStatus::Empty);
    }

    #[test]
    fn excludes_character_only_touched_by_outer_border() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(
            file.path(),
            build_pdf("BT /F1 20 Tf 60 700 Td (ABCDE) Tj ET"),
        )
        .unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();
        let chars = doc.extract_chars(0).unwrap();
        let first = chars.iter().find(|item| item.char == 'A').unwrap();
        let second = chars.iter().find(|item| item.char == 'B').unwrap();
        let left = first.bbox.x + first.bbox.width - 0.01;
        let right = second.bbox.x + second.bbox.width + 0.01;

        let text =
            extract_text_by_character_centers(&doc, 0, Rect::new(left, 695.0, right - left, 28.0))
                .unwrap();

        assert_eq!(text, "B");
        assert!(!text.contains('A'));
    }

    #[test]
    fn normalized_rect_matches_the_pdf_area_used_by_extractor() {
        let file = tempfile::NamedTempFile::new().unwrap();
        fs::write(file.path(), regression_pdf_bytes()).unwrap();
        let doc = PdfDocument::open(file.path()).unwrap();
        let normalized = NormalizedRect {
            x: 188.0 / 595.28,
            y: (841.89 - 695.0 - 28.0) / 841.89,
            width: 83.0 / 595.28,
            height: 28.0 / 841.89,
        };
        let converted = convert_normalized_rect(&doc, 0, normalized).unwrap();
        let text = extract_text_by_character_centers(&doc, 0, converted).unwrap();

        assert_eq!(text, "S00001");
    }

    fn test_pdf_bytes() -> Vec<u8> {
        build_pdf("BT /F1 12 Tf 72 720 Td (Hello) Tj ET")
    }

    fn positioned_test_pdf_bytes() -> Vec<u8> {
        build_pdf("BT /F1 12 Tf 60 160 Td (INSIDE) Tj 360 600 Td (OUTSIDE) Tj ET")
    }

    fn regression_pdf_bytes() -> Vec<u8> {
        build_pdf("BT /F1 20 Tf 60 700 Td (Preventivo n\\260 S00001) Tj 0 -60 Td (Briccolani SRL, Emanuela Briccolani) Tj ET")
    }

    fn build_pdf(content: &str) -> Vec<u8> {
        build_pdf_with_page_options(content, "")
    }

    fn build_pdf_with_page_options(content: &str, page_options: &str) -> Vec<u8> {
        let objects = vec![
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] {page_options} /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
            format!("<< /Length {} >>\nstream\n{}\nendstream", content.len(), content),
        ];
        let mut pdf = b"%PDF-1.4\n".to_vec();
        let mut offsets = vec![0usize];
        for (index, object) in objects.iter().enumerate() {
            offsets.push(pdf.len());
            pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
        }
        let xref_offset = pdf.len();
        pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
        pdf.extend_from_slice(b"0000000000 65535 f \n");
        for offset in offsets.iter().skip(1) {
            pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
        }
        pdf.extend_from_slice(
            format!(
                "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
                objects.len() + 1,
                xref_offset
            )
            .as_bytes(),
        );
        pdf
    }
}
