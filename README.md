# AuthorHub

Hi — I'm the assistant who lives inside AuthorHub. 👋

I'm a small, private office that runs entirely on your own laptop. My job is to help a writer who's also a life coach get through his day: keep his schedule and projects straight, catch seminar ideas before they float off, look after the business side of his book, and — when he just wants to think out loud — be a coach he can talk to. No cloud account, no sign-in, no one else reading over his shoulder.

Christos built me for his dad. That's the whole reason I exist, and it shapes how I'm made: I try to be genuinely useful without being one more complicated thing to learn.

## The one promise I keep

Everything stays on this machine.

Our conversations, the facts I remember about you, your tasks, your sales numbers, your half-formed ideas — all of it lives in local storage on your computer and never gets uploaded anywhere. My "brain" is [Ollama](https://ollama.com) running locally, so even when we chat, nothing leaves the room.

The single exception is honest and opt-in: if you switch on the higher-quality cloud voice (Fish Audio), the *text I'm about to speak* gets sent to their servers to be turned into audio. Leave that off and I'll use your computer's built-in offline voice instead. Your call, every time.

## What I can do

**Talk with you.** Ask me to plan your day, brainstorm a talk, or draft an idea — or just say *"remind me to call the publisher at 3pm"* and I'll actually add it. I can create tasks, projects, and seminar ideas, tick things off, and tidy up, all from plain conversation.

**Remember what matters.** Over time I hold on to durable facts about you — your book's launch window, the shape of an idea you keep circling back to — and I quietly keep them in mind so I get more personal, not more generic. You can see and edit every last thing I've remembered in Settings; nothing about my memory is a black box.

**Recall your history.** Every chat is saved so you can reopen it later. And when you ask *"what was my leadership retreat idea again?"* weeks after the fact, I search back through our old conversations and your project and seminar notes and answer from what we actually said — not a guess.

**Run the book business.** I keep a **Schedule** and **Projects** board, a **Seminars** idea board (I'll even draft an outline from your rough notes), a **Sales** dashboard with charts and CSV import, a **Marketing** studio that writes tweets, threads, posts, newsletters and more in your tone, and a **Media Kit** one-pager you can print or export as a press PDF.

**Nudge you.** When a task's time arrives while I'm open, I'll pop a native reminder so it doesn't slip past.

## What I'm made of

- **Tauri v2** (a light Rust shell) + **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS v4** with shadcn-style components and lucide icons
- **Ollama** for the local AI — default model `qwen3.5:4b`, and I auto-detect whatever models you have installed
- Data currently lives in local storage, with a move to **SQLite** planned

Tauri instead of Electron on purpose: it keeps me lightweight, because Ollama is already doing the heavy lifting alongside me on a normal laptop.

## Waking me up

You'll need [Node.js](https://nodejs.org), the [Rust toolchain](https://www.rust-lang.org/tools/install), and [Ollama](https://ollama.com) installed, with at least one model pulled (e.g. `ollama pull qwen3.5:4b`).

```bash
npm install
npm run tauri dev     # run me as a desktop app (the first launch compiles Rust — give it a few minutes)
```

Other ways to run me:

```bash
npm run dev           # just my front-end, in a browser tab
npm run build         # type-check + production build
npm run tauri build   # package me into a desktop installer
```

## Where I'm headed

- **Phase 0 — Scaffold** ✅ App shell, navigation, routing, themed pages
- **Phase 1 — Daily organizer** ✅ Schedule + Projects (always-on tray reminders still to come)
- **Phase 2 — AI assistant** ✅ Local chat with a coaching persona, tool-use, Seminars, Settings
- **Phase 3 — Book business** ✅ Sales dashboard + AI marketing studio
- **Phase 4 — Media kit** ✅ Printable press one-pager
- **Session memory** ✅ Saved chat history + recall across chats and notes
- **Next** Fuzzier recall via local embeddings, proactive dashboard nudges, and eventually reminders delivered to Discord

That's me. Built local, built personal, built to stay out of the way until you need me.
