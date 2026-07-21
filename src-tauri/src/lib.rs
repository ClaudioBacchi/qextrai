mod database;
mod pdf_extraction;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let staged_documents = pdf_extraction::StagedDocumentStore::default();
    let staged_documents_for_exit = staged_documents.clone();
    tauri::Builder::default()
        .manage(staged_documents)
        .invoke_handler(tauri::generate_handler![
            database::commands::get_database_settings,
            database::commands::save_database_settings,
            database::commands::test_database_connection,
            database::commands::list_field_definitions,
            database::commands::create_field_definition,
            database::commands::update_field_definition_format,
            database::commands::list_document_templates,
            database::commands::get_document_template,
            database::commands::find_document_template_by_fingerprint,
            database::commands::create_document_template,
            database::commands::update_document_template,
            database::commands::bind_document_template,
            database::commands::load_document_values,
            database::commands::save_document_values,
            pdf_extraction::stage_pdf_document,
            pdf_extraction::release_staged_document,
            pdf_extraction::extract_pdf_regions,
        ])
        .on_window_event(move |_window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                staged_documents_for_exit.cleanup_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running qExtrai");
}
