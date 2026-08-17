import * as Y from 'yjs'
import { generateId } from '../utils/id'

export function createDoc(): Y.Doc {
  return new Y.Doc()
}

/**
 * Fixed id for the auto-created first page. Deterministic on purpose: if two
 * peers each open the same empty document offline they both create a page,
 * and a shared id means their shapes land in the same `page:<id>:shapes`
 * array instead of two rival "Page 1"s. getPages() drops the duplicate entry.
 */
const DEFAULT_PAGE_ID = 'page-default'

export function ensureDefaultPage(doc: Y.Doc) {
  const pages = doc.getArray('pages')
  if (pages.length > 0) return

  doc.transact(() => {
    const pageId = DEFAULT_PAGE_ID
    const page = new Y.Map()
    page.set('id', pageId)
    page.set('name', 'Page 1')
    pages.push([page])
    doc.getArray(`page:${pageId}:shapes`)

    const meta = doc.getMap('meta')
    meta.set('version', 1)
    meta.set('createdAt', Date.now())
    meta.set('updatedAt', Date.now())
  })
}

/**
 * Stable identity for the document itself, stored inside it.
 *
 * The local `projectId` is a nanoid minted on whichever machine created the
 * project, so the same shared document has a different one on every peer — it
 * can name a local IndexedDB database but never a shared sync room. This id
 * travels with the content, so all peers agree on it.
 *
 * Written under the 'migration' origin: it is document identity, not an edit,
 * and must not sit on the undo stack.
 */
export function ensureDocId(doc: Y.Doc, preferred?: string): string {
  const meta = doc.getMap('meta')
  const existing = meta.get('docId')
  if (typeof existing === 'string' && existing.length > 0) return existing

  // `preferred` comes from a share ticket: adopting the sender's id is what
  // puts this replica in the same sync room as theirs.
  const docId = preferred && preferred.length > 0 ? preferred : generateId()
  doc.transact(() => meta.set('docId', docId), 'migration')
  return docId
}

/**
 * The document's own name.
 *
 * A project's name normally lives in `ProjectMeta`, which sits in a separate
 * non-CRDT database and is per-machine — so it never reaches a collaborator,
 * who would otherwise be left looking at "Shared project" forever. Keeping the
 * name in the document too is what lets both sides show the same title.
 *
 * Empty when the document has never carried one, which is every document
 * written before this existed.
 */
export function getDocName(doc: Y.Doc): string {
  const name = doc.getMap('meta').get('name')
  return typeof name === 'string' ? name : ''
}

/**
 * Written under the 'migration' origin for the same reason as the document id:
 * naming is not a canvas edit and has no business on the undo stack.
 */
export function setDocName(doc: Y.Doc, name: string) {
  const meta = doc.getMap('meta')
  if (meta.get('name') === name) return
  doc.transact(() => meta.set('name', name), 'migration')
}

export function getPages(doc: Y.Doc): Array<{ id: string; name: string }> {
  const pages = doc.getArray('pages')
  const result: Array<{ id: string; name: string }> = []
  const seen = new Set<string>()
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i) as Y.Map<string>
    const id = page.get('id') as string
    // Two peers creating the default page offline merge into two entries
    // sharing one id — show it once.
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({ id, name: page.get('name') as string })
  }
  return result
}

export function addPage(doc: Y.Doc, name?: string): string {
  const pages = doc.getArray('pages')
  const pageId = generateId()
  doc.transact(() => {
    const page = new Y.Map()
    page.set('id', pageId)
    page.set('name', name || `Page ${pages.length + 1}`)
    pages.push([page])
    doc.getArray(`page:${pageId}:shapes`)
  }, 'local')
  return pageId
}

export function deletePage(doc: Y.Doc, pageId: string) {
  const pages = doc.getArray('pages')
  if (pages.length <= 1) return
  doc.transact(() => {
    for (let i = 0; i < pages.length; i++) {
      const page = pages.get(i) as Y.Map<string>
      if (page.get('id') === pageId) {
        pages.delete(i, 1)
        break
      }
    }
    // Yjs has no API to drop a shared type, but leaving the shapes behind
    // means they stay in the document — and in every sync payload — forever.
    // Emptying it is the closest we can get.
    const orphaned = doc.getArray(`page:${pageId}:shapes`)
    if (orphaned.length > 0) orphaned.delete(0, orphaned.length)
  }, 'local')
}

export function renamePage(doc: Y.Doc, pageId: string, name: string) {
  const pages = doc.getArray('pages')
  doc.transact(() => {
    for (let i = 0; i < pages.length; i++) {
      const page = pages.get(i) as Y.Map<string>
      if (page.get('id') === pageId) {
        page.set('name', name)
        break
      }
    }
  }, 'local')
}

export function getShapesArray(doc: Y.Doc, pageId: string): Y.Array<Y.Map<unknown>> {
  return doc.getArray(`page:${pageId}:shapes`)
}
