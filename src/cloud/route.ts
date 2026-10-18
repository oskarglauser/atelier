/**
 * Hosted documents in the address bar.
 *
 * `#/cloud/<id>` for one you have access to, and `#/cloud/<id>?k=<token>` for
 * one opened from a view-only link. The token sits in the fragment with
 * everything else, which browsers never send to a server — so a link pasted
 * into a chat does not hand the capability to the host or its logs.
 */
export interface CloudRoute {
  documentId: string
  shareToken: string | null
}

export function parseCloudHash(hash: string): CloudRoute | null {
  const match = hash.match(/^#\/cloud\/([A-Za-z0-9-]+)(?:\?k=([A-Za-z0-9_-]+))?$/)
  if (!match || !match[1]) return null
  return { documentId: match[1], shareToken: match[2] ?? null }
}

export function cloudHash(documentId: string, shareToken?: string | null): string {
  return shareToken
    ? `#/cloud/${documentId}?k=${encodeURIComponent(shareToken)}`
    : `#/cloud/${documentId}`
}

export function openCloudDocument(documentId: string, shareToken?: string | null) {
  window.location.hash = cloudHash(documentId, shareToken)
}
