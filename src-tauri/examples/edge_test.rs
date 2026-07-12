// Throwaway verification: hit the real Edge TTS service and report how many
// audio bytes come back. Run with:  cargo run --example edge_test
fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    let result = rt.block_on(authorhub_lib::edge_synthesize(
        "Hello from AuthorHub. This is the Edge voice test.",
        "en-AU-WilliamNeural",
    ));
    match result {
        Ok(audio) => {
            let mp3 = audio.len() >= 3 && &audio[0..2] == b"\xff\xf3" || (audio.len() >= 3 && &audio[0..3] == b"ID3");
            println!("OK: {} audio bytes (looks like mp3: {})", audio.len(), mp3);
        }
        Err(e) => println!("ERR: {e}"),
    }
}
