# Contributing to Atelier

Thanks for your interest in contributing! This document explains how the codebase is put together and what a good pull request looks like.

## Development setup

Requirements: Node.js 22+ (and Rust, only if you want to run the desktop app).

```bash
npm ci
npm run dev        # Vite dev server (browser)
npm run lint       # ESLint — must pass
npm run build      # TypeScript check + production build — must pass
npm run tauri:dev  # desktop app (requires Rust, see https://tauri.app/start/prerequisites/)
```

CI runs `npm run lint` and `npm run build` on every pull request; both must be green.

## Architecture overview

Atelier is a client-side SPA with **no backend**. All data is persisted to IndexedDB in the browser via Yjs.

**Stack:** React 19 + TypeScript + Vite + Tailwind CSS 4 + Konva.js (canvas) + Yjs (CRDT document model) + Zustand (UI state) + Tauri 2 (optional desktop shell).

**Routing** is hash-based, handled in `src/App.tsx`: `#/`, `#/project/:projectId`, `#/project/:projectId/page/:pageId`.

### Two state systems

The most important thing to understand before changing anything:

1. **Yjs documents** hold all shape/page data (the "document model"). Each project gets its own Yjs `Doc`, persisted to IndexedDB via `y-indexeddb`. Shapes are `Y.Map`s inside a `Y.Array` per page.
2. **Zustand stores** (`src/store/`) hold UI-only state: active tool, viewport/zoom, selection, panel visibility, pen tool state, theme, and the undo/redo wrapper around Yjs `UndoManager`.

Two hard rules follow from this:

- **All shape data mutations must go through Yjs transactions** (`doc.transact()`), which in practice means going through `src/document/operations.ts`. This preserves undo/redo and keeps the door open for real-time collaboration.
- **Never persist document data in Zustand** — Zustand is for ephemeral UI state only.

### Directory map

| Path | Purpose |
|---|---|
| `src/document/` | Yjs document model: `DocumentProvider` context, hooks (`useDocument`, `useShapes`), and all shape mutations in `operations.ts` |
| `src/canvas/` | Konva rendering: `ShapeRenderer.tsx` maps shape types to components in `canvas/shapes/`; selection, inline text editing, pen overlay, and context menus layer on top |
| `src/store/` | Zustand stores for UI state |
| `src/panels/` | TopBar, Toolbar, LayersPanel, PropertiesPanel, PageTabs, ZoomControls |
| `src/operations/` | Boolean ops (Paper.js) and text-to-outlines (opentype.js) |
| `src/projects/` | Project CRUD + IndexedDB persistence (`projectPersistence.ts`); project metadata in the `atelier` DB, document data in per-project DBs |
| `src/collab/` | Peer-to-peer sync: the Yjs wire protocol (`yjsProtocol.ts`) and the two transports that carry it, `BroadcastChannelProvider` (tabs) and `IrohProvider` (desktop, network) |
| `src/fonts/` | Font detection (Tauri native → Local Font Access API → canvas probing) and Google Fonts loading |
| `src/utils/` | Export (SVG/PNG/PDF), color conversion incl. CMYK emulation |
| `src-tauri/` | Tauri desktop shell: system font enumeration and font file reading (`src/lib.rs`), the iroh transport (`src/collab.rs`), auto-updater config |
| `landing/` | Static landing page |

**Shape types** (Rectangle, Ellipse, Line, Path, Text, Image, Frame, Group) are defined in `src/types/document.ts`.

IDs are generated with `nanoid`.

### Desktop (Tauri) specifics

The webview runs the same build as the browser app; `src/utils/isTauri.ts` gates desktop-only paths. The Rust side (`src-tauri/src/lib.rs`) exposes five commands — `list_system_fonts`, `read_font_file`, and `collab_start` / `collab_send` / `collab_stop` — plus the updater/process plugins. Keep the IPC surface minimal: new commands widen the attack surface of the app and need a clear justification. The webview CSP is configured in `src-tauri/tauri.conf.json`; if you add a feature that talks to a new origin, the CSP must be updated deliberately, not loosened wholesale.

### Collaboration

One Yjs wire protocol, two transports. `src/collab/yjsProtocol.ts` owns the
framing (a leading byte selecting sync or awareness, then a y-protocols
payload); `BroadcastChannelProvider` carries it between tabs, `IrohProvider`
carries it between machines. Add a transport by encoding and applying frames
through that module — do not re-implement the protocol.

The Rust side (`src-tauri/src/collab.rs`) is deliberately a **pure byte pipe**.
It hashes the document id into a gossip topic, discovers peers over mDNS, and
moves opaque frames between the webview and the network. It does not know what
Yjs is and does not link `yrs`, so the protocol has exactly one implementation
and only JavaScript can be wrong about it.

Because gossip is best-effort — frames can drop, and a peer joining late has
missed everything before it arrived — `IrohProvider` re-offers its state vector
every 5 seconds. The Yjs exchange is idempotent, so that repair costs nothing
when replicas already agree.

Remote updates are applied with the provider object as the transaction origin.
That is what keeps a peer's edits off your undo stack, and it is why the
`UndoManager` tracks only the `'local'` origin. Any new transport must do the
same.

Note the trust model in `src/collab/ticket.ts`: a ticket is a bearer
capability. Holding it is permission to edit, there is no revocation, and iroh
authenticates *who* a peer is without saying what they may do.

## Releasing a new version

`src-tauri/tauri.conf.json` is the **single source of truth** for the version — Vite reads it at startup and injects it as `__APP_VERSION__`, which is shown in the projects-view footer and in Settings. To cut a release:

1. Bump `version` in `src-tauri/tauri.conf.json`, `package.json`, and `src-tauri/Cargo.toml` (keep all three identical).
2. Refresh the lockfiles: `npm install --package-lock-only` and `cargo update -p atelier --offline` (from `src-tauri/`).
3. Restart the dev server if it's running — `__APP_VERSION__` is baked in at server start, so the footer keeps showing the old number until you do.
4. Commit, then tag `vX.Y.Z` and push the tag. The release workflow builds and publishes the signed macOS bundles.

## Pull request guidelines

- Keep PRs focused — one feature or fix per PR.
- `npm run lint` and `npm run build` must pass.
- Shape-data changes must go through Yjs transactions (see above) and behave correctly with undo/redo.
- If you change rendering, include a before/after screenshot in the PR description.
- There is no test framework configured yet; if you'd like to introduce one, open an issue to discuss the approach first.

## Reporting security issues

If you find a security vulnerability, please do not open a public issue — email the address on the maintainer's GitHub profile instead.
