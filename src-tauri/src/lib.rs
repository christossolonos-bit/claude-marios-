use base64::{engine::general_purpose, Engine as _};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// Ollama's local API is reached from Rust (not the webview) so there is no web
// origin for Ollama's CORS to reject, and no browser proxy in the way. We build
// a proxy-less client pointed at 127.0.0.1 to avoid IPv6/proxy surprises.

fn ollama_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn ollama_models() -> Result<Vec<String>, String> {
    let resp = ollama_client()?
        .get("http://127.0.0.1:11434/api/tags")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let models = v["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(models)
}

// Takes a full /api/chat request body (so the frontend can include `tools`) and
// returns the full JSON response (so it can read `message.tool_calls`).
#[tauri::command]
async fn ollama_chat(body: Value) -> Result<Value, String> {
    let resp = ollama_client()?
        .post("http://127.0.0.1:11434/api/chat")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama responded {}: {}", status.as_u16(), text));
    }
    resp.json::<Value>().await.map_err(|e| e.to_string())
}

// Cloud text-to-speech via Fish Audio. Runs from Rust (no browser CORS) and
// returns base64-encoded MP3. The API key comes from the app's local settings.
#[tauri::command]
async fn fish_tts(api_key: String, voice_id: String, text: String) -> Result<String, String> {
    let body = json!({ "text": text, "reference_id": voice_id, "format": "mp3" });
    let resp = reqwest::Client::new()
        .post("https://api.fish.audio/v1/tts")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Fish Audio {}: {}", status.as_u16(), text));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}

// The single JSON file that holds all of the user's projects and settings,
// kept in Documents/AuthorHub so it survives reinstalls and can be copied to
// another machine. Everything the app stores in localStorage is mirrored here.
fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| format!("Couldn't find the Documents folder: {e}"))?;
    let dir = docs.join("AuthorHub");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("authorhub-data.json"))
}

// Read the saved data file. Returns an empty string when it doesn't exist yet
// (first run) so the frontend just starts fresh.
#[tauri::command]
fn load_store(app: tauri::AppHandle) -> Result<String, String> {
    let path = store_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok(String::new()),
    }
}

// Write the whole store atomically (write to a temp file, then rename) so a
// crash mid-write can't corrupt the user's projects.
#[tauri::command]
fn save_store(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            ollama_models,
            ollama_chat,
            fish_tts,
            load_store,
            save_store
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
