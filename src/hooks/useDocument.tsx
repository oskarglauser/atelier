import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import { createDoc, ensureDefaultPage, ensureDocId, getPages, getShapesArray } from '../document/createDoc'
import { createUndoManager } from '../document/undoManager'
import { runMigrations } from '../document/migrations'
import { useHistoryStore } from '../store/historyStore'
import { useIdentityStore } from '../store/identityStore'
import { useProjectStore } from '../projects/projectStore'
import { BroadcastChannelProvider } from '../collab/BroadcastChannelProvider'
import { IrohProvider, type IrohStatus } from '../collab/IrohProvider'
import { isTauri } from '../utils/isTauri'
import type { Awareness } from 'y-protocols/awareness'
import type { Page } from '../types/document'

interface DocumentContextValue {
  doc: Y.Doc
  pages: Page[]
  activePageId: string
  shapesArray: Y.Array<Y.Map<unknown>>
  /** Presence for this document — null until the document has loaded */
  awareness: Awareness | null
  /**
   * Identity of the document itself, shared by every peer holding a copy.
   * Unlike the local projectId this travels with the content, so it is what a
   * network transport would use to name the room.
   */
  docId: string
  /** Peer-to-peer transport status. Null in the browser, where it never runs. */
  collabStatus: IrohStatus | null
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [awareness, setAwareness] = useState<Awareness | null>(null)
  const [docId, setDocId] = useState<string>('')
  const [collabStatus, setCollabStatus] = useState<IrohStatus | null>(null)
  const irohRef = useRef<IrohProvider | null>(null)
  const persistenceRef = useRef<IndexeddbPersistence | null>(null)
  const activePageId = useProjectStore((s) => s.activePageId)
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const setUndoManager = useHistoryStore((s) => s.setUndoManager)

  useEffect(() => {
    const newDoc = createDoc()
    const persistence = new IndexeddbPersistence(`atelier-project-${projectId}`, newDoc)
    persistenceRef.current = persistence

    // Cross-tab sync and presence. Other transports (see the collaboration
    // plan) attach here the same way — the document model doesn't care which.
    const provider = new BroadcastChannelProvider(`atelier-project-${projectId}`, newDoc)
    const identity = useIdentityStore.getState()
    provider.awareness.setLocalStateField('user', {
      id: identity.id,
      name: identity.name,
      color: identity.color,
    })

    persistence.once('synced', () => {
      // Before anything reads the document: IndexedDB has replayed, so this is
      // the only point where the stored schema is known and still untouched.
      runMigrations(newDoc)
      ensureDefaultPage(newDoc)
      const meta = useProjectStore.getState().projects.find((p) => p.id === projectId)
      const resolvedDocId = ensureDocId(newDoc, meta?.joinDocId)
      setDocId(resolvedDocId)

      // Desktop only: peer-to-peer needs raw UDP for hole punching and mDNS
      // for local discovery, neither of which a browser can do.
      if (isTauri()) {
        irohRef.current = new IrohProvider(
          resolvedDocId,
          newDoc,
          provider.awareness,
          meta?.joinPeers ?? [],
          setCollabStatus
        )
      }

      const docPages = getPages(newDoc)
      setPages(docPages)
      if (docPages.length > 0 && !activePageId) {
        setActivePageId(docPages[0].id)
      }
      setAwareness(provider.awareness)
      setDoc(newDoc)
    })

    const updatePages = () => {
      setPages(getPages(newDoc))
    }
    newDoc.getArray('pages').observeDeep(updatePages)

    return () => {
      newDoc.getArray('pages').unobserveDeep(updatePages)
      void irohRef.current?.destroy()
      irohRef.current = null
      provider.destroy()
      persistence.destroy()
      newDoc.destroy()
      setAwareness(null)
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
    <DocumentContext.Provider value={{ doc, pages, activePageId, shapesArray, awareness, docId, collabStatus }}>
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
