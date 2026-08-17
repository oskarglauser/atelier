/**
 * Share tickets.
 *
 * A ticket carries the two things a peer cannot guess: which document to join,
 * and one endpoint to dial first. mDNS resolves and advertises addresses but
 * does not put anyone into a topic, so the endpoint hint is what actually gets
 * a joiner connected.
 *
 * Possession of a ticket *is* the permission to edit. There is no revocation
 * short of changing the document id, so treat one like a secret link.
 *
 * The encoding is packed binary rather than JSON, because a ticket is meant to
 * be pasted into a chat message by a human. JSON spent roughly two thirds of
 * its length on field names, punctuation and hex digits: base64 of
 * `{"docId":…,"peers":["<64 hex chars>"]}` runs about 135 characters, where the
 * same information packed is about 62.
 *
 *   byte 0      format version
 *   byte 1      document id length in bytes (N)
 *   bytes 2..   document id, UTF-8
 *   then        zero or more 32-byte endpoint keys, back to back
 */

const TICKET_VERSION = 1

/** An iroh endpoint id is an Ed25519 public key — 32 bytes, 64 hex characters. */
const KEY_BYTES = 32

/**
 * Where the web fallback lives. A fork should point this at its own deployment.
 *
 * Only used to build a shareable https link; the app itself never fetches it.
 */
const WEB_APP_ORIGIN = 'https://atelier-glauser.vercel.app'

/** Custom scheme registered by the desktop app (see tauri.conf.json). */
const APP_SCHEME = 'atelier'

export interface Ticket {
  docId: string
  /** Endpoint ids to dial on join, lowercase hex */
  peers: string[]
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) return null
    bytes[i] = byte
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function encodeTicket(ticket: Ticket): string {
  const docId = new TextEncoder().encode(ticket.docId)
  // One byte holds the length. Ids are a dozen characters, so this is only
  // reachable by a caller passing something that was never a document id.
  if (docId.length === 0 || docId.length > 255) return ''

  const keys = ticket.peers
    .map(hexToBytes)
    .filter((key): key is Uint8Array => key !== null && key.length === KEY_BYTES)

  const bytes = new Uint8Array(2 + docId.length + keys.length * KEY_BYTES)
  bytes[0] = TICKET_VERSION
  bytes[1] = docId.length
  bytes.set(docId, 2)
  keys.forEach((key, i) => bytes.set(key, 2 + docId.length + i * KEY_BYTES))

  return bytesToBase64Url(bytes)
}

/**
 * Pull the ticket out of whatever the user pasted.
 *
 * People paste the whole link as often as the bare code, so accept
 * `atelier://join/<code>`, `https://…/#/join/<code>` and the code on its own.
 * Base64url has no `/`, so the last path segment is unambiguously the code.
 */
export function extractTicketCode(text: string): string {
  const trimmed = text.trim()
  const inUrl = trimmed.match(/join\/([A-Za-z0-9_-]+)/)
  return inUrl ? inUrl[1] : trimmed
}

export function decodeTicket(text: string): Ticket | null {
  try {
    const bytes = base64UrlToBytes(extractTicketCode(text))
    if (bytes.length < 2 || bytes[0] !== TICKET_VERSION) return null

    const docIdLength = bytes[1]
    if (docIdLength === 0 || bytes.length < 2 + docIdLength) return null
    const docId = new TextDecoder().decode(bytes.subarray(2, 2 + docIdLength))
    if (!docId) return null

    const keyBytes = bytes.subarray(2 + docIdLength)
    if (keyBytes.length % KEY_BYTES !== 0) return null
    const peers: string[] = []
    for (let i = 0; i < keyBytes.length; i += KEY_BYTES) {
      peers.push(bytesToHex(keyBytes.subarray(i, i + KEY_BYTES)))
    }

    return { docId, peers }
  } catch {
    return null
  }
}

/** Opens the document straight in the desktop app, if it is installed. */
export function ticketAppUrl(code: string): string {
  return `${APP_SCHEME}://join/${code}`
}

/**
 * Shareable link that works for someone who may not have the app yet.
 *
 * The code sits in the fragment deliberately: browsers never send a fragment to
 * the server, so pasting this link into a chat does not hand the ticket — which
 * is the edit permission — to the web host or its logs.
 */
export function ticketWebUrl(code: string): string {
  return `${WEB_APP_ORIGIN}/#/join/${code}`
}
