import { useCallback, useEffect, useState } from 'react'
import { createDocument, listDocuments, type CloudDocument } from './api'
import { useSession } from './authClient'

/**
 * The documents this account can open, or nothing at all when signed out.
 *
 * Deliberately separate from `useProjectStore`: local projects and cloud
 * documents are different lists in the UI because they are different things —
 * one is on this machine and private, the other is on the server and can be
 * shared. Blurring them is how a local-first tool quietly stops being one.
 */
export function useCloudDocuments() {
  const { data: session, isPending } = useSession()
  const [documents, setDocuments] = useState<CloudDocument[]>([])
  // `loaded` rather than `loading`: it answers "has the first fetch come
  // back", which is what decides whether an empty list means "none" or
  // "not yet".
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  /** Bumped to ask for a fresh fetch after creating or signing out. */
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (!session) return
    // Guarded so a response for the previous account cannot land after a
    // sign-out, which would show one person another's documents.
    let cancelled = false
    listDocuments().then(
      (next) => {
        if (cancelled) return
        setDocuments(next)
        setError('')
        setLoaded(true)
      },
      (e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load your documents.')
        setLoaded(true)
      },
    )
    return () => { cancelled = true }
  }, [session, epoch])

  const refresh = useCallback(() => setEpoch((n) => n + 1), [])

  const create = useCallback(async (title: string) => {
    const id = await createDocument(title)
    refresh()
    return id
  }, [refresh])

  return {
    signedIn: !!session,
    checkingSession: isPending,
    email: session?.user.email ?? null,
    // Signed out there are none, rather than the last account's left behind.
    documents: session ? documents : [],
    /** False until the first fetch answers, so "none yet" is not shown too early. */
    loaded: session ? loaded : false,
    error,
    refresh,
    create,
  }
}
