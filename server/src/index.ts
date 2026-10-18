import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingHttpHeaders } from "node:http";
import { WebSocketServer } from "ws";
import { runMigrations } from "./db/migrate.js";
import { getEnv } from "./env.js";
import { getAuth } from "./lib/auth.js";
import { documents } from "./routes/documents.js";
import { health } from "./routes/health.js";
import { createSyncServer } from "./sync.js";

// Fail before listening rather than on the first request that needs a
// variable nobody set.
const env = getEnv();

/** Where document sockets connect. Everything else is HTTP. */
const SYNC_PATH = "/sync";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The built editor, produced by `npm run build` at the repo root. */
const clientRoot = path.relative(
  process.cwd(),
  path.resolve(here, "../../dist"),
);

/**
 * Node's headers into Fetch headers. Node keeps repeated headers as an array
 * and Fetch wants them comma-joined, so this is not quite a cast.
 */
function toFetchHeaders(incoming: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

const app = new Hono();

app.route("/", health);

// Better Auth owns every method under this path.
app.all("/api/auth/*", (c) => getAuth().handler(c.req.raw));

app.route("/api/documents", documents);

// The editor is a single-page app. Real files are served as themselves and
// anything else falls through to index.html, so a cold load of a client-side
// route works. API and socket paths are matched before this.
app.use("/*", serveStatic({ root: clientRoot }));
app.get("*", serveStatic({ path: path.join(clientRoot, "index.html") }));

const sync = createSyncServer();
// `noServer`: the HTTP server owns the port, and hands over only the upgrades
// addressed to the sync path.
const sockets = new WebSocketServer({ noServer: true });

async function main() {
  // Migrate before listening, so the health check cannot pass against a
  // database the app is not actually ready to use.
  await runMigrations();

  const server = serve({ fetch: app.fetch, port: env.PORT }, () => {
    console.log(`[atelier] listening on ${env.PORT} (${env.APP_URL})`);
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", env.APP_URL);
    if (!url.pathname.startsWith(SYNC_PATH)) {
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      // Hocuspocus hands its own transport (crossws) a socket and then pumps
      // messages into the connection it gets back. Driving it from `ws`
      // directly means doing both halves — handing over the socket is not
      // enough on its own, and a connection that is never fed just hangs.
      const connection = sync.handleConnection(
        ws,
        new Request(url, { headers: toFetchHeaders(request.headers) }),
      );

      ws.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
        const bytes = Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as Buffer);
        connection.handleMessage(new Uint8Array(bytes));
      });
      ws.on("close", (code: number, reason: Buffer) => {
        connection.handleClose({ code, reason: reason.toString() });
      });
      // Keeps the connection from being judged idle and dropped.
      ws.on("pong", () => connection.touch());
    });
  });
}

main().catch((error) => {
  console.error("[atelier] failed to start:", error);
  process.exit(1);
});
