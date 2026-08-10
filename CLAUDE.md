# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Atelier?

Atelier is a browser-based vector design tool (similar to Figma) built as a client-side SPA. There is no backend — all data is persisted to IndexedDB in the browser using Yjs CRDTs.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — TypeScript check + Vite production build (`tsc -b && vite build`)
- `npm run lint` — ESLint
- `npm run preview` — Preview production build
- `npm run tauri:dev` — Run the desktop app in dev mode (requires Rust)
- `npm run tauri:build` — Build the desktop app bundle
- No test framework is configured

## Architecture

**Stack:** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Konva.js (canvas) + Yjs (CRDT) + Zustand (state)

**Routing:** Hash-based client-side routing in `App.tsx` — `#/`, `#/project/:projectId`, `#/project/:projectId/page/:pageId`

**State management** uses two complementary systems:
- **Yjs documents** for all shape/page data (the "document model"). Each project gets a Yjs Doc persisted to IndexedDB. Shapes are stored as `Y.Map` inside `Y.Array` per page.
- **Zustand stores** (`src/store/`) for UI-only state: tool selection, viewport/zoom, selection, panel visibility, pen tool state, theme, undo/redo history (wraps Yjs UndoManager).

**Document model** (`src/document/`): `DocumentProvider` context gives components access to the active Yjs doc, pages, and shapes via hooks (`useDocument`, `useShapes`). Shape mutations go through `src/document/operations.ts` which transacts against Yjs.

**Canvas rendering** (`src/canvas/`): Uses Konva.js via `react-konva`. `ShapeRenderer.tsx` is the component factory that maps shape types to Konva components. Selection, inline text editing, pen tool overlay, and context menus are layered on top.

**Shape types:** Rectangle, Ellipse, Line, Path, Text, Image, Frame, Group — defined in `src/types/document.ts`.

**Panels** (`src/panels/`): TopBar, Toolbar, LayersPanel, PropertiesPanel, PageTabs, ZoomControls.

**Operations** (`src/operations/`): Boolean ops (union/subtract/intersect/exclude) via Paper.js, text-to-outlines via opentype.js.

**Projects** (`src/projects/`): Project CRUD with IndexedDB persistence in `projectPersistence.ts`. Project metadata stored in `atelier` DB; document data in per-project DBs.

## Key Patterns

- All shape data mutations must go through Yjs transactions (via `doc.transact()`) to preserve undo/redo and future collaboration support.
- Zustand stores are for ephemeral UI state only — never persist shape data in Zustand.
- IDs are generated with `nanoid`.
