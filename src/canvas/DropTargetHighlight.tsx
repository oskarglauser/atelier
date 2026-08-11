import { Rect } from 'react-konva'
import { useUIStore } from '../store/uiStore'
import { useViewportStore } from '../store/viewportStore'
import { useShapes } from '../hooks/useShapes'

/**
 * Accent outline on the frame that would receive the dragged shape if it were
 * dropped right now. Driven by uiStore.dropTargetFrameId, set during canvas
 * drags in SelectionOverlay.
 */
export function DropTargetHighlight() {
  const dropTargetFrameId = useUIStore((s) => s.dropTargetFrameId)
  const zoom = useViewportStore((s) => s.zoom)
  const shapes = useShapes()

  if (!dropTargetFrameId) return null
  const frame = shapes.find((s) => s.id === dropTargetFrameId)
  if (!frame) return null

  return (
    <Rect
      x={frame.x}
      y={frame.y}
      width={frame.width}
      height={frame.height}
      rotation={frame.rotation}
      stroke="#4a9eff"
      strokeWidth={2 / zoom}
      fill="rgba(74, 158, 255, 0.06)"
      listening={false}
    />
  )
}
