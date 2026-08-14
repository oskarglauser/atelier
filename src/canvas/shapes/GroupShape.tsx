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
    </Group>
  )
})
