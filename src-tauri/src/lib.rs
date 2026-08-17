use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::source::SystemSource;
use serde::Serialize;

mod collab;

#[derive(Serialize)]
struct FontInfo {
    family: String,
    weights: Vec<u16>,
    has_italic: bool,
}

#[tauri::command]
async fn list_system_fonts() -> Vec<FontInfo> {
    tauri::async_runtime::spawn_blocking(|| {
        let source = SystemSource::new();

        let families = match source.all_families() {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };

        let mut result: Vec<FontInfo> = families
            .into_iter()
            .filter(|name| !name.starts_with('.'))
            .map(|family| FontInfo {
                family,
                weights: vec![400, 700],
                has_italic: true,
            })
            .collect();

        result.sort_by(|a, b| a.family.cmp(&b.family));
        result
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
async fn read_font_file(family: String) -> Vec<u8> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = SystemSource::new();
        let handle = match source.select_best_match(
            &[FamilyName::Title(family)],
            &Properties::new(),
        ) {
            Ok(h) => h,
            Err(_) => return Vec::new(),
        };

        // Get the font file path and read it
        match handle {
            font_kit::handle::Handle::Path { path, .. } => {
                std::fs::read(&path).unwrap_or_default()
            }
            font_kit::handle::Handle::Memory { bytes, .. } => {
                bytes.to_vec()
            }
        }
    })
    .await
    .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(collab::CollabState::default())
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            read_font_file,
            collab::collab_start,
            collab::collab_send,
            collab::collab_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
