import { Group, Rect } from 'react-konva'
import type { GroupShape as GroupShapeType, Shape } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, type ReactNode } from 'react'
import { MaskedChildren } from '../MaskedChildren'

interface Props {
  shape: GroupShapeType
  onSelect: (id: string, e: MouseEvent) => void
  childShapes?: Shape[]
  renderChild?: (child: Shape) => ReactNode
}

export const GroupShapeComponent = memo(function GroupShapeComponent({ shape, onSelect, childShapes, renderChild }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const isHovered = useUIStore((s) => s.hoveredId === shape.id)
  const hasMask = !!childShapes?.some((c) => c.isMask && c.visible)

  return (
    <Group
      id={shape.id}
      x={shape.x}
      y={shape.y}
      rotation={shape.rotation}
      opacity={shape.opacity}
      visible={shape.visible}
      draggable={!shape.locked}
      onDragEnd={() => {}}
      onMouseDown={(e) => onSelect(shape.id, e.evt)}
      onMouseEnter={() => setHoveredId(shape.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <Rect
        width={shape.width}
        height={shape.height}
        fill="transparent"
        listening={false}
      />
      {childShapes && renderChild && (
        <Group x={-shape.x} y={-shape.y}>
          <MaskedChildren childShapes={childShapes} renderChild={renderChild} />
        </Group>
      )}
      {isHovered && hasMask && (
        // Masked content extends invisibly past the clip; the dashed bounds
        // explain on hover why children appear cut off.
        <Rect
          width={shape.width}
          height={shape.height}
          stroke="rgba(74, 158, 255, 0.7)"
          strokeWidth={1}
          dash={[4, 3]}
          listening={false}
        />
      )}
    </Group>
  )
})
