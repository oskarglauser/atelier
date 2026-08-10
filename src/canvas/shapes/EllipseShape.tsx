import { Ellipse, Shape as KonvaShape } from 'react-konva'
import type { EllipseShape as EllipseShapeType } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useMemo, useCallback } from 'react'
import type Konva from 'konva'
import { getGradientProps } from '../utils/gradientProps'
import { drawGradientNoiseFill } from '../utils/gradientFill'
import { NOOP } from '../utils/shapeHelpers'

interface Props {
  shape: EllipseShapeType
  onSelect: (id: string, e: MouseEvent) => void
}

export const EllipseShapeComponent = memo(function EllipseShapeComponent({ shape, onSelect }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const isGradient = shape.fillType === 'gradient' && shape.gradient
  const hasNoise = isGradient && shape.gradient!.noise > 0

  const gradientKonvaProps = useMemo(() => {
    if (!isGradient) return undefined
    const gp = getGradientProps(shape.gradient!, shape.width, shape.height)
    // Konva Ellipse gradient coords are relative to center, shift from (0,0) origin
    return {
      ...gp,
      fillLinearGradientStartPointX: gp.fillLinearGradientStartPointX - shape.width / 2,
      fillLinearGradientStartPointY: gp.fillLinearGradientStartPointY - shape.height / 2,
      fillLinearGradientEndPointX: gp.fillLinearGradientEndPointX - shape.width / 2,
      fillLinearGradientEndPointY: gp.fillLinearGradientEndPointY - shape.height / 2,
    }
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
      c.beginPath()
      c.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      c.closePath()
    }
    drawGradientNoiseFill(ctx._context, w, h, shape.gradient!, drawPath, strokeInfo)
  }, [shape.gradient, strokeInfo])

  const hitFunc = useCallback((ctx: Konva.Context, ks: Konva.Shape) => {
    const w = ks.width(), h = ks.height()
    ctx.beginPath()
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fillStrokeShape(ks)
  }, [])

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
        draggable={!shape.locked}
        sceneFunc={sceneFunc}
        hitFunc={hitFunc}
        {...commonEvents}
      />
    )
  }

  if (isGradient) {
    return (
      <Ellipse
        id={shape.id}
        x={shape.x}
        y={shape.y}
        offsetX={-shape.width / 2}
        offsetY={-shape.height / 2}
        radiusX={shape.width / 2}
        radiusY={shape.height / 2}
        rotation={shape.rotation}
        opacity={shape.opacity}
        visible={shape.visible}
        stroke={shape.stroke || undefined}
        strokeWidth={shape.strokeWidth}
        draggable={!shape.locked}
        fill={undefined}
        {...gradientKonvaProps}
        {...commonEvents}
      />
    )
  }

  return (
    <Ellipse
      id={shape.id}
      x={shape.x}
      y={shape.y}
      offsetX={-shape.width / 2}
      offsetY={-shape.height / 2}
      radiusX={shape.width / 2}
      radiusY={shape.height / 2}
      rotation={shape.rotation}
      opacity={shape.opacity}
      visible={shape.visible}
      fill={shape.fill || undefined}
      stroke={shape.stroke || undefined}
      strokeWidth={shape.strokeWidth}
      draggable={!shape.locked}
      {...commonEvents}
    />
  )
})
