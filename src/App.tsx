import { useEffect, useRef } from 'react'
import { useProjectStore } from './projects/projectStore'
import { ProjectBrowser } from './projects/ProjectBrowser'
import { Editor } from './Editor'
import { UpdateNotification } from './ui/UpdateNotification'

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
      {activeProjectId ? <Editor projectId={activeProjectId} /> : <ProjectBrowser />}
      <UpdateNotification />
    </>
  )
}
