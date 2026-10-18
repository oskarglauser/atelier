import { Canvas } from './canvas/Canvas'
import { TopBar } from './panels/TopBar'
import { Toolbar } from './panels/Toolbar'
import { LayersPanel } from './panels/LayersPanel'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { ZoomControls } from './panels/ZoomControls'
import { CloudStatus } from './cloud/CloudStatus'
import { useDocument } from './hooks/useDocument'

/**
 * The editor chrome, inside the document context so it can tell whether this
 * document may be edited.
 *
 * Separate from `Editor` only because that component *provides* the context
 * and so cannot read it.
 */
export function EditorBody({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { canEdit } = useDocument()

  return (
    <div className="h-screen flex flex-col bg-bg">
      <TopBar onOpenSettings={onOpenSettings} />
      <CloudStatus />
      <div className="flex flex-1 overflow-hidden">
        <LayersPanel />
        <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          <Canvas />
          {/*
            No drawing tools when the server will not accept what they make.
            The server is the real boundary — it discards a viewer's updates
            either way — but offering tools that quietly do nothing is its own
            kind of broken.
          */}
          {canEdit && <Toolbar />}
          <ZoomControls />
        </div>
        <PropertiesPanel />
      </div>
    </div>
  )
}
