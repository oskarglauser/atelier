# Atelier

**A local-first vector design tool for brand design, moodboards, and graphic design.**

Atelier fills the gap between Illustrator and Figma for brand designers: a fast, focused tool for sketching ideas, drawing vector marks, building moodboards, and assembling identity systems — without a subscription, an account, or a cloud. It runs in your browser or as a native desktop app, and everything you make is stored locally on your machine.

**[Try it in your browser →](https://atelier-glauser.vercel.app)** — no install, no account.

![Atelier screenshot](docs/screenshot.png)

## Highlights

- **Vector precision** — full pen tool, freehand drawing, boolean operations (union, subtract, intersect, exclude), and path editing.
- **CMYK soft-proofing** — preview how colors and images will behave in print, something browser-based design tools typically don't offer.
- **Typography** — use every font installed on your system (native enumeration in the desktop app, Local Font Access API in Chrome/Edge), browse Google Fonts, and convert WOFF2 web fonts to editable outlines across modern browsers.
- **Frames, groups & layers** — nested frames that clip and auto-include content, groups that move as one, drag-and-drop layer reordering.
- **Gradients & fills** — linear gradients with optional noise texture.
- **Export anywhere** — SVG, PNG, JPG, EPS, PDF, or copy as code.
- **Local-first** — projects are persisted to IndexedDB using [Yjs](https://yjs.dev) CRDTs. No backend, no telemetry, no account. Your work never leaves your machine.
- **Multi-page projects** with full undo/redo history.
- **Focused workspace** — light, dark, and system themes with persistent grid, snapping, ruler, color-mode, and export preferences.

## What's new in 0.5.0

- Google Fonts served as WOFF2 can now be decoded locally and converted to vector outlines in the browser.
- The settings screen now controls real canvas and export preferences; placeholder options were removed.
- Project cards, dialogs, menus, toolbars, themes, focus states, and pointer feedback received a minimal visual refinement.
- Outline conversion, empty text layers, and context-menu copy/paste behavior were hardened during a full interaction review.

## Getting started

### Run in the browser

```bash
npm ci
npm run dev
```

Then open the printed localhost URL. Production build: `npm run build` (output in `dist/`).

### Run as a desktop app

The desktop app is built with [Tauri](https://tauri.app) and adds native system-font access and auto-updates. You'll need [Rust](https://rustup.rs) and the platform prerequisites from the [Tauri docs](https://tauri.app/start/prerequisites/).

```bash
npm ci
npm run tauri:dev     # develop
npm run tauri:build   # produce a distributable bundle
```

Signed macOS builds are published on the [releases page](https://github.com/oskarglauser/atelier/releases).

## Where your files live

There is no cloud. Project metadata and document data are stored in your browser's (or the desktop app's) IndexedDB, with each project in its own database. Use the export options (SVG/PNG/PDF) to get artwork out. Because the document model is already CRDT-based (Yjs), real-time collaboration is a natural future extension.

## Privacy

Atelier talks to exactly two external services:

- **Google Fonts** — when you browse or use a Google font.
- **GitHub** — the desktop app checks the releases feed for signed updates.

Nothing else. No analytics, no tracking.

## Roadmap

- Opening and saving Figma (`.fig`) and Illustrator (`.ai`) files
- Windows and Linux desktop builds
- Real-time collaboration

Contributions toward any of these are very welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture overview and how to get a change merged.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Konva.js (canvas rendering) · Yjs (document model / undo / persistence) · Zustand (UI state) · Paper.js (boolean ops) · opentype.js + woff-lib (text to outlines) · Tauri 2 (desktop shell)

## License

[GPL-3.0](LICENSE) © Oskar Glauser

Atelier is free software: you can use, study, share, and improve it. If you distribute a modified version, it must remain open source under the same license.
