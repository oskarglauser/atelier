import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus } from "@hocuspocus/server";
import { eq } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { document, canWrite } from "./db/schema/documents.js";
import { resolveAccess } from "./lib/access.js";
import { getSession } from "./lib/auth.js";

/**
 * The document sync server.
 *
 * The editor already speaks the standard y-protocols wire format, so this is
 * a peer in the same conversation rather than a translation layer — the
 * difference is that this one is authoritative, persists, and decides who may
 * speak.
 */

/** Written to Postgres at most this often per document while it is being edited. */
const PERSIST_DEBOUNCE_MS = 2_000;
/** ...and at least this often, however continuous the editing is. */
const PERSIST_MAX_WAIT_MS = 10_000;

interface ConnectionContext {
  userId: string | null;
  role: string;
  via: string;
}

/**
 * `Hocuspocus` rather than its `Server` wrapper: the wrapper brings its own
 * HTTP server, and here the editor, the API and the socket all share one.
 */
export function createSyncServer() {
  return new Hocuspocus({
    name: "atelier",

    /**
     * Runs once per connection, before any document data flows.
     *
     * Deliberately `onConnect` rather than `onAuthenticate`: Hocuspocus only
     * runs the latter when the client sends it a token, and a signed-in user
     * arrives with a session cookie and nothing else. This hook runs for every
     * connection, which is what an access check has to do to be worth
     * anything.
     *
     * Throwing rejects the connection. The client is told only that it was
     * refused, which is all it needs and all we should say.
     */
    async onConnect({ documentName, requestHeaders, requestParameters, connectionConfig }) {
      const headers = new Headers();
      const cookie = requestHeaders.get("cookie");
      if (cookie) headers.set("cookie", cookie);

      const session = await getSession(headers);
      const userId = session?.user.id ?? null;
      // A share token travels in the query string, so one code path covers
      // both ways in rather than one per transport quirk.
      const token = requestParameters.get("token");

      const access = await resolveAccess(documentName, userId, token);
      if (!access) {
        console.log(`[sync] refused ${documentName}`);
        throw new Error("Not allowed to open this document");
      }

      // Hocuspocus enforces this: a read-only connection still receives
      // updates, but any it sends are discarded. Disabling the toolbar in the
      // client is a courtesy; this is the boundary.
      connectionConfig.readOnly = !canWrite(access.role);
      connectionConfig.isAuthenticated = true;

      return {
        context: {
          userId,
          role: access.role,
          via: access.via,
        } satisfies ConnectionContext,
      };
    },

    extensions: [
      new Database({
        async fetch({ documentName }) {
          const rows = await getDb()
            .select({ state: document.state })
            .from(document)
            .where(eq(document.id, documentName))
            .limit(1);
          return rows[0]?.state ?? null;
        },

        async store({ documentName, state }) {
          // Only ever an update to an existing row. A document is created
          // through the API, which is where ownership is established; a
          // connection that got this far already passed onAuthenticate.
          await getDb()
            .update(document)
            .set({ state, updatedAt: new Date() })
            .where(eq(document.id, documentName));
        },
      }),
    ],

    debounce: PERSIST_DEBOUNCE_MS,
    maxDebounce: PERSIST_MAX_WAIT_MS,
  });
}

export type SyncServer = ReturnType<typeof createSyncServer>;
