mod database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            database::commands::get_database_settings,
            database::commands::save_database_settings,
            database::commands::test_database_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running qExtrai");
}
