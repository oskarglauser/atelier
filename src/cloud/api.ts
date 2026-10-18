/**
 * The hosted API.
 *
 * Everything here needs a session cookie, which the browser attaches itself —
 * there is no token to hold on to, and nothing to put in localStorage.
 */

export interface CloudDocument {
  id: string
  title: string
  role: "owner" | "editor" | "viewer"
  updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function listDocuments(): Promise<CloudDocument[]> {
  const { documents } = await request<{ documents: CloudDocument[] }>("/documents")
  return documents
}

export async function createDocument(title: string): Promise<string> {
  const { id } = await request<{ id: string }>("/documents", {
    method: "POST",
    body: JSON.stringify({ title }),
  })
  return id
}

/** The document's view-only link, creating one if there isn't a live one. */
export async function getShareToken(documentId: string): Promise<string> {
  const { token } = await request<{ token: string }>(
    `/documents/${documentId}/share`,
    { method: "POST" },
  )
  return token
}

/** Kills the current link. Anyone holding it loses access on their next connection. */
export async function revokeShareToken(documentId: string): Promise<void> {
  await request(`/documents/${documentId}/share`, { method: "DELETE" })
}
