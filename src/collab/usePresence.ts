import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import { useDocument } from '../hooks/useDocument'
import { useUIStore } from '../store/uiStore'
import type { Identity } from '../store/identityStore'

export interface PeerCursor {
  x: number
  y: number
}

/** One collaborator's ephemeral state, as published through awareness. */
export interface PeerState {
  /** Yjs client id — stable for the lifetime of that peer's document */
  clientId: number
  user: Identity
  cursor: PeerCursor | null
  selectedIds: string[]
}

function readPeers(awareness: Awareness): PeerState[] {
  const peers: PeerState[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === awareness.clientID) return
    const user = (state as { user?: Identity }).user
    if (!user?.id) return
    peers.push({
      clientId,
      user,
      cursor: ((state as { cursor?: PeerCursor | null }).cursor) ?? null,
      selectedIds: ((state as { selectedIds?: string[] }).selectedIds) ?? [],
    })
  })
  return peers
}

/** ~25 fps. Fast enough to read as live, far below pointer-event rate. */
const CURSOR_THROTTLE_MS = 40

const NO_PEERS: PeerState[] = []

/**
 * Everyone else currently in this document.
 *
 * Awareness is an external store, so this subscribes to it directly rather
 * than mirroring into React state. The snapshot is cached against a version
 * counter because useSyncExternalStore requires a stable reference when
 * nothing has changed — recomputing the array every render would loop.
 */
export function useRemotePeers(): PeerState[] {
  const { awareness } = useDocument()
  const version = useRef(0)
  const cache = useRef<{ version: number; peers: PeerState[] }>({ version: -1, peers: NO_PEERS })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!awareness) return () => {}
      const handler = () => {
        version.current++
        onStoreChange()
      }
      awareness.on('change', handler)
      return () => awareness.off('change', handler)
    },
    [awareness]
  )

  const getSnapshot = useCallback(() => {
    if (!awareness) return NO_PEERS
    if (cache.current.version !== version.current) {
      cache.current = { version: version.current, peers: readPeers(awareness) }
    }
    return cache.current.peers
  }, [awareness])

  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Publishes this client's cursor and selection.
 *
 * Cursor moves arrive at pointer-move frequency, so writes are coalesced to at
 * most one per animation frame — the protocol sends the whole state object on
 * every change, and a design tool has no use for sub-frame cursor fidelity.
 */
export function usePresencePublisher() {
  const { awareness } = useDocument()
  const selectedIds = useUIStore((s) => s.selectedIds)

  const pending = useRef<{ cursor?: PeerCursor | null }>({})
  const timer = useRef<number | null>(null)

  const flush = useCallback(() => {
    timer.current = null
    if (!awareness) return
    if ('cursor' in pending.current) {
      awareness.setLocalStateField('cursor', pending.current.cursor ?? null)
    }
    pending.current = {}
  }, [awareness])

  const publishCursor = useCallback(
    (cursor: PeerCursor | null) => {
      if (!awareness) return
      pending.current = { cursor }
      // Trailing throttle: the first move schedules a send, later moves inside
      // the window just overwrite what will be sent. A timer rather than
      // requestAnimationFrame, because rAF is throttled in background tabs —
      // which would strand a peer's last known cursor position.
      if (timer.current !== null) return
      timer.current = window.setTimeout(flush, CURSOR_THROTTLE_MS)
    },
    [awareness, flush]
  )

  // Selection changes are user-paced except during a marquee drag, and the
  // payload is small, so a plain effect is enough.
  useEffect(() => {
    if (!awareness) return
    awareness.setLocalStateField('selectedIds', [...selectedIds])
  }, [awareness, selectedIds])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      // Must clear, not just cancel: the ref survives a remount (StrictMode
      // double-invokes effects), and a stale id would make publishCursor
      // believe a send is already pending, so nothing is ever published again.
      timer.current = null
    },
    []
  )

  return publishCursor
}
