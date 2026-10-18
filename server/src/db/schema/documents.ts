import { relations, sql } from "drizzle-orm";
import {
  customType,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** Postgres `bytea`, for the Yjs document state. */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** What someone may do with a document. */
export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to change a document. Everything else connects read-only. */
export const WRITE_ROLES: readonly Role[] = ["owner", "editor"];

export function canWrite(role: Role | null): boolean {
  return role !== null && WRITE_ROLES.includes(role);
}

export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default("Untitled"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The whole Yjs document, as a state update.
     *
     * Kept here rather than in a separate store because it is small for a
     * design file once images live in R2 instead of in the document, and
     * because a backup of the database is then a backup of the work.
     */
    state: bytea("state"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("document_owner_idx").on(table.ownerId)],
);

/**
 * Who may open a document, and as what.
 *
 * The owner also gets a row, so permission is answered by one lookup rather
 * than "a membership, or else the owner column".
 */
export const membership = pgTable(
  "membership",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.userId] }),
    index("membership_user_idx").on(table.userId),
  ],
);

/**
 * A link that opens a document without signing in.
 *
 * Deliberately unlike the peer-to-peer ticket, which is a bearer capability
 * that cannot be withdrawn once shared. This one is a row: revoking it is an
 * update, and the server checks it on every connection.
 *
 * View-only for now — `role` exists so an editor link is a value rather than a
 * schema change, but nothing issues one yet.
 */
export const shareLink = pgTable(
  "share_link",
  {
    /** The secret in the URL. Random, and the only thing the holder needs. */
    token: text("token").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("viewer"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Null means it does not expire on its own. */
    expiresAt: timestamp("expires_at"),
    /** Set once; a revoked link is kept so it can be shown as revoked. */
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("share_link_document_idx").on(table.documentId),
    // One live link per document per role keeps the share UI a single
    // copyable value instead of a list that grows every time it is opened.
    uniqueIndex("share_link_live_idx")
      .on(table.documentId, table.role)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export const documentRelations = relations(document, ({ one, many }) => ({
  owner: one(user, { fields: [document.ownerId], references: [user.id] }),
  memberships: many(membership),
  shareLinks: many(shareLink),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  document: one(document, {
    fields: [membership.documentId],
    references: [document.id],
  }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

export const shareLinkRelations = relations(shareLink, ({ one }) => ({
  document: one(document, {
    fields: [shareLink.documentId],
    references: [document.id],
  }),
}));
