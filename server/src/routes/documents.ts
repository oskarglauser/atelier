import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { document, membership, shareLink } from "../db/schema/documents.js";
import { getSession } from "../lib/auth.js";
import * as Y from "yjs";

/**
 * A new document that already knows its own name.
 *
 * The title is kept in the document as well as the row because the row is
 * only readable through the API, which someone opening a share link has no
 * access to — without this they would be looking at "Untitled" forever. It
 * is the same `meta.name` a local project uses, so both kinds of document
 * carry their title the same way.
 */
function initialState(title: string): Uint8Array {
  const doc = new Y.Doc();
  doc.transact(() => doc.getMap("meta").set("name", title), "migration");
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}

/** A share token: URL-safe, and long enough that guessing is not a strategy. */
function newToken() {
  return randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
}

const createBody = z.object({ title: z.string().trim().min(1).max(200).optional() });

/** Set by the guard below, so handlers get a typed user id. */
type Vars = { Variables: { userId: string } };

export const documents = new Hono<Vars>()
  /** Everything here needs a signed-in user; share links go through the socket. */
  .use("*", async (c, next) => {
    const session = await getSession(c.req.raw.headers);
    if (!session) return c.json({ error: "Not signed in" }, 401);
    c.set("userId", session.user.id);
    await next();
  })

  .get("/", async (c) => {
    const userId = c.get("userId");
    const rows = await getDb()
      .select({
        id: document.id,
        title: document.title,
        role: membership.role,
        updatedAt: document.updatedAt,
      })
      .from(membership)
      .innerJoin(document, eq(document.id, membership.documentId))
      .where(eq(membership.userId, userId))
      .orderBy(desc(document.updatedAt));
    return c.json({ documents: rows });
  })

  .post("/", async (c) => {
    const userId = c.get("userId");
    const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Invalid title" }, 400);

    const id = randomUUID();
    const db = getDb();
    // The owner gets a membership row like anyone else, so permission is one
    // lookup rather than a special case (see db/schema/documents.ts).
    await db.transaction(async (tx) => {
      const title = parsed.data.title ?? "Untitled";
      await tx.insert(document).values({
        id,
        title,
        ownerId: userId,
        state: initialState(title),
      });
      await tx.insert(membership).values({
        documentId: id,
        userId,
        role: "owner",
      });
    });
    return c.json({ id }, 201);
  })

  /** The current view-only link, creating one if there isn't a live one. */
  .post("/:id/share", async (c) => {
    const userId = c.get("userId");
    const documentId = c.req.param("id");

    const rows = await getDb()
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.documentId, documentId), eq(membership.userId, userId)))
      .limit(1);
    // Only an owner hands out access to a document.
    if (rows[0]?.role !== "owner") return c.json({ error: "Not allowed" }, 403);

    const token = newToken();
    const created = await getDb()
      .insert(shareLink)
      .values({ token, documentId, role: "viewer", createdBy: userId })
      // One live link per document per role, so the share dialog shows a
      // single value rather than a list that grows each time it is opened.
      .onConflictDoNothing()
      .returning({ token: shareLink.token });

    if (created[0]) return c.json({ token: created[0].token }, 201);

    // Only a live one. Without the revoked_at check this happily returns a
    // token that was revoked earlier — the server refuses it on connect, so
    // nothing is granted, but the owner is handed a link that silently does
    // not work.
    const existing = await getDb()
      .select({ token: shareLink.token })
      .from(shareLink)
      .where(
        and(
          eq(shareLink.documentId, documentId),
          eq(shareLink.role, "viewer"),
          isNull(shareLink.revokedAt),
        ),
      )
      .limit(1);
    return c.json({ token: existing[0]?.token });
  })

  /** Revoking is the thing a peer-to-peer ticket can never do. */
  .delete("/:id/share", async (c) => {
    const userId = c.get("userId");
    const documentId = c.req.param("id");

    const rows = await getDb()
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.documentId, documentId), eq(membership.userId, userId)))
      .limit(1);
    if (rows[0]?.role !== "owner") return c.json({ error: "Not allowed" }, 403);

    await getDb()
      .update(shareLink)
      .set({ revokedAt: new Date() })
      .where(and(eq(shareLink.documentId, documentId), eq(shareLink.role, "viewer")));
    return c.json({ ok: true });
  });
