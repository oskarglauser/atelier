import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider'
import type * as Y from 'yjs'
import type { Awareness } from 'y-protocols/awareness'

/**
 * Sync with the hosted server.
 *
 * The third transport beside `BroadcastChannelProvider` (tabs) and
 * `IrohProvider` (peer-to-peer desktop), and the only one that is not a peer:
 * the server is authoritative, persists the document, and decides who may
 * write to it.
 *
 * It does not go through `yjsProtocol.ts` like the other two, because
 * Hocuspocus prefixes every message with the document name rather than
 * speaking plain y-protocols framing. Its own provider is wrapped instead —
 * which also brings reconnection and backoff that a hand-rolled socket would
 * have to grow. See docs/hosted.md.
 */

export interface HostedStatus {
  state: 'connecting' | 'connected' | 'error'
  /** True when the server refused our edits — a viewer, or a share link. */
  readOnly: boolean
  error?: string
}

export class HostedProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness

  private provider: HocuspocusProvider
  private destroyed = false

  constructor(
    documentId: string,
    doc: Y.Doc,
    awareness: Awareness,
    /** A share token, for someone opening a link without an account. */
    shareToken: string | null,
    onStatus?: (status: HostedStatus) => void,
  ) {
    this.doc = doc
    this.awareness = awareness

    // Same origin as the page, so this works in development (through Vite's
    // proxy) and in production without the URL being configuration.
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const base = `${scheme}://${window.location.host}/sync`
    // The token travels in the query string: a signed-in user arrives with a
    // cookie and no token at all, and the server reads both the same way.
    const url = shareToken
      ? `${base}?token=${encodeURIComponent(shareToken)}`
      : base

    onStatus?.({ state: 'connecting', readOnly: false })

    this.provider = new HocuspocusProvider({
      url,
      name: documentId,
      document: doc,
      awareness,
      token: null,
      onStatus: ({ status }) => {
        if (this.destroyed) return
        if (status === WebSocketStatus.Connected) return // wait for the sync below
        if (status === WebSocketStatus.Disconnected) {
          onStatus?.({ state: 'connecting', readOnly: false })
        }
      },
      onSynced: () => {
        if (this.destroyed) return
        onStatus?.({ state: 'connected', readOnly: !this.canWrite })
      },
      onAuthenticationFailed: ({ reason }) => {
        if (this.destroyed) return
        onStatus?.({
          state: 'error',
          readOnly: true,
          // The server deliberately does not say which of unknown, revoked or
          // expired it was, so neither do we.
          error:
            reason === 'permission-denied'
              ? 'This document is not shared with you, or the link was revoked.'
              : reason,
        })
      },
    })
  }

  /**
   * Whether the server is accepting our edits.
   *
   * Hocuspocus reports the scope it granted. Requiring read-write explicitly
   * rather than ruling out readonly means an unknown scope counts as
   * read-only, which fails the safe way: the worst case is the UI saying you
   * cannot edit for a moment, not letting you type into a void.
   */
  get canWrite(): boolean {
    return this.provider.authorizedScope === 'read-write'
  }

  destroy() {
    this.destroyed = true
    this.provider.destroy()
  }
}
