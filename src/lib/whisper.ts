// Local speech-to-text with Whisper, running inside the app via transformers.js
// (WebAssembly) — no Python, no ffmpeg, no external binary. To keep the
// installer small, the ~75MB model isn't bundled: it's downloaded once on the
// first voice use and then cached, so every later use is fully offline and the
// recorded audio itself never leaves the machine. Needs internet only that
// first time. Works the same in the browser preview and the desktop app.

import type { Pipeline } from "@xenova/transformers";

const MODEL_ID = "Xenova/whisper-base"; // multilingual — handles Greek + English

export type WhisperProgress = {
  status: string;
  file?: string;
  progress?: number;
};

let asrPromise: Promise<Pipeline> | null = null;
let configured = false;

// Import transformers.js on demand (it's ~1.4MB) so app startup stays light —
// the library only loads the first time voice input is used.
async function getPipelineFactory() {
  const tf = await import("@xenova/transformers");
  if (!configured) {
    // Fetch the model from the hub on first use; transformers.js caches it so
    // subsequent runs are offline.
    tf.env.allowLocalModels = false;
    tf.env.allowRemoteModels = true;
    tf.env.useBrowserCache = true;
    // Single-threaded runtime so we don't depend on SharedArrayBuffer /
    // cross-origin-isolation headers.
    tf.env.backends.onnx.wasm.numThreads = 1;
    configured = true;
  }
  return tf.pipeline;
}

// Lazily build (and cache) the speech-recognition pipeline. The first call
// parses the ~75MB model, so it takes a few seconds; later calls are instant.
export function loadWhisper(
  onProgress?: (p: WhisperProgress) => void,
): Promise<Pipeline> {
  if (!asrPromise) {
    asrPromise = getPipelineFactory()
      .then((pipeline) =>
        pipeline("automatic-speech-recognition", MODEL_ID, {
          quantized: true,
          progress_callback: onProgress,
        }),
      )
      .catch((e) => {
        // Let a later attempt retry instead of caching the failure forever.
        asrPromise = null;
        throw e;
      });
  }
  return asrPromise;
}

export function isWhisperLoaded(): boolean {
  return asrPromise !== null;
}

// Decode a recorded audio Blob into the 16kHz mono Float32 samples Whisper wants.
async function blobToPcm16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AC();
  const decoded = await decodeCtx.decodeAudioData(arrayBuf);
  await decodeCtx.close();

  const targetRate = 16000;
  const offline = new OfflineAudioContext(
    1,
    Math.max(1, Math.ceil(decoded.duration * targetRate)),
    targetRate,
  );
  const src = offline.createBufferSource();
  src.buffer = decoded; // multi-channel input is down-mixed to the mono destination
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// Transcribe recorded audio to text. Language is auto-detected, so the user can
// speak Greek or English freely.
export async function transcribe(
  blob: Blob,
  onProgress?: (p: WhisperProgress) => void,
): Promise<string> {
  const asr = await loadWhisper(onProgress);
  const audio = await blobToPcm16k(blob);
  const result = (await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { text?: string };
  return (result.text ?? "").trim();
}
