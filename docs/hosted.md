# The hosted version

Atelier is a local-first design tool: it runs in a browser or as a desktop app,
stores work on your machine, and needs no account. That does not change.

This document describes the *hosted* version — a paid service that adds
accounts, documents that live on a server, and collaboration with people who
are not on your network. It is built from the same code in this repository,
under the same [AGPL licence](../LICENSE).

## Why it exists, and what it is allowed to change

The free app's promise is that your work stays on your machine. The hosted
version cannot quietly erode that, so the two are kept separate:

- **Signed out**, the app behaves exactly as it does today. Projects live in
  IndexedDB and nothing leaves the browser.
- **Signed in**, you additionally get *cloud projects*. They are a different
  list, visibly so.
- A local project reaches the cloud only when you explicitly push it there.
  Nothing is uploaded because you signed in.

Peer-to-peer collaboration on the desktop stays. It is the thing nobody else
offers: two machines editing the same document with the internet unplugged.
The hosted version is not a replacement for it but the answer to a different
question — working with someone who is not in the room, with accounts and
access you can revoke.

## Shape

One origin, one container, one Postgres. The editor is a Vite SPA; the server
is a small Node process that serves it, authenticates, and relays document
updates.

```
browser ──────────────── atelier.glauser.com (Cloudflare, proxied)
                                  │
                                  ▼
                         Coolify ▸ one container
                         ┌──────────────────────┐
   GET  /                │ Hono                 │  serves the built SPA
   POST /api/auth/*      │  ├ Better Auth       │  email code + Google
   GET  /api/documents   │  ├ REST              │  lists, roles, share links
   POST /api/uploads     │  ├ R2 presign        │  images go straight to R2
   WS   /sync/:docId     │  └ Hocuspocus        │  Yjs sync, server-enforced
                         └──────────┬───────────┘
                                    ▼
                               Postgres 18
```

**One origin on purpose.** Serving the SPA and the API from the same host means
no CORS and no cross-site cookie problems, which is most of the usual pain of
putting auth in front of a single-page app.

## Why these pieces

**Hocuspocus** for sync. The client already speaks the standard `y-protocols`
wire format — `src/collab/yjsProtocol.ts` frames message type `0` for sync and
`1` for awareness, which is exactly what `y-websocket` and Hocuspocus speak. So
the server is not a translation layer, and the client needs only a third
transport beside the two it has. Hocuspocus adds what a hand-rolled relay would
otherwise have to grow: an `onAuthenticate` hook, genuinely read-only
connections, debounced persistence, and a Postgres extension. MIT licensed.

**A third transport, not a rewrite.** `src/collab/` is deliberately "one
protocol, several transports": `BroadcastChannelProvider` (tabs),
`IrohProvider` (peer-to-peer desktop), and now a `WebSocketProvider`. Each moves
opaque frames; none of them knows what a shape is.

**Hono** rather than Next.js. The project's infrastructure standard is a
Next.js starter, and this is a documented exception: the editor is a Konva
canvas app that has no use for server rendering, and porting it would be weeks
of churn for nothing. Hono is a few hundred kilobytes, runs the same Node
server as the WebSocket endpoint, and Better Auth supports it directly.

## Access

Three tables beyond what Better Auth creates.

| Table        | What it holds                                                   |
| ------------ | --------------------------------------------------------------- |
| `document`   | id, owner, title, timestamps, the Yjs state                      |
| `membership` | user × document × role (`owner` \| `editor` \| `viewer`)         |
| `share_link` | token, document, role, created_by, `expires_at`, `revoked_at`    |

**A share link is view-only and revocable.** This is the central difference
from the peer-to-peer ticket, which is a bearer capability that cannot be taken
back. Here, opening a link gets you a read-only connection without signing in;
to edit you sign in and someone gives you a role.

**Read-only is enforced on the server, not in the UI.** A viewer's connection
rejects document updates. Hiding the toolbar is a courtesy; refusing the write
is the actual boundary. Anything else is a lock on a door with no frame.

## Images must stop living in the document

`ImageShape.src` is currently a data URL, filled by `FileReader.readAsDataURL`.
A 3 MB screenshot becomes roughly 4 MB of base64 *inside the CRDT*: replicated
to every peer, written to Postgres on every save, held in server memory, and
kept in document history after the image is deleted.

That is survivable when a document only ever lives on one machine. It is not
survivable on a shared server.

Hosted documents upload images to R2 (browser → presigned `PUT`, per the
infrastructure rules) and store the URL. `src` is a string either way, so local
documents keep working unchanged and no shape type changes. Existing documents
with embedded data URLs are migrated on upload.

## Local development

Project number `04`: app on `3004`, Postgres on `5404`.

```bash
cp .env.example .env     # fill in local values
docker compose up -d     # Postgres
npm run dev              # editor, Vite
npm run dev:server       # API + sync
```

With `SMTP_HOST` empty, sign-in codes print to the terminal rather than being
sent. Stripe is not wired up yet; when it is, test keys only.

## What is deliberately not in the first version

- **Teams and organisations.** Roles are per document. The schema has room for
  an owning organisation later, so adding it is a migration rather than a
  rewrite.
- **Billing.** The hosted version will be paid, but charging for something
  nobody has used yet is the wrong order. Plan state belongs on the user row
  when it arrives.
- **Cross-network peer-to-peer.** An iroh relay would let two desktop apps
  reach each other across the internet without this server. It is a separate
  question from hosting and is tracked with the peer-to-peer work.
