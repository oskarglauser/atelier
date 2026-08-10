import { DocumentProvider } from './hooks/useDocument'
import { Canvas } from './canvas/Canvas'
import { TopBar } from './panels/TopBar'
import { Toolbar } from './panels/Toolbar'
import { LayersPanel } from './panels/LayersPanel'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { ZoomControls } from './panels/ZoomControls'
import { KeyboardHandler } from './KeyboardHandler'

export function Editor({ projectId }: { projectId: string }) {
  return (
    <DocumentProvider projectId={projectId}>
      <KeyboardHandler />
      <div className="h-screen flex flex-col bg-bg">
        <TopBar />
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
    </DocumentProvider>
  )
}
