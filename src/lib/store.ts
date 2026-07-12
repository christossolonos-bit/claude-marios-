// Durable, file-backed storage. All app data already lives in localStorage;
// this mirrors it to a single JSON file in Documents/AuthorHub (via Rust) so
// nothing is lost on reinstall and the file can be copied to another machine.
//
// On startup we load the file into localStorage (hydrate); after that, every
// localStorage write is mirrored back to the file (debounced). In the browser
// preview there's no Rust side, so this is a no-op and localStorage is used
// directly, exactly as before.

import { invoke } from "@tauri-apps/api/core";

const PREFIX = "authorhub.";
const SAVE_DEBOUNCE = 600;

function inTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== undefined
  );
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

// Collect every app key into one object and persist it to the file.
async function flush(): Promise<void> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  try {
    await invoke("save_store", { data: JSON.stringify(data) });
  } catch {
    // Best-effort — localStorage still holds the data this session.
  }
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flush();
  }, SAVE_DEBOUNCE);
}

// Wrap setItem/removeItem so any change to an app key mirrors to the file.
// Patching here (rather than editing every call site) means all existing
// storage code — settings, documents, decks, tasks, etc. — is covered.
function installMirror(): void {
  if (installed) return;
  installed = true;
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (key.startsWith(PREFIX)) scheduleSave();
  };
  localStorage.removeItem = (key: string) => {
    origRemove(key);
    if (key.startsWith(PREFIX)) scheduleSave();
  };
}

// Load the saved file into localStorage, then start mirroring writes back.
// Call once, before rendering the app. Safe to call in the browser (no-op).
export async function hydrateStore(): Promise<void> {
  if (!inTauri()) return;
  try {
    const raw = await invoke<string>("load_store");
    if (raw) {
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(PREFIX)) localStorage.setItem(key, value);
      }
    }
  } catch {
    // No file yet or unreadable — start fresh.
  }
  installMirror();
}
