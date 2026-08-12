import { useState } from 'react'
import { DocumentProvider } from './hooks/useDocument'
import { Canvas } from './canvas/Canvas'
import { TopBar } from './panels/TopBar'
import { Toolbar } from './panels/Toolbar'
import { LayersPanel } from './panels/LayersPanel'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { ZoomControls } from './panels/ZoomControls'
import { KeyboardHandler } from './KeyboardHandler'
import { SettingsPanel } from './projects/SettingsPanel'

export function Editor({ projectId }: { projectId: string }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <DocumentProvider projectId={projectId}>
      {showSettings ? (
        <SettingsPanel onBack={() => setShowSettings(false)} backLabel="Back to project" />
      ) : (
        <>
          <KeyboardHandler />
          <div className="h-screen flex flex-col bg-bg">
            <TopBar onOpenSettings={() => setShowSettings(true)} />
            <div className="flex flex-1 overflow-hidden">
              <LayersPanel />
              <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
                <Canvas />
                <Toolbar />
                <ZoomControls />
              </div>
              <PropertiesPanel />
            </div>
          </div>
        </>
      )}
    </DocumentProvider>
  )
}
