import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import * as awarenessProtocol from 'y-protocols/awareness'
import {
  AWARENESS_PING_MS,
  applyFrame,
  encodeAwareness,
  encodeSyncRequest,
  encodeUpdate,
} from './yjsProtocol'

/**
 * Peer-to-peer sync over iroh, via the Rust side.
 *
 * Desktop only: it needs raw UDP sockets for hole punching and mDNS for local
 * discovery, neither of which a browser can do. Frames cross to Rust over the
 * Tauri IPC channel — which also means no CSP change, since `ipc:` is already
 * permitted while `ws:` is not.
 *
 * Transport is iroh-gossip, which is best-effort: a frame can be dropped and
 * there is no catch-up for a peer that joins late. Both are handled by
 * re-sending a state-vector request on an interval — the Yjs exchange is
 * idempotent, so repeating it costs nothing when replicas already agree and
 * repairs them when they don't.
 */

/** How often to re-offer our state vector, covering dropped frames and late joins. */
const ANTI_ENTROPY_MS = 5_000

export interface IrohStatus {
  state: 'connecting' | 'connected' | 'error'
  /** This machine's endpoint id — the shareable half of a join ticket */
  endpointId?: string
  error?: string
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>

export class IrohProvider {
  readonly doc: Y.Doc
  readonly awareness: Awareness

  private destroyed = false
  private timers: number[] = []
  private docId: string
  private bootstrap: string[]
  private onStatus?: (status: IrohStatus) => void

  constructor(
    docId: string,
    doc: Y.Doc,
    awareness: Awareness,
    bootstrap: string[] = [],
    onStatus?: (status: IrohStatus) => void
  ) {
    this.docId = docId
    this.doc = doc
    this.awareness = awareness
    this.bootstrap = bootstrap
    this.onStatus = onStatus
    void this.connect()
  }

  private async connect() {
    this.onStatus?.({ state: 'connecting' })
    try {
      const { invoke } = (await import('@tauri-apps/api/core')) as { invoke: Invoke }
      const { Channel } = await import('@tauri-apps/api/core')

      const channel = new Channel<number[]>()
      channel.onmessage = (frame) => {
        if (this.destroyed) return
        applyFrame(
          new Uint8Array(frame),
          this.doc,
          this.awareness,
          this, // object origin — keeps remote edits off the local undo stack
          (reply) => void this.send(reply)
        )
      }

      const endpointId = await invoke<string>('collab_start', {
        docId: this.docId,
        bootstrap: this.bootstrap,
        onFrame: channel,
      })
      if (this.destroyed) {
        await invoke('collab_stop', { docId: this.docId })
        return
      }

      this.doc.on('update', this.onDocUpdate)
      this.awareness.on('update', this.onAwarenessUpdate)

      // Announce ourselves and ask for anything we're missing.
      void this.send(encodeSyncRequest(this.doc))
      void this.send(encodeAwareness(this.awareness, [this.doc.clientID]))

      this.timers.push(
        window.setInterval(() => {
          void this.send(encodeSyncRequest(this.doc))
        }, ANTI_ENTROPY_MS),
        window.setInterval(() => {
          void this.send(encodeAwareness(this.awareness, [this.doc.clientID]))
        }, AWARENESS_PING_MS)
      )

      this.onStatus?.({ state: 'connected', endpointId })
    } catch (err) {
      this.onStatus?.({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async send(frame: Uint8Array) {
    if (this.destroyed) return
    try {
      const { invoke } = (await import('@tauri-apps/api/core')) as { invoke: Invoke }
      // docId scopes the frame to this document — see collab_send in Rust. The
      // destroyed check above can't cover this on its own, because a send that
      // has already passed it can still be awaiting the import when the next
      // document connects.
      await invoke('collab_send', { docId: this.docId, frame: Array.from(frame) })
    } catch {
      // A dropped frame is recoverable — the anti-entropy tick re-offers state.
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return // don't echo what a peer just sent us
    void this.send(encodeUpdate(update))
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return
    void this.send(encodeAwareness(this.awareness, [...added, ...updated, ...removed]))
  }

  async destroy() {
    this.destroyed = true
    this.timers.forEach((t) => window.clearInterval(t))
    this.timers = []
    this.awareness.off('update', this.onAwarenessUpdate)
    this.doc.off('update', this.onDocUpdate)
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy')
    try {
      const { invoke } = (await import('@tauri-apps/api/core')) as { invoke: Invoke }
      await invoke('collab_stop', { docId: this.docId })
    } catch {
      // Already gone, or Tauri unavailable
    }
  }
}
