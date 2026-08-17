import { useEffect, useRef, lazy, Suspense } from 'react'
import { useProjectStore } from './projects/projectStore'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { UpdateNotification } from './ui/UpdateNotification'

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

  useEffect(() => {
    if (!loading && !restoredRef.current) {
      restoredRef.current = true
      const { projectId, pageId } = parseHash()
      if (projectId) {
        openProject(projectId, pageId || undefined)
      }
    }
  }, [loading, openProject])

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
