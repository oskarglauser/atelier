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

## What's new in 0.6.0

- Multi-selections can now be aligned by their edges or centers and distributed with even horizontal or vertical spacing.
- Alignment tools are available in the properties panel and from a compact context-menu submenu.
- A broader set of Figma and Illustrator-style keyboard shortcuts covers tools, editing, type, arrangement, and zoom. Press `?` to see the full list in Atelier.
- Font, color, gradient, and context menus now reposition themselves to stay inside the window.
- The color mode control is smaller and easier to scan, and right-clicking no longer clears the current selection.
- Text converted to outlines keeps its visual settings and remains selected after conversion.

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

Signed macOS builds are published on the [releases page](https://github.com/oskarglauser/atelier/releases).

## Where your files live

Atelier does not use cloud storage. Project metadata and document data are saved to IndexedDB in your browser or desktop app, with a separate database for each project. Use the export tools to save artwork outside Atelier.

## Privacy

Atelier connects to two external services:

- **Google Fonts:** Used when you browse or select a Google font.
- **GitHub:** The desktop app checks the releases feed for signed updates.

Nothing else. No analytics, no tracking.

## Roadmap

- Opening and saving Figma (`.fig`) and Illustrator (`.ai`) files
- Windows and Linux desktop builds
- Real-time collaboration

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for an overview of the architecture and the contribution process.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Konva.js (canvas rendering) · Yjs (document model / undo / persistence) · Zustand (UI state) · Paper.js (boolean ops) · opentype.js + woff-lib (text to outlines) · Tauri 2 (desktop shell)

## License

[GPL-3.0](LICENSE) © Oskar Glauser

Atelier is free software: you can use, study, share, and improve it. If you distribute a modified version, it must remain open source under the same license.
