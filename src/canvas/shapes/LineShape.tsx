import { Line, Group, Circle, Rect, Shape as KonvaShape } from 'react-konva'
import type { LineShape as LineShapeType, LineCap } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo } from 'react'

interface Props {
  shape: LineShapeType
  onSelect: (id: string, e: MouseEvent) => void
}

function getAngle(x1: number, y1: number, x2: number, y2: number) {
  return Math.atan2(y2 - y1, x2 - x1)
}

export const LineShapeComponent = memo(function LineShapeComponent({ shape, onSelect }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const pts = shape.points
  const sx = shape.scaleX ?? 1
  const sy = shape.scaleY ?? 1
  const strokeColor = shape.stroke || '#000000'
  const sw = shape.strokeWidth || 2

  const startCap = shape.startCap || 'none'
  const endCap = shape.endCap || 'none'

  // Get start/end positions and angles
  const x1 = pts[0] * sx
  const y1 = pts[1] * sy
  const x2 = pts[pts.length - 2] * sx
  const y2 = pts[pts.length - 1] * sy
  const startAngle = getAngle(x2, y2, x1, y1)
  const endAngle = getAngle(x1, y1, x2, y2)

  const capSize = Math.max(8, sw * 3)
  const hasCaps = startCap !== 'none' || endCap !== 'none'

  const renderCap = (cap: LineCap, cx: number, cy: number, angle: number, key: string) => {
    if (cap === 'none') return null
    if (cap === 'arrow') {
      const arrowLen = capSize
      const arrowWidth = capSize * 0.6
      return (
        <KonvaShape
          key={key}
          sceneFunc={(ctx, konvaShape) => {
            ctx.beginPath()
            ctx.translate(cx, cy)
            ctx.rotate(angle)
            ctx.moveTo(0, 0)
            ctx.lineTo(-arrowLen, -arrowWidth / 2)
            ctx.lineTo(-arrowLen, arrowWidth / 2)
            ctx.closePath()
            ctx.fillStrokeShape(konvaShape)
          }}
          fill={strokeColor}
          listening={false}
        />
      )
    }
    if (cap === 'circle') {
      return <Circle key={key} x={cx} y={cy} radius={capSize / 3} fill={strokeColor} listening={false} />
    }
    if (cap === 'square') {
      const s = capSize / 2.5
      return (
        <Rect
          key={key}
          x={cx - s / 2}
          y={cy - s / 2}
          width={s}
          height={s}
          fill={strokeColor}
          rotation={(angle * 180) / Math.PI}
          offsetX={0}
          offsetY={0}
          listening={false}
        />
      )
    }
    return null
  }

  if (!hasCaps) {
    return (
      <Line
        id={shape.id}
        x={shape.x}
        y={shape.y}
        points={shape.points}
        scaleX={sx}
        scaleY={sy}
        rotation={shape.rotation}
        stroke={strokeColor}
        strokeWidth={sw}
        opacity={shape.opacity}
        visible={shape.visible}
        hitStrokeWidth={20}
        draggable={!shape.locked}
        onDragEnd={() => {}}
        onMouseDown={(e) => onSelect(shape.id, e.evt)}
        onMouseEnter={() => setHoveredId(shape.id)}
        onMouseLeave={() => setHoveredId(null)}
      />
    )
  }

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
      <Line
        points={pts.map((p, i) => i % 2 === 0 ? p * sx : p * sy)}
        stroke={strokeColor}
        strokeWidth={sw}
        hitStrokeWidth={20}
      />
      {renderCap(startCap, x1, y1, startAngle, 'start-cap')}
      {renderCap(endCap, x2, y2, endAngle, 'end-cap')}
    </Group>
  )
})
