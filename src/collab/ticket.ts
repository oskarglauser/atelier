/**
 * Share tickets.
 *
 * A ticket carries the two things a peer cannot guess: which document to join,
 * and one endpoint to reach first. On a local network the endpoint hint is
 * optional — mDNS finds peers by itself — but including it lets a join work
 * without waiting on discovery.
 *
 * Possession of a ticket *is* the permission to edit. There is no revocation
 * short of changing the document id, so treat one like a secret link.
 */
export interface Ticket {
  docId: string
  /** Endpoint ids to dial on join */
  peers: string[]
}

/** URL-safe base64 so a ticket survives being pasted into anything. */
function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

export function encodeTicket(ticket: Ticket): string {
  return toBase64Url(JSON.stringify(ticket))
}

export function decodeTicket(text: string): Ticket | null {
  try {
    const parsed = JSON.parse(fromBase64Url(text.trim())) as Partial<Ticket>
    if (typeof parsed.docId !== 'string' || !parsed.docId) return null
    return { docId: parsed.docId, peers: Array.isArray(parsed.peers) ? parsed.peers : [] }
  } catch {
    return null
  }
}
