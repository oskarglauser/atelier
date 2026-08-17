import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'

/**
 * The Yjs wire protocol, independent of how bytes actually travel.
 *
 * Both providers (cross-tab BroadcastChannel and peer-to-peer iroh) speak
 * exactly this, so the protocol is implemented once and a transport only has
 * to move opaque `Uint8Array` frames. It is also why the Rust side needs no
 * knowledge of the CRDT at all.
 */

export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1

/** Each client re-announces at least this often; peers drop silent ones at 30s. */
export const AWARENESS_PING_MS = 15_000

export type SendFrame = (frame: Uint8Array) => void

/**
 * Ask peers for whatever this replica is missing. Sent on connect, and worth
 * repeating periodically on lossy transports as cheap anti-entropy — the
 * exchange is idempotent.
 */
export function encodeSyncRequest(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

/** Wrap a local document update for the wire. */
export function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

/** Wrap the given clients' awareness state for the wire. */
export function encodeAwareness(
  awareness: awarenessProtocol.Awareness,
  clients: number[]
): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clients)
  )
  return encoding.toUint8Array(encoder)
}

/**
 * Apply an incoming frame, replying through `send` when the sync protocol
 * produces an answer (a state-vector request needs the matching update back).
 *
 * `origin` is passed to Y.applyUpdate: it must be the provider instance, never
 * the string 'local', or remote edits land on this client's undo stack.
 */
export function applyFrame(
  frame: Uint8Array,
  doc: Y.Doc,
  awareness: awarenessProtocol.Awareness,
  origin: unknown,
  send: SendFrame
) {
  const decoder = decoding.createDecoder(frame)
  const messageType = decoding.readVarUint(decoder)

  if (messageType === MESSAGE_SYNC) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.readSyncMessage(decoder, encoder, doc, origin)
    // Length 1 means the header only — nothing to answer with
    if (encoding.length(encoder) > 1) send(encoding.toUint8Array(encoder))
  } else if (messageType === MESSAGE_AWARENESS) {
    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      decoding.readVarUint8Array(decoder),
      origin
    )
  }
}
