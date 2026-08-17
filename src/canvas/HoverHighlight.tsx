import { Rect } from 'react-konva'
import { useUIStore } from '../store/uiStore'
import { useViewportStore } from '../store/viewportStore'
import { useShapes } from '../hooks/useShapes'

/**
 * Faint outline on the shape under the pointer.
 *
 * Every shape component already reports hover into uiStore, but until now
 * nothing drew it — so there was no feedback telling you what a click would
 * actually hit, which matters most for small, overlapping or transparent
 * shapes. Suppressed for shapes that are already selected, since the
 * transformer outlines those, and while a drag is in progress.
 */
export function HoverHighlight() {
  const hoveredId = useUIStore((s) => s.hoveredId)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const dropTargetFrameId = useUIStore((s) => s.dropTargetFrameId)
  const zoom = useViewportStore((s) => s.zoom)
  const shapes = useShapes()

  if (!hoveredId || selectedIds.has(hoveredId)) return null
  // A drag is running — the drop-target highlight owns the feedback then
  if (dropTargetFrameId) return null

  const shape = shapes.find((s) => s.id === hoveredId)
  if (!shape || !shape.visible) return null

  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      stroke="#4a9eff"
      strokeWidth={1 / zoom}
      opacity={0.7}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
