import * as Y from 'yjs'
import { getPages, getShapesArray } from './createDoc'
import { isContainer } from './hierarchy'
import { yMapToStored } from './operations'

/**
 * Schema version of documents this build writes. Bump when adding a migration.
 *
 * Additive fields do NOT need a migration — normalizeShape() fills those in on
 * read. Migrations are for changes defaults cannot express: renamed or
 * repurposed fields, changed units, and repairing structural invariants.
 */
export const CURRENT_SCHEMA_VERSION = 1

/** Documents written before versioning existed report this. */
const UNVERSIONED = 0

export interface Migration {
  /** Version this migration produces */
  version: number
  description: string
  /** Must be idempotent — a failed run is retried on next open */
  run: (doc: Y.Doc) => void
}

/**
 * Drop parent links that no longer resolve. A shape whose parentId points at a
 * deleted shape, at a non-container, or at itself becomes unreachable from the
 * root list while still claiming a parent, so it renders nowhere and cannot be
 * selected. Cycles are broken the same way.
 */
function repairParentLinks(doc: Y.Doc) {
  for (const page of getPages(doc)) {
    const shapesArr = getShapesArray(doc, page.id)
    const byId = new Map<string, ReturnType<typeof yMapToStored>>()
    const maps: Y.Map<unknown>[] = []

    for (let i = 0; i < shapesArr.length; i++) {
      const map = shapesArr.get(i) as Y.Map<unknown>
      maps.push(map)
      const stored = yMapToStored(map)
      if (stored.id) byId.set(stored.id, stored)
    }

    const parentOf = (id: string): string | null => {
      const p = byId.get(id)?.parentId
      return typeof p === 'string' && p.length > 0 ? p : null
    }

    /** Walks ancestors; null parent, a missing link, or a cycle all end it */
    const reachesCycle = (startId: string): boolean => {
      const seen = new Set<string>([startId])
      let cur = parentOf(startId)
      while (cur) {
        if (seen.has(cur)) return true
        seen.add(cur)
        cur = parentOf(cur)
      }
      return false
    }

    for (const map of maps) {
      const stored = yMapToStored(map)
      const parentId = stored.parentId
      if (typeof parentId !== 'string' || parentId.length === 0) continue

      const parent = byId.get(parentId)
      const broken =
        parentId === stored.id ||
        !parent ||
        !isContainer(parent as Parameters<typeof isContainer>[0]) ||
        reachesCycle(stored.id)

      if (broken) map.set('parentId', null)
    }
  }
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'Repair dangling, self-referencing and cyclic parent links',
    run: repairParentLinks,
  },
]

export function getSchemaVersion(doc: Y.Doc): number {
  const v = doc.getMap('meta').get('schemaVersion')
  return typeof v === 'number' ? v : UNVERSIONED
}

/**
 * Bring a document up to CURRENT_SCHEMA_VERSION. Safe to call on every open:
 * already-current documents do no work and write nothing.
 *
 * Runs untracked ('migration' origin) so it never lands on the undo stack —
 * the user cannot undo their way back into a broken schema.
 */
export function runMigrations(doc: Y.Doc): { from: number; to: number; applied: string[] } {
  const from = getSchemaVersion(doc)
  const pending = migrations.filter((m) => m.version > from).sort((a, b) => a.version - b.version)

  if (pending.length === 0) {
    // Stamp documents that are already structurally current but predate the
    // version marker, so later opens skip straight past.
    if (from < CURRENT_SCHEMA_VERSION) {
      doc.transact(() => doc.getMap('meta').set('schemaVersion', CURRENT_SCHEMA_VERSION), 'migration')
    }
    return { from, to: CURRENT_SCHEMA_VERSION, applied: [] }
  }

  doc.transact(() => {
    for (const m of pending) m.run(doc)
    doc.getMap('meta').set('schemaVersion', CURRENT_SCHEMA_VERSION)
  }, 'migration')

  return { from, to: CURRENT_SCHEMA_VERSION, applied: pending.map((m) => m.description) }
}
