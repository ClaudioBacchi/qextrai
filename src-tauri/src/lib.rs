mod database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running qExtrai");
}
