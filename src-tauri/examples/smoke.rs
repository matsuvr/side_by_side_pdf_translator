//! Command line smoke test for the llama.cpp integration.
//!
//! ```text
//! cargo run --example smoke -- [model.gguf] ["sentence to translate"]
//! ```

use std::num::NonZeroU32;
use std::path::PathBuf;
use std::time::Instant;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use plamo_pdf_translator_lib::translator::{
    build_prompt, clean_translation, decode_token_bytes, model_params, normalise_source,
    tokenize_plamo3, MODEL_FILE_NAME,
};
use plamo_pdf_translator_lib::types::TranslationRequest;

fn main() {
    let mut args = std::env::args().skip(1);
    let model_path = PathBuf::from(args.next().unwrap_or_else(|| MODEL_FILE_NAME.to_string()));
    let text = args.next().unwrap_or_else(|| {
        "The Transformer is a new simple network architecture based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.".to_string()
    });

    let backend = LlamaBackend::init().expect("backend");
    let devices = llama_cpp_2::list_llama_ggml_backend_devices();
    println!("devices: {devices:?}");

    let gpu_layers = if devices
        .iter()
        .any(|d| !matches!(d.device_type, llama_cpp_2::LlamaBackendDeviceType::Cpu))
    {
        999
    } else {
        0
    };
    let params = model_params(gpu_layers);

    let load_started = Instant::now();
    let model = LlamaModel::load_from_file(&backend, &model_path, &params).expect("load model");
    println!("model loaded in {:?}", load_started.elapsed());

    let request = TranslationRequest {
        request_id: 1,
        text: normalise_source(&text),
        source_lang: "en".into(),
        target_lang: "ja".into(),
        form: "plain".into(),
    };

    let vocab = model.vocab();
    let prompt = build_prompt(&request.text, &request);
    let tokens = tokenize_plamo3(&vocab, &prompt);
    println!("prompt tokens: {}", tokens.len());
    println!(
        "first tokens: {:?}",
        tokens.iter().take(16).map(|t| t.0).collect::<Vec<_>>()
    );

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(4_096))
        .with_n_batch(2_048);
    let mut ctx = model.new_context(&backend, ctx_params).expect("context");
    let mut batch = LlamaBatch::new(2_048, 1);
    let mut pos = 0i32;
    let total = tokens.len();
    for (index, token) in tokens.iter().enumerate() {
        let logits = index + 1 == total;
        batch.add(*token, pos, &[0], logits).expect("add");
        pos += 1;
    }

    let started = Instant::now();
    ctx.decode(&mut batch).expect("decode prompt");
    let prompt_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("prompt decode: {prompt_ms:.1} ms");

    let mut sampler = LlamaSampler::greedy();
    let mut out: Vec<u8> = Vec::new();
    let mut generated = 0usize;
    let token_budget: usize = std::env::var("PLAMO_SMOKE_N")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(512);
    let ignore_stops = std::env::var("PLAMO_SMOKE_IGNORE_STOP")
        .map(|v| v == "1")
        .unwrap_or(false);
    while generated < token_budget {
        let index = batch.n_tokens() - 1;
        let token = sampler.sample(&ctx, index);
        sampler.accept(token);
        if !ignore_stops && vocab.is_eog(token) {
            break;
        }
        let mut piece = Vec::new();
        vocab.token_to_piece_into(token, &mut piece, false, None);
        out.extend_from_slice(&piece);
        if !ignore_stops {
            let text = decode_token_bytes(&out);
            if text.contains("<|plamo:") || text.contains("</s>") {
                break;
            }
        }
        batch.clear();
        batch.add(token, pos, &[0], true).expect("add");
        pos += 1;
        ctx.decode(&mut batch).expect("decode token");
        generated += 1;
    }

    let text = clean_translation(&decode_token_bytes(&out));
    let elapsed = started.elapsed();
    println!("\n--- translation ---\n{text}\n---");
    println!(
        "prefill: {} tokens in {:.1} ms ({:.1} tok/s)",
        total,
        prompt_ms,
        total as f64 / (prompt_ms / 1000.0)
    );
    println!(
        "decode: {} tokens in {:.1} ms ({:.1} tok/s)",
        generated,
        elapsed.as_secs_f64() * 1000.0,
        generated as f64 / elapsed.as_secs_f64()
    );
}
