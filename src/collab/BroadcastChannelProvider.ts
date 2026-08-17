import * as Y from 'yjs'
import * as bc from 'lib0/broadcastchannel'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'

/**
 * Syncs a Y.Doc and its awareness between tabs of the same browser, over
 * BroadcastChannel. No network, no server, no configuration.
 *
 * This is a real provider — cross-tab editing of one project genuinely works —
 * and it is also how the collaboration UI gets exercised without any transport
 * to debug: open the same project twice and you have two peers.
 *
 * The message framing is the standard Yjs one (sync + awareness sub-protocols),
 * so a networked provider can reuse the same handlers.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

/** Awareness entries older than this are dropped by the protocol */
const AWARENESS_PING_MS = 15_000

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
    const sync = encoding.createEncoder()
    encoding.writeVarUint(sync, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(sync, doc)
    this.publish(sync)
    this.publishAwareness([this.doc.clientID])

    // The protocol expects each client to re-announce periodically; peers drop
    // entries that go quiet for 30s.
    this.pingTimer = window.setInterval(() => {
      this.publishAwareness([this.doc.clientID])
    }, AWARENESS_PING_MS)
  }

  private publish(encoder: encoding.Encoder) {
    if (!this.connected) return
    bc.publish(this.roomName, encoding.toUint8Array(encoder), this)
  }

  private publishAwareness(clients: number[]) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients)
    )
    this.publish(encoder)
  }

  /** Local document change → tell the other tabs. Remote echoes are skipped. */
  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    this.publish(encoder)
  }

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return
    this.publishAwareness([...added, ...updated, ...removed])
  }

  private onMessage = (data: ArrayBuffer | Uint8Array, origin: unknown) => {
    if (origin === this) return
    const decoder = decoding.createDecoder(new Uint8Array(data as ArrayBuffer))
    const encoder = encoding.createEncoder()
    const messageType = decoding.readVarUint(decoder)

    if (messageType === MESSAGE_SYNC) {
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      // Applying with `this` as origin is what keeps remote edits off the local
      // undo stack — the UndoManager only tracks the 'local' string origin.
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this)
      // A reply is only needed when readSyncMessage produced one
      if (encoding.length(encoder) > 1) this.publish(encoder)
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        this
      )
    }
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
