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
- `npm test` — Vitest (`npm run test:watch` to watch). Runs in CI.

## Architecture

**Stack:** React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Konva.js (canvas) + Yjs (CRDT) + Zustand (state)

**Routing:** Hash-based client-side routing in `App.tsx` — `#/`, `#/project/:projectId`, `#/project/:projectId/page/:pageId`

**State management** uses two complementary systems:
- **Yjs documents** for all shape/page data (the "document model"). Each project gets a Yjs Doc persisted to IndexedDB. Shapes are stored as `Y.Map` inside `Y.Array` per page.
- **Zustand stores** (`src/store/`) for UI-only state: tool selection, viewport/zoom, selection, panel visibility, pen tool state, theme, undo/redo history (wraps Yjs UndoManager).

**Document model** (`src/document/`): `DocumentProvider` context gives components access to the active Yjs doc, pages, and shapes via hooks (`useDocument`, `useShapes`). Shape mutations go through `src/document/operations.ts` which transacts against Yjs. Hierarchy logic (ancestor/descendant walks, cycle guards, and the single frame-containment rule used by creation, drag reparenting, paste, and the layers panel) lives in `src/document/hierarchy.ts` — always use these helpers instead of ad-hoc `parentId` walks. Reparenting and z-order moves go through `moveShapes` in operations.ts.

**Canvas rendering** (`src/canvas/`): Uses Konva.js via `react-konva`. `ShapeRenderer.tsx` is the component factory that maps shape types to Konva components. Selection, inline text editing, pen tool overlay, and context menus are layered on top.

**Shape types:** Rectangle, Ellipse, Line, Path, Text, Image, Frame, Group — defined in `src/types/document.ts`.

**Panels** (`src/panels/`): TopBar, Toolbar, LayersPanel, PropertiesPanel, PageTabs, ZoomControls.

**Operations** (`src/operations/`): Boolean ops (union/subtract/intersect/exclude) via Paper.js, text-to-outlines via opentype.js.

**Projects** (`src/projects/`): Project CRUD with IndexedDB persistence in `projectPersistence.ts`. Project metadata stored in `atelier` DB; document data in per-project DBs.

**Collaboration** (`src/collab/`): One wire protocol, two transports. `yjsProtocol.ts` owns framing and is the only place the protocol is implemented — `BroadcastChannelProvider` (between tabs, all builds) and `IrohProvider` (between machines, desktop only) both go through it. `src-tauri/src/collab.rs` is a pure byte pipe that never parses Yjs. Remote updates must be applied with the provider object as transaction origin, which is what keeps them off the undo stack (`UndoManager` tracks only `'local'`).

## Key Patterns

- All shape data mutations must go through Yjs transactions (via `doc.transact()`) to preserve undo/redo and future collaboration support.
- Zustand stores are for ephemeral UI state only — never persist shape data in Zustand.
- IDs are generated with `nanoid`.

## Schema evolution

Documents are persisted forever and only ever contain the fields the build that
wrote them knew about — `shapeToYMap` writes the keys present on the object, so
a field added later is absent from older documents permanently. Two mechanisms
handle that; use the right one:

- **Adding a field → add a default, nothing else.** Put it in `baseDefaults` or
  `typeDefaults` (`src/document/schema.ts`). `normalizeShape` applies those on
  every read, so old documents come back complete. Do *not* add `?? fallback`
  guards at call sites — that pushes correctness onto whoever writes the next
  call site.
- **Anything defaults can't express → add a migration.** Renames, changed units,
  repurposed fields, structural repair. Append to `migrations` in
  `src/document/migrations.ts` and bump `CURRENT_SCHEMA_VERSION`. Migrations must
  be idempotent and run under the `'migration'` origin so they stay off the undo
  stack.

`yMapToStored` returns `StoredShape` (everything optional) rather than `Shape`.
That is deliberate: only `normalizeShape` produces a `Shape`, so the compiler
catches code that reads storage without normalizing. Don't cast around it.

Cover schema changes with a fixture in `src/document/__fixtures__/legacyDoc.ts`
— it builds documents holding only the fields a given era wrote, which is how
old-content regressions get caught before release.
