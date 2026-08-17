import { Path } from 'react-konva'
import type { PathShape as PathShapeType } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useMemo } from 'react'
import { getGradientProps } from '../utils/gradientProps'

interface Props {
  shape: PathShapeType
  onSelect: (id: string, e: MouseEvent) => void
}

export const PathShapeComponent = memo(function PathShapeComponent({ shape, onSelect }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const hasFill = !!shape.fill && shape.fill !== 'transparent'
  const isGradient = shape.fillType === 'gradient' && shape.gradient

  const gradientKonvaProps = useMemo(() => {
    if (!isGradient) return undefined
    return getGradientProps(shape.gradient!, shape.width, shape.height)
  }, [isGradient, shape.gradient, shape.width, shape.height])

  return (
    <Path
      id={shape.id}
      x={shape.x}
      y={shape.y}
      data={shape.pathData}
      fillRule={shape.fillRule ?? 'nonzero'}
      {...(isGradient ? { fill: undefined, ...gradientKonvaProps } : { fill: shape.fill || undefined })}
      stroke={shape.stroke || undefined}
      strokeWidth={shape.strokeWidth}
      scaleX={shape.scaleX ?? 1}
      scaleY={shape.scaleY ?? 1}
      rotation={shape.rotation}
      opacity={shape.opacity}
      visible={shape.visible}
      hitStrokeWidth={hasFill || isGradient ? 0 : 20}
      draggable={!shape.locked}
      onDragEnd={() => {}}
      onMouseDown={(e) => onSelect(shape.id, e.evt)}
      onMouseEnter={() => setHoveredId(shape.id)}
      onMouseLeave={() => setHoveredId(null)}
    />
  )
})
