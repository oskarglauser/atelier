import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { document, membership, shareLink, type Role } from "../db/schema/documents.js";

/**
 * How someone came to be allowed into a document, and what they may do.
 *
 * `role` is what the server enforces. `via` is only for telling the client
 * why, so the UI can explain "you are viewing a shared link" rather than
 * silently disabling half the toolbar.
 */
export interface Access {
  role: Role;
  via: "membership" | "share-link";
  documentId: string;
}

/** The role a signed-in user holds on a document, or null. */
export async function roleForUser(
  documentId: string,
  userId: string,
): Promise<Role | null> {
  const rows = await getDb()
    .select({ role: membership.role })
    .from(membership)
    .where(
      and(eq(membership.documentId, documentId), eq(membership.userId, userId)),
    )
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * The role a share token grants, or null when it does not grant one.
 *
 * Null covers every failure the same way — unknown, revoked, expired, or for
 * a document that no longer exists — because telling them apart would let
 * someone probe which tokens once existed.
 */
export async function roleForShareToken(token: string): Promise<Access | null> {
  const rows = await getDb()
    .select({ documentId: shareLink.documentId, role: shareLink.role })
    .from(shareLink)
    .innerJoin(document, eq(document.id, shareLink.documentId))
    .where(
      and(
        eq(shareLink.token, token),
        isNull(shareLink.revokedAt),
        or(isNull(shareLink.expiresAt), gt(shareLink.expiresAt, new Date())),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { role: row.role, via: "share-link", documentId: row.documentId };
}

/**
 * Resolve what this connection may do with this document.
 *
 * A signed-in user's own role wins over a share link they happen to be
 * holding, so following a view-only link to a document you can edit does not
 * downgrade you.
 */
export async function resolveAccess(
  documentId: string,
  userId: string | null,
  shareToken: string | null,
): Promise<Access | null> {
  if (userId) {
    const role = await roleForUser(documentId, userId);
    if (role) return { role, via: "membership", documentId };
  }

  if (shareToken) {
    const access = await roleForShareToken(shareToken);
    // A token is bound to one document; holding one for a different document
    // says nothing about this one.
    if (access && access.documentId === documentId) return access;
  }

  return null;
}
