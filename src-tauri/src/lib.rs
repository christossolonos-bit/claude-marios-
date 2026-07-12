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

// Save an exported file (e.g. the Kindle .docx) into Documents/AuthorHub and
// return its full path. The webview can't trigger a real file download, so the
// frontend hands us the bytes (base64) and we write them to disk.
#[tauri::command]
fn save_export(
    app: tauri::AppHandle,
    filename: String,
    data: String,
) -> Result<String, String> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| format!("Couldn't find the Documents folder: {e}"))?;
    let dir = docs.join("AuthorHub");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe = filename.replace(['/', '\\'], "_");
    let path = dir.join(safe);
    let bytes = general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| e.to_string())?;
    fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// ---- Edge TTS (free Microsoft neural voices) --------------------------------
// Speaks text via the same online service as Edge's "Read Aloud". It's a
// WebSocket protocol that needs a time-based token (Sec-MS-GEC) and specific
// headers, so it runs here in Rust. Returns base64 MP3, like fish_tts. Used as
// a no-API-key cloud voice (handy while Fish Audio is unavailable).

const EDGE_TRUSTED_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// Kept in sync with the edge-tts library (currently Chromium 143); Microsoft
// rejects stale versions with a 403.
const EDGE_VERSION: &str = "143.0.3650.75";
const EDGE_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";

fn unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// Rolling auth token: SHA-256 of (Windows-epoch ticks rounded to 5 min) + token.
// `skew` corrects for a difference between this machine's clock and the server's
// (the server tells us via its Date header on a 403).
//
// IMPORTANT: the ticks×10^7 must be computed as an f64 (like edge-tts and real
// Edge browsers, which use JS/Python floats). That product (~10^17) exceeds
// f64's exact-integer range, so it rounds — and the server validates against
// that rounded value. Exact integer math produces a different number → 403.
fn edge_gec_token(skew: i64) -> String {
    use sha2::{Digest, Sha256};
    let secs = (unix_secs() + skew + 11_644_473_600) as f64; // seconds since 1601
    let rounded = secs - (secs % 300.0); // round down to 5 minutes
    let ticks = rounded * 1e7_f64; // 100-ns intervals, as a float (may round)
    let ticks_str = format!("{ticks:.0}");
    let hash = Sha256::digest(format!("{ticks_str}{EDGE_TRUSTED_TOKEN}").as_bytes());
    hash.iter().map(|b| format!("{b:02X}")).collect()
}

// Parse an HTTP Date header ("Sat, 12 Jul 2026 12:00:00 GMT") to a unix time.
fn parse_http_date(s: &str) -> Option<i64> {
    chrono::NaiveDateTime::parse_from_str(s.trim(), "%a, %d %b %Y %H:%M:%S GMT")
        .ok()
        .map(|dt| dt.and_utc().timestamp())
}

fn edge_timestamp() -> String {
    chrono::Utc::now()
        .format("%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)")
        .to_string()
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('\'', "&apos;")
        .replace('"', "&quot;")
}

#[tauri::command]
async fn edge_tts(text: String, voice: String) -> Result<String, String> {
    let audio = edge_synthesize(&text, &voice).await?;
    Ok(general_purpose::STANDARD.encode(&audio))
}

// The Edge TTS WebSocket exchange, returning raw MP3 bytes. Public so it can be
// exercised by an example/integration check without the Tauri layer.
pub async fn edge_synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;
    use tokio_tungstenite::tungstenite::{Error as WsError, Message};

    // Connect, correcting for clock skew. Microsoft rejects the time-based token
    // with a 403 if our clock differs from theirs; the 403 carries a Date header
    // we use to recompute the token and retry once.
    let mut skew: i64 = 0;
    let ws = loop {
        // Match the parameters edge-tts currently uses — Microsoft 403s stale
        // Chromium versions. Bump EDGE_VERSION when Edge TTS starts failing.
        let url = format!(
            "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken={}&Sec-MS-GEC={}&Sec-MS-GEC-Version=1-{}",
            EDGE_TRUSTED_TOKEN,
            edge_gec_token(skew),
            EDGE_VERSION
        );
        let mut request = url.into_client_request().map_err(|e| e.to_string())?;
        {
            let h = request.headers_mut();
            h.insert("Pragma", "no-cache".parse().unwrap());
            h.insert("Cache-Control", "no-cache".parse().unwrap());
            h.insert(
                "Origin",
                "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
                    .parse()
                    .unwrap(),
            );
            h.insert(
                "Accept-Encoding",
                "gzip, deflate, br, zstd".parse().unwrap(),
            );
            h.insert("Accept-Language", "en-US,en;q=0.9".parse().unwrap());
            h.insert("User-Agent", EDGE_USER_AGENT.parse().unwrap());
        }

        match tokio_tungstenite::connect_async(request).await {
            Ok((ws, _)) => break ws,
            // First 403: correct our clock from the server's Date header, retry.
            Err(WsError::Http(resp)) if skew == 0 => {
                let server = resp
                    .headers()
                    .get("date")
                    .and_then(|v| v.to_str().ok())
                    .and_then(parse_http_date);
                match server {
                    Some(server_secs) => {
                        skew = server_secs - unix_secs();
                        continue;
                    }
                    None => {
                        return Err(format!(
                            "Edge TTS connection failed: HTTP {}",
                            resp.status()
                        ))
                    }
                }
            }
            Err(e) => return Err(format!("Edge TTS connection failed: {e}")),
        }
    };
    let (mut write, mut read) = ws.split();

    let ts = edge_timestamp();
    let req_id: String = format!(
        "{:032x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );

    let config = format!(
        "X-Timestamp:{ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}"
    );
    write
        .send(Message::Text(config))
        .await
        .map_err(|e| e.to_string())?;

    let ssml = format!(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='{voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>{}</prosody></voice></speak>",
        xml_escape(&text)
    );
    let ssml_msg = format!(
        "X-RequestId:{req_id}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:{ts}\r\nPath:ssml\r\n\r\n{ssml}"
    );
    write
        .send(Message::Text(ssml_msg))
        .await
        .map_err(|e| e.to_string())?;

    let mut audio: Vec<u8> = Vec::new();
    while let Some(msg) = read.next().await {
        match msg.map_err(|e| e.to_string())? {
            Message::Binary(data) => {
                if data.len() < 2 {
                    continue;
                }
                let header_len = ((data[0] as usize) << 8) | (data[1] as usize);
                let start = 2 + header_len;
                if start <= data.len() {
                    audio.extend_from_slice(&data[start..]);
                }
            }
            Message::Text(t) => {
                if t.contains("Path:turn.end") {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    let _ = write.close().await;

    if audio.is_empty() {
        return Err("Edge TTS returned no audio".to_string());
    }
    Ok(audio)
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
            save_store,
            save_export,
            edge_tts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
