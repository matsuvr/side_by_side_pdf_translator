use serde::{Deserialize, Serialize};

/// Lifecycle of the translation model.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelState {
    Loading,
    Ready,
    Missing,
    Error,
}

impl ModelState {
    pub fn as_str(self) -> &'static str {
        match self {
            ModelState::Loading => "loading",
            ModelState::Ready => "ready",
            ModelState::Missing => "missing",
            ModelState::Error => "error",
        }
    }
}

/// Everything the UI needs to know about the local GGUF model.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub state: ModelState,
    pub model_file_name: String,
    pub model_path: Option<String>,
    pub expected_path: String,
    pub search_dir: String,
    pub gpu_backend: Option<String>,
    pub gpu_name: Option<String>,
    pub message: Option<String>,
    pub context_size: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TranslationPhase {
    Preparing,
    Translating,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationRequest {
    pub request_id: i64,
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub form: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationProgress {
    pub request_id: i64,
    pub phase: TranslationPhase,
    pub chunk_index: usize,
    pub chunk_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationDelta {
    pub request_id: i64,
    pub text: String,
    pub chars: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationDone {
    pub request_id: i64,
    pub text: String,
    pub chars: usize,
    pub elapsed_ms: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationError {
    pub request_id: i64,
    pub message: String,
    pub cancelled: bool,
}
