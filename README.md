# AuthorHub

A local-first desktop app to help promote and sell a book, with a personalized AI life-coach assistant that runs fully offline.

Built for a writer who is also a life coach — it organizes his day and projects, captures seminar ideas, tracks book sales, generates marketing content, and (later) sends reminders to Discord.

## Stack

- **Tauri v2** (Rust shell) + **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS v4** with shadcn-style components (lucide icons)
- **SQLite** for local data (planned)
- **Ollama** for the local AI assistant — default model `qwen3.5:4b`

Chosen Tauri over Electron to keep the app lightweight, since Ollama runs alongside it on a normal laptop.

## Getting started

Prerequisites: Node.js, the Rust toolchain, and [Ollama](https://ollama.com) installed.

```bash
npm install
npm run tauri dev     # run the desktop app (first launch compiles Rust)
```

Other scripts:

```bash
npm run dev           # frontend only, in the browser
npm run build         # type-check + production build
npm run tauri build   # package the desktop app
```

## Roadmap

- **Phase 0 — Scaffold** ✅ App shell, sidebar navigation, routing, themed module pages
- **Phase 1 — Daily organizer** Schedule + Projects + local tray reminders
- **Phase 2 — AI assistant** Local Ollama chat with a life-coach persona, Seminars, Settings
- **Phase 3 — Book business** Sales dashboard + AI marketing content
- **Phase 4 — Media kit** Press kit / landing page + content calendar
- **Phase 5 — Discord DMs** Reminders delivered to Discord
