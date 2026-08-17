import * as Y from 'yjs'
import * as bc from 'lib0/broadcastchannel'
import * as awarenessProtocol from 'y-protocols/awareness'
import {
  AWARENESS_PING_MS,
  applyFrame,
  encodeAwareness,
  encodeSyncRequest,
  encodeUpdate,
} from './yjsProtocol'

/**
 * Syncs a Y.Doc and its awareness between tabs of the same browser, over
 * BroadcastChannel. No network, no server, no configuration.
 *
 * This is a real provider — cross-tab editing of one project genuinely works —
 * and it is also how the collaboration UI gets exercised without any transport
 * to debug: open the same project twice and you have two peers.
 */
export class BroadcastChannelProvider {
  readonly doc: Y.Doc
  readonly awareness: awarenessProtocol.Awareness
  readonly roomName: string

  private connected = false
  private pingTimer: number | null = null

  constructor(roomName: string, doc: Y.Doc, awareness?: awarenessProtocol.Awareness) {
    this.roomName = roomName
    this.doc = doc
    this.awareness = awareness ?? new awarenessProtocol.Awareness(doc)

    bc.subscribe(this.roomName, this.onMessage)
    this.connected = true

    doc.on('update', this.onDocUpdate)
    this.awareness.on('update', this.onAwarenessUpdate)
    window.addEventListener('beforeunload', this.onUnload)

    // Ask peers for anything we're missing, and announce ourselves.
    this.send(encodeSyncRequest(doc))
    this.send(encodeAwareness(this.awareness, [this.doc.clientID]))

    // The protocol expects each client to re-announce periodically; peers drop
    // entries that go quiet for 30s.
    this.pingTimer = window.setInterval(() => {
      this.send(encodeAwareness(this.awareness, [this.doc.clientID]))
    }, AWARENESS_PING_MS)
  }

  private send = (frame: Uint8Array) => {
    if (!this.connected) return
    bc.publish(this.roomName, frame, this)
  }

  /** Local document change → tell the other tabs. Remote echoes are skipped. */
  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return
    this.send(encodeUpdate(update))
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return
    this.send(encodeAwareness(this.awareness, [...added, ...updated, ...removed]))
  }

  private onMessage = (data: ArrayBuffer | Uint8Array, origin: unknown) => {
    if (origin === this) return
    // Applying with `this` as origin is what keeps remote edits off the local
    // undo stack — the UndoManager only tracks the 'local' string origin.
    applyFrame(new Uint8Array(data as ArrayBuffer), this.doc, this.awareness, this, this.send)
  }

  private onUnload = () => {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'unload')
  }

  destroy() {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer)
    this.pingTimer = null
    window.removeEventListener('beforeunload', this.onUnload)
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy')
    this.awareness.off('update', this.onAwarenessUpdate)
    this.doc.off('update', this.onDocUpdate)
    if (this.connected) {
      bc.unsubscribe(this.roomName, this.onMessage)
      this.connected = false
    }
    this.awareness.destroy()
  }
}
