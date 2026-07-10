// Ensures the bundled Whisper voice-input assets exist before dev/build.
// Runs automatically via the `predev` / `prebuild` npm hooks, so `npm run dev`,
// `npm run tauri dev`, and `npm run tauri build` all self-provision.
//
// It does two things, and skips whatever is already present (idempotent):
//   1. copies the ONNX-runtime .wasm files from node_modules into public/ort
//   2. downloads the multilingual whisper-base model into public/models
//
// The model files are git-ignored (~75MB) so they don't bloat the repo; this
// script fetches them once on a build machine. They then get bundled into the
// installer, so the packaged app needs no network and no Python/ffmpeg.

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_ID = "Xenova/whisper-base";
const BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const MODEL_FILES = [
  "config.json",
  "generation_config.json",
  "preprocessor_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

function ok(path) {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

function copyWasm() {
  const src = join(root, "node_modules", "@xenova", "transformers", "dist");
  const dest = join(root, "public", "ort");
  if (!existsSync(src)) {
    console.warn("[whisper] transformers.js not installed yet — skipping wasm copy.");
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src).filter((f) => f.endsWith(".wasm"))) {
    const to = join(dest, f);
    if (!ok(to)) copyFileSync(join(src, f), to);
  }
}

async function downloadModel() {
  const modelDir = join(root, "public", "models", ...MODEL_ID.split("/"));
  mkdirSync(join(modelDir, "onnx"), { recursive: true });
  for (const rel of MODEL_FILES) {
    const dest = join(modelDir, ...rel.split("/"));
    if (ok(dest)) continue;
    console.log(`[whisper] downloading ${rel} …`);
    const res = await fetch(`${BASE}/${rel}`);
    if (!res.ok) throw new Error(`Failed to fetch ${rel}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
  }
}

copyWasm();
await downloadModel();
console.log("[whisper] voice-input assets ready.");
