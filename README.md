# Atelier

**A local-first vector design tool for brand design, moodboards, and graphic design.**

Atelier is a focused workspace for sketching ideas, drawing vector marks, building moodboards, and putting together identity systems. It runs in your browser or as a native desktop app. There is no subscription or account, and your projects stay on your machine.

**[Try it in your browser →](https://atelier-glauser.vercel.app)**. No install or account required.

![Atelier screenshot](docs/screenshot.png)

## Highlights

- **Vector tools:** A pen tool, freehand drawing, path editing, and boolean operations for union, subtract, intersect, and exclude.
- **CMYK soft proofing:** Preview how colors and images may behave in print.
- **Typography:** Use installed system fonts, browse Google Fonts, and convert text to editable outlines. WOFF2 fonts are decoded locally in the browser.
- **Frames, groups, and layers:** Nest frames, clip their contents, move grouped objects together, and reorder layers with drag and drop.
- **Object arrangement:** Align selected objects by their edges or centers and distribute spacing evenly.
- **Gradients and fills:** Create linear gradients and add an optional noise texture.
- **Export:** Save work as SVG, PNG, JPG, EPS, or PDF. You can also copy artwork as PNG, SVG, or code.
- **Local storage:** Projects are stored in IndexedDB using [Yjs](https://yjs.dev). Atelier has no backend, telemetry, or account system.
- **Multi-page projects:** Work across multiple pages with undo and redo history.
- **Keyboard workflow:** Use familiar design-tool shortcuts and open the built-in shortcut guide at any time.
- **Workspace preferences:** Choose a light, dark, or system theme and save your grid, snapping, ruler, color mode, and export settings.
- **Desktop builds:** Download native packages for macOS, Windows, or Linux.

## What's new in 0.10.0

- Masks: select shapes and choose "Use as mask" — the bottom shape clips the ones above it, non-destructively, Figma-style.
- Compound paths: merge shapes into one path with even-odd holes, and release them back apart.
- Expand stroke converts any stroked shape into filled outlines.
- Offset path creates a grown or shrunk copy of a shape at any distance.

## Getting started

### Run in the browser

```bash
npm ci
npm run dev
```

Open the localhost URL printed in the terminal. Run `npm run build` to create a production build in `dist/`.

### Run as a desktop app

The desktop app is built with [Tauri](https://tauri.app). It adds native system font access and automatic updates. You will need [Rust](https://rustup.rs) and the platform prerequisites listed in the [Tauri docs](https://tauri.app/start/prerequisites/).

```bash
npm ci
npm run tauri:dev     # develop
npm run tauri:build   # produce a distributable bundle
```

Desktop builds for macOS, Windows, and Linux are published on the [releases page](https://github.com/oskarglauser/atelier/releases). Windows releases use an NSIS installer, while Linux releases include DEB and AppImage packages.

### Opening the macOS build

The macOS builds are not currently signed and notarized with an Apple Developer ID. Because of this, macOS may say that Apple cannot verify Atelier or check it for malicious software.

If you downloaded Atelier from the official releases page and trust the source, try to open it once, then open **System Settings → Privacy & Security**. Scroll down to the Security section, click **Open Anyway**, and confirm that you want to open Atelier. Apple documents this process in [Safely open apps on your Mac](https://support.apple.com/en-us/102445).

Atelier's automatic-update files are cryptographically signed, but that signature does not replace Apple's Developer ID signing and notarization. Proper macOS signing is planned for a future release.

## Where your files live

Atelier does not use cloud storage. Project metadata and document data are saved to IndexedDB in your browser or desktop app, with a separate database for each project. Use the export tools to save artwork outside Atelier.

## Privacy

Atelier connects to two external services:

- **Google Fonts:** Used when you browse or select a Google font.
- **GitHub:** The desktop app checks the releases feed for signed updates.

Nothing else. No analytics, no tracking.

## Roadmap

- Importing SVG and PDF files, with better round-trip export
- Reusable symbols, components, color styles, and typography styles
- Project snapshots, version history, and backup files
- Advanced vector editing such as offset paths, expanded strokes, masks, and compound paths
- Shared brand libraries for colors, typography, logos, and other assets
- Opening and saving selected Figma (`.fig`) and Illustrator (`.ai`) formats
- Real-time collaboration

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for an overview of the architecture and the contribution process.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Konva.js (canvas rendering) · Yjs (document model / undo / persistence) · Zustand (UI state) · Paper.js (boolean ops) · opentype.js + woff-lib (text to outlines) · Tauri 2 (desktop shell)

## License

[GPL-3.0](LICENSE) © Oskar Glauser

Atelier is free software: you can use, study, share, and improve it. If you distribute a modified version, it must remain open source under the same license.
