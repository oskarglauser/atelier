import { Rect, Shape as KonvaShape } from 'react-konva'
import type { RectangleShape as RectShapeType } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useMemo, useCallback } from 'react'
import type Konva from 'konva'
import { getGradientProps } from '../utils/gradientProps'
import { drawGradientNoiseFill } from '../utils/gradientFill'
import { rectHitFunc, NOOP } from '../utils/shapeHelpers'

interface Props {
  shape: RectShapeType
  onSelect: (id: string, e: MouseEvent) => void
}

export const RectangleShapeComponent = memo(function RectangleShapeComponent({ shape, onSelect }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const cr = shape.cornerRadius
  const isGradient = shape.fillType === 'gradient' && shape.gradient
  const hasNoise = isGradient && shape.gradient!.noise > 0
  const cornerRadius = cr[0] === cr[1] && cr[1] === cr[2] && cr[2] === cr[3] ? cr[0] : cr

  const gradientKonvaProps = useMemo(() => {
    if (!isGradient) return undefined
    return getGradientProps(shape.gradient!, shape.width, shape.height)
  }, [isGradient, shape.gradient, shape.width, shape.height])

  const commonEvents = useMemo(() => ({
    onDragEnd: NOOP,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(shape.id, e.evt),
    onMouseEnter: () => setHoveredId(shape.id),
    onMouseLeave: () => setHoveredId(null),
  }), [shape.id, onSelect, setHoveredId])

  const strokeInfo = useMemo(() =>
    shape.stroke ? { color: shape.stroke, width: shape.strokeWidth || 1 } : undefined,
    [shape.stroke, shape.strokeWidth]
  )

  const sceneFunc = useCallback((ctx: Konva.Context, konvaNode: Konva.Shape) => {
    const w = konvaNode.width()
    const h = konvaNode.height()
    const drawPath = (c: CanvasRenderingContext2D) => {
      if (typeof cornerRadius === 'number' && cornerRadius > 0) {
        const r = cornerRadius
        c.beginPath()
        c.moveTo(r, 0)
        c.lineTo(w - r, 0)
        c.arcTo(w, 0, w, r, r)
        c.lineTo(w, h - r)
        c.arcTo(w, h, w - r, h, r)
        c.lineTo(r, h)
        c.arcTo(0, h, 0, h - r, r)
        c.lineTo(0, r)
        c.arcTo(0, 0, r, 0, r)
        c.closePath()
      } else {
        c.beginPath()
        c.rect(0, 0, w, h)
      }
    }
    drawGradientNoiseFill(ctx._context, w, h, shape.gradient!, drawPath, strokeInfo)
  }, [shape.gradient, cornerRadius, strokeInfo])

  if (hasNoise) {
    return (
      <KonvaShape
        id={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation}
        opacity={shape.opacity}
        visible={shape.visible}
        stroke={shape.stroke || undefined}
        strokeWidth={shape.strokeWidth}
        draggable={!shape.locked}
        sceneFunc={sceneFunc}
        hitFunc={rectHitFunc}
        {...commonEvents}
      />
    )
  }

  return (
    <Rect
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      opacity={shape.opacity}
      visible={shape.visible}
      stroke={shape.stroke || undefined}
      strokeWidth={shape.strokeWidth}
      cornerRadius={cornerRadius}
      draggable={!shape.locked}
      {...(isGradient ? { fill: undefined, ...gradientKonvaProps } : { fill: shape.fill || undefined })}
      {...commonEvents}
    />
  )
})
