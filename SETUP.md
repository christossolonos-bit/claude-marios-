# AuthorHub — Setup

AuthorHub runs its AI **entirely on your computer**. Nothing you write, record,
or store ever leaves the machine. Setup is a couple of small, free, one-time
installs. There's also a **Setup / Getting started** screen inside the app that
shows this same checklist with live status (green when each piece is ready).

## 1. Install AuthorHub

Run **`AuthorHub_0.1.0_x64-setup.exe`**.

The app is not code-signed, so Windows SmartScreen may warn: click
**More info → Run anyway**. It installs a desktop and Start Menu shortcut.

## 2. Install Ollama (the local AI engine)

1. Download it from <https://ollama.com/download> and install.
2. Leave it running — it sits quietly in the background (system tray).

The assistant talks to Ollama on this machine only.

## 3. Pull the AI model

Once Ollama is installed, open a terminal (PowerShell) and run:

```
ollama pull qwen3.5:4b
```

This downloads the model once (a few GB). That's the model the assistant uses
by default. You can pick a different installed model later in **Settings**.

## 4. (Optional) Voice input

The Assistant has a **microphone button** — speak instead of type, and it
transcribes locally with Whisper.

- The **first** time you use it, the app downloads a small speech model (~75MB)
  once. After that it works fully **offline**, and your audio never leaves the
  machine.
- Allow microphone access when the app asks.
- Handles both **Greek and English** automatically.

## That's it

Open AuthorHub. The **Setup** screen (rocket icon in the sidebar) confirms
Ollama is connected and the model is installed. When both are green, head to the
**Assistant** and start talking to your coach.

---

### For developers

- `npm install` then `npm run tauri dev` to run from source.
- `npm run tauri build` produces the installer under
  `src-tauri/target/release/bundle/`.
- The Whisper model is **not** bundled — it's fetched on first voice use and
  cached, keeping the installer small.
