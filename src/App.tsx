import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useProjectStore } from './projects/projectStore'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { UpdateNotification } from './ui/UpdateNotification'
import { JoinLanding } from './collab/JoinLanding'
import { joinCodeFromHash, useJoinLinks } from './collab/useJoinLinks'
import { decodeTicket } from './collab/ticket'
import { isTauri } from './utils/isTauri'
import { parseCloudHash, type CloudRoute } from './cloud/route'

/**
 * The join code in `#/join/<code>`, but only if it is really a ticket.
 *
 * A mistyped or truncated link should land on the projects view rather than on
 * a page inviting someone into a document that cannot be resolved.
 */
function validJoinCode(hash: string): string | null {
  const code = joinCodeFromHash(hash)
  return code && decodeTicket(code) ? code : null
}

// The editor pulls in Konva, the panels, and the vector-ops stack — most of
// the bundle. Splitting it keeps the project browser's first paint light.
const Editor = lazy(() => import('./Editor').then((m) => ({ default: m.Editor })))

function parseHash(): { projectId: string | null; pageId: string | null } {
  const hash = window.location.hash
  const projectMatch = hash.match(/#\/project\/([^/]+)/)
  const pageMatch = hash.match(/\/page\/([^/]+)/)
  return {
    projectId: projectMatch ? projectMatch[1] : null,
    pageId: pageMatch ? pageMatch[1] : null,
  }
}

export default function App() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const loading = useProjectStore((s) => s.loading)
  const openProject = useProjectStore((s) => s.openProject)
  const restoredRef = useRef(false)

  // Desktop only — see useJoinLinks. In the browser a join link falls through
  // to JoinLanding below.
  useJoinLinks()

  const [joinCode, setJoinCode] = useState(() => validJoinCode(window.location.hash))
  // A hosted document, which the editor opens instead of a local project.
  const [cloudRoute, setCloudRoute] = useState<CloudRoute | null>(() =>
    parseCloudHash(window.location.hash),
  )
  useEffect(() => {
    const onHashChange = () => {
      setJoinCode(validJoinCode(window.location.hash))
      setCloudRoute(parseCloudHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!loading && !restoredRef.current) {
      restoredRef.current = true
      const { projectId, pageId } = parseHash()
      if (projectId) {
        openProject(projectId, pageId || undefined)
      }
    }
  }, [loading, openProject])

  if (joinCode && !isTauri() && !activeProjectId) {
    return <JoinLanding code={joinCode} />
  }

  // A hosted document stands on its own: its content comes from the server,
  // so there is no local project behind it. The id doubles as the key, so
  // moving between documents rebuilds the editor rather than reusing one
  // pointed at the wrong doc.
  if (cloudRoute) {
    return (
      <>
        <Suspense fallback={<div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>}>
          <Editor
            key={cloudRoute.documentId}
            projectId={cloudRoute.documentId}
            cloud={cloudRoute}
          />
        </Suspense>
        <UpdateNotification />
      </>
    )
  }

  return (
    <>
      {activeProjectId ? (
        <Suspense fallback={<div className="flex items-center justify-center h-screen bg-bg text-text-secondary">Loading...</div>}>
          <Editor projectId={activeProjectId} />
        </Suspense>
      ) : (
        <ProjectBrowser />
      )}
      <UpdateNotification />
    </>
  )
}
