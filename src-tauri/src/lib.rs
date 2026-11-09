pub mod translator;
pub mod types;

use std::path::{Path, PathBuf};

use tauri::{Manager, State};

use translator::Translator;
use types::{ModelStatus, TranslationRequest};

struct AppState {
    translator: Translator,
}

#[tauri::command]
fn model_status(state: State<'_, AppState>) -> ModelStatus {
    state.translator.status()
}

#[tauri::command]
fn reload_model(state: State<'_, AppState>) -> Result<(), String> {
    state.translator.reload()
}

#[tauri::command]
fn open_model_folder(state: State<'_, AppState>) -> Result<(), String> {
    let status = state.translator.status();
    let dir = status
        .model_path
        .as_deref()
        .and_then(|path| Path::new(path).parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from(&status.search_dir));
    open::that(dir).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_external(link: String) -> Result<(), String> {
    let url = match link.as_str() {
        "model" => "https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/blob/main/plamo-3-translate-0.8b-Q4_K_M.gguf",
        "license" => "https://plamo.preferredai.jp/info/plamo-community-license-ja",
        _ => return Err("Unknown model link".into()),
    };
    open::that(url).map_err(|error| error.to_string())
}

#[tauri::command]
fn start_translation(
    state: State<'_, AppState>,
    request: TranslationRequest,
) -> Result<(), String> {
    validate_request(&request)?;
    state.translator.translate(request)
}

#[tauri::command]
fn cancel_translation(state: State<'_, AppState>) {
    state.translator.cancel();
}

fn validate_request(request: &TranslationRequest) -> Result<(), String> {
    if request.text.is_empty() || request.text.len() > 1_000_000 {
        return Err("翻訳リクエストが不正です".into());
    }
    if request.source_lang != "en" && request.source_lang != "auto" {
        return Err("翻訳リクエストが不正です".into());
    }
    if request.target_lang != "ja" || (request.form != "plain" && request.form != "polite") {
        return Err("翻訳リクエストが不正です".into());
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .setup(|app| {
            let resource_dir = app.path().resource_dir().ok();
            let translator = Translator::spawn(app.handle().clone(), resource_dir);
            app.manage(AppState { translator });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            model_status,
            reload_model,
            open_model_folder,
            open_external,
            start_translation,
            cancel_translation
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<AppState>().translator.shutdown();
            }
        });
}
