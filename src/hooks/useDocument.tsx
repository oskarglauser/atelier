import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { createDoc, ensureDefaultPage, getPages, getShapesArray } from '../document/createDoc'
import { migrateShapes } from '../document/operations'
import { createUndoManager } from '../document/undoManager'
import { useHistoryStore } from '../store/historyStore'
import { useProjectStore } from '../projects/projectStore'
import type { Page } from '../types/document'

interface DocumentContextValue {
  doc: Y.Doc
  pages: Page[]
  activePageId: string
  shapesArray: Y.Array<Y.Map<unknown>>
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const persistenceRef = useRef<IndexeddbPersistence | null>(null)
  const activePageId = useProjectStore((s) => s.activePageId)
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const setUndoManager = useHistoryStore((s) => s.setUndoManager)

  useEffect(() => {
    const newDoc = createDoc()
    const persistence = new IndexeddbPersistence(`atelier-project-${projectId}`, newDoc)
    persistenceRef.current = persistence

    persistence.once('synced', () => {
      ensureDefaultPage(newDoc)
      const docPages = getPages(newDoc)
      // Older documents predate the `order` field and stored text as a plain
      // string; bring them up to the current schema before anything renders.
      migrateShapes(newDoc, docPages.map((p) => p.id))
      setPages(docPages)
      if (docPages.length > 0 && !activePageId) {
        setActivePageId(docPages[0].id)
      }
      setDoc(newDoc)
    })

    const updatePages = () => {
      setPages(getPages(newDoc))
    }
    newDoc.getArray('pages').observeDeep(updatePages)

    return () => {
      newDoc.getArray('pages').unobserveDeep(updatePages)
      persistence.destroy()
      newDoc.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!doc || !activePageId) return
    const um = createUndoManager(doc, activePageId)
    setUndoManager(um)
    return () => um.destroy()
  }, [doc, activePageId, setUndoManager])

  if (!doc || !activePageId) {
    return <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>
  }

  // The active page can vanish under us (another peer deletes it, or a stale
  // id survives a reload). Fall back to the first real page rather than
  // silently creating an orphaned empty shapes array for a page that's gone.
  if (pages.length > 0 && !pages.some((p) => p.id === activePageId)) {
    setActivePageId(pages[0].id)
    return <div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>
  }

  const shapesArray = getShapesArray(doc, activePageId)

  return (
    <DocumentContext.Provider value={{ doc, pages, activePageId, shapesArray }}>
      {children}
    </DocumentContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- provider and hook are intentionally colocated
export function useDocument() {
  const ctx = useContext(DocumentContext)
  if (!ctx) throw new Error('useDocument must be used within DocumentProvider')
  return ctx
}
