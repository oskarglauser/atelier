import { useState } from 'react'
import { DocumentProvider, type CloudSource } from './hooks/useDocument'
import { KeyboardHandler } from './KeyboardHandler'
import { SettingsPanel } from './projects/SettingsPanel'
import { EditorBody } from './EditorBody'

export function Editor({ projectId, cloud }: { projectId: string; cloud?: CloudSource }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <DocumentProvider projectId={projectId} cloud={cloud}>
      {showSettings ? (
        <SettingsPanel onBack={() => setShowSettings(false)} backLabel="Back to project" />
      ) : (
        <>
          <KeyboardHandler />
          <EditorBody onOpenSettings={() => setShowSettings(true)} />
        </>
      )}
    </DocumentProvider>
  )
}
