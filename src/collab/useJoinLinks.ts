import { useEffect, useRef } from 'react'
import { useProjectStore } from '../projects/projectStore'
import { isTauri } from '../utils/isTauri'
import { decodeTicket } from './ticket'

/**
 * Opening a document from a join link, on the desktop.
 *
 * A link arrives two ways, and both end up here:
 *
 * - `atelier://join/<code>` handed over by the OS, either because the app was
 *   already running or because the link launched it.
 * - `#/join/<code>` in the address bar, which is what the shareable https link
 *   becomes once it reaches the app.
 *
 * Deliberately inert in the browser. There is no peer-to-peer transport there,
 * so joining would produce a project that looks joined and silently never
 * syncs — the browser shows `JoinLanding` instead, which sends the person to
 * the app.
 *
 * Joining is idempotent — `joinProject` reuses the existing local project for a
 * document already joined — so a link opened twice reopens rather than
 * duplicating.
 */

/** Pull `<code>` out of `#/join/<code>`, if that is what the fragment holds. */
export function joinCodeFromHash(hash: string): string | null {
  const match = hash.match(/^#\/join\/([A-Za-z0-9_-]+)/)
  return match ? match[1] : null
}

export function useJoinLinks() {
  const joinProject = useProjectStore((s) => s.joinProject)
  const openProject = useProjectStore((s) => s.openProject)
  const loading = useProjectStore((s) => s.loading)

  // Ref rather than state: this must not re-run the effect, and a link already
  // being opened should not be opened again by the other of the two paths.
  const opening = useRef(false)

  useEffect(() => {
    if (!isTauri()) return
    // The project list is what `joinProject` de-duplicates against, so acting
    // before it loads would create a second copy of an already-joined document.
    if (loading) return

    let cancelled = false

    const open = async (text: string) => {
      if (cancelled || opening.current) return
      if (!decodeTicket(text)) return
      opening.current = true
      try {
        const meta = await joinProject(text)
        if (cancelled || !meta) return
        openProject(meta.id)
      } finally {
        opening.current = false
      }
    }

    const fromHash = () => {
      const code = joinCodeFromHash(window.location.hash)
      if (code) void open(code)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)

    let unlisten: (() => void) | undefined
    void (async () => {
      try {
        const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
        // Launched *by* a link: the URL is waiting rather than arriving.
        const initial = await getCurrent()
        initial?.forEach((url) => void open(url))
        if (cancelled) return
        unlisten = await onOpenUrl((urls) => urls.forEach((url) => void open(url)))
      } catch {
        // No scheme registration — a dev build on macOS, most likely, where
        // only an installed bundle can claim a scheme. Pasting a code into the
        // Join dialog still works.
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('hashchange', fromHash)
      unlisten?.()
    }
  }, [loading, joinProject, openProject])
}
