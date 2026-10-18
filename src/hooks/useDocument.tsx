import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'
import {
  createDoc,
  ensureDefaultPage,
  ensureDocId,
  getDocName,
  getPages,
  getShapesArray,
  setDocName,
} from '../document/createDoc'
import { createUndoManager } from '../document/undoManager'
import { runMigrations } from '../document/migrations'
import { useHistoryStore } from '../store/historyStore'
import { useIdentityStore } from '../store/identityStore'
import { useProjectStore } from '../projects/projectStore'
import { BroadcastChannelProvider } from '../collab/BroadcastChannelProvider'
import { IrohProvider, type IrohStatus } from '../collab/IrohProvider'
import { HostedProvider, type HostedStatus } from '../collab/HostedProvider'
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
  /** Hosted transport status. Null for a local project, which has no server. */
  hostedStatus: HostedStatus | null
  /**
   * Whether this replica may be edited.
   *
   * False while a hosted document is connecting, and for anyone the server
   * granted read-only — someone following a view-only link. Always true for a
   * local project, which answers to nobody.
   */
  canEdit: boolean
}

/**
 * A document that lives on the server rather than on this machine.
 *
 * `shareToken` is set when someone arrived by link without an account; a
 * signed-in user has a cookie instead and passes null.
 */
export interface CloudSource {
  documentId: string
  shareToken: string | null
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

export function DocumentProvider({
  projectId,
  cloud,
  children,
}: {
  projectId: string
  /** Set to open a hosted document instead of a local one. */
  cloud?: CloudSource
  children: ReactNode
}) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [pages, setPages] = useState<Page[]>([])
  const [awareness, setAwareness] = useState<Awareness | null>(null)
  // Only a local document discovers its id (from storage, or a join ticket);
  // a hosted one is named by the route, so that case is derived below.
  const [localDocId, setLocalDocId] = useState<string>('')
  const [collabStatus, setCollabStatus] = useState<IrohStatus | null>(null)
  const [hostedStatus, setHostedStatus] = useState<HostedStatus | null>(null)
  const irohRef = useRef<IrohProvider | null>(null)
  const hostedRef = useRef<HostedProvider | null>(null)
  const persistenceRef = useRef<IndexeddbPersistence | null>(null)
  const activePageId = useProjectStore((s) => s.activePageId)
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const setUndoManager = useHistoryStore((s) => s.setUndoManager)

  useEffect(() => {
    const newDoc = createDoc()

    // Cross-tab sync and presence. Other transports attach here the same way —
    // the document model does not care which, only that something moves bytes.
    const provider = new BroadcastChannelProvider(`atelier-project-${projectId}`, newDoc)
    const identity = useIdentityStore.getState()
    provider.awareness.setLocalStateField('user', {
      id: identity.id,
      name: identity.name,
      color: identity.color,
    })

    // A hosted document is the server's, not this machine's: it is not written
    // to IndexedDB, so signing in on a shared computer leaves nothing behind,
    // and there is one copy to be authoritative rather than two to reconcile.
    if (cloud) {
      hostedRef.current = new HostedProvider(
        cloud.documentId,
        newDoc,
        provider.awareness,
        cloud.shareToken,
        (status) => {
          setHostedStatus(status)
          if (status.state !== 'connected') return
          // Only once the server's copy has arrived. Creating the default
          // page before then would add an empty one to a document that
          // already has pages, and a viewer cannot write it back out again.
          ensureDefaultPage(newDoc)
          const cloudPages = getPages(newDoc)
          setPages(cloudPages)
          if (cloudPages.length > 0 && !activePageId) {
            setActivePageId(cloudPages[0].id)
          }
          setAwareness(provider.awareness)
          setDoc(newDoc)
        },
      )
    }

    const persistence = cloud
      ? null
      : new IndexeddbPersistence(`atelier-project-${projectId}`, newDoc)
    persistenceRef.current = persistence

    persistence?.once('synced', () => {
      // Before anything reads the document: IndexedDB has replayed, so this is
      // the only point where the stored schema is known and still untouched.
      runMigrations(newDoc)
      ensureDefaultPage(newDoc)
      const meta = useProjectStore.getState().projects.find((p) => p.id === projectId)
      const resolvedDocId = ensureDocId(newDoc, meta?.joinDocId)
      setLocalDocId(resolvedDocId)

      // Give the document its name, so whoever joins sees the same title
      // rather than the placeholder a join starts with. Only a document we
      // did not join seeds it — a joiner writing its placeholder here would
      // overwrite the real name for everyone.
      if (!meta?.joinDocId && meta?.name && !getDocName(newDoc)) {
        setDocName(newDoc, meta.name)
      }
      syncNameFromDoc()

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

    // The name can arrive well after the first sync — a joiner connects with
    // nothing and fills in once a peer answers — so keep watching rather than
    // reading once.
    function syncNameFromDoc() {
      // A hosted document has no local project row to rename.
      if (cloud) return
      const shared = getDocName(newDoc)
      if (!shared) return
      void useProjectStore.getState().renameProject(projectId, shared)
    }
    const metaMap = newDoc.getMap('meta')
    metaMap.observe(syncNameFromDoc)

    const updatePages = () => {
      setPages(getPages(newDoc))
    }
    newDoc.getArray('pages').observeDeep(updatePages)

    return () => {
      metaMap.unobserve(syncNameFromDoc)
      newDoc.getArray('pages').unobserveDeep(updatePages)
      void irohRef.current?.destroy()
      irohRef.current = null
      hostedRef.current?.destroy()
      hostedRef.current = null
      provider.destroy()
      persistence?.destroy()
      newDoc.destroy()
      setAwareness(null)
      setHostedStatus(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, cloud?.documentId, cloud?.shareToken])

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
    <DocumentContext.Provider
      value={{
        doc,
        pages,
        activePageId,
        shapesArray,
        awareness,
        docId: cloud ? cloud.documentId : localDocId,
        collabStatus,
        hostedStatus,
        // A local project answers to nobody; a hosted one may be edited only
        // once the server has said so.
        canEdit: cloud
          ? hostedStatus?.state === 'connected' && !hostedStatus.readOnly
          : true,
      }}
    >
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
