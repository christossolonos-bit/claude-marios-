use serde_json::{json, Value};

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

#[tauri::command]
async fn ollama_chat(model: String, messages: Value) -> Result<String, String> {
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "think": false,
    });
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
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(v["message"]["content"].as_str().unwrap_or("").to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![ollama_models, ollama_chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
