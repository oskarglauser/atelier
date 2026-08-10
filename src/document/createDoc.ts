import * as Y from 'yjs'
import { generateId } from '../utils/id'

export function createDoc(): Y.Doc {
  return new Y.Doc()
}

export function ensureDefaultPage(doc: Y.Doc) {
  const pages = doc.getArray('pages')
  if (pages.length > 0) return

  doc.transact(() => {
    const pageId = generateId()
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

export function getPages(doc: Y.Doc): Array<{ id: string; name: string }> {
  const pages = doc.getArray('pages')
  const result: Array<{ id: string; name: string }> = []
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i) as Y.Map<string>
    result.push({ id: page.get('id') as string, name: page.get('name') as string })
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
