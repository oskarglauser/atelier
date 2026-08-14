import { Group, Rect, Text, Shape as KonvaShape } from 'react-konva'
import type { FrameShape as FrameShapeType, Shape } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { useViewportStore } from '../../store/viewportStore'
import { useCanvasStore } from '../../store/canvasStore'
import { FrameRulers } from './FrameRulers'
import { memo, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type Konva from 'konva'
import { getGradientProps } from '../utils/gradientProps'
import { drawGradientNoiseFill } from '../utils/gradientFill'
import { rectHitFunc } from '../utils/shapeHelpers'
import { armDragFromHandle } from '../utils/dragHandle'

interface Props {
  shape: FrameShapeType
  onSelect: (id: string, e: MouseEvent) => void
  childShapes?: Shape[]
  renderChild?: (child: Shape) => ReactNode
}

export const FrameShapeComponent = memo(function FrameShapeComponent({ shape, onSelect, childShapes, renderChild }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const setEditingFrameTitleId = useUIStore((s) => s.setEditingFrameTitleId)
  const isEditingTitle = useUIStore((s) => s.editingFrameTitleId === shape.id)
  const activeTool = useUIStore((s) => s.activeTool)
  const zoom = useViewportStore((s) => s.zoom)
  const showRulers = useCanvasStore((s) => s.showRulers)
  const fontSize = 11 / zoom
  const labelOffset = 18 / zoom
  const isGradient = shape.fillType === 'gradient' && shape.gradient
  const hasNoise = isGradient && shape.gradient!.noise > 0

  const gradientKonvaProps = useMemo(() => {
    if (!isGradient) return undefined
    return getGradientProps(shape.gradient!, shape.width, shape.height)
  }, [isGradient, shape.gradient, shape.width, shape.height])

  const strokeInfo = useMemo(() =>
    shape.stroke ? { color: shape.stroke, width: shape.strokeWidth || 1 } : undefined,
    [shape.stroke, shape.strokeWidth]
  )

  const noiseSceneFunc = useCallback((ctx: Konva.Context, konvaNode: Konva.Shape) => {
    const w = konvaNode.width()
    const h = konvaNode.height()
    const drawPath = (c: CanvasRenderingContext2D) => {
      c.beginPath()
      c.rect(0, 0, w, h)
    }
    drawGradientNoiseFill(ctx._context, w, h, shape.gradient!, drawPath, strokeInfo)
  }, [shape.gradient, strokeInfo])

  const bgElement = hasNoise ? (
    <KonvaShape
      width={shape.width}
      height={shape.height}
      sceneFunc={noiseSceneFunc}
      hitFunc={rectHitFunc}
    />
  ) : (
    <Rect
      width={shape.width}
      height={shape.height}
      {...(isGradient ? { fill: undefined, ...gradientKonvaProps } : { fill: shape.backgroundColor || '#ffffff' })}
      stroke={shape.stroke || undefined}
      strokeWidth={shape.stroke ? (shape.strokeWidth || 1) : 0}
    />
  )

  const groupRef = useRef<Konva.Group>(null)
  const titleRef = useRef<Konva.Text>(null)
  const cursorElRef = useRef<HTMLDivElement | null>(null)

  // The title doubles as a drag handle, so it owns the canvas cursor while
  // hovered; '' hands it back to the container's tool-driven cursor.
  const setCursor = useCallback((cursor: string) => {
    const container = titleRef.current?.getStage()?.container()
    if (!container) return
    container.style.cursor = cursor
    cursorElRef.current = cursor === '' ? null : container
  }, [])

  // Switching tools stops the shapes layer listening, so no mouseleave ever
  // arrives to clear a 'move' left over from hovering the title.
  useEffect(() => {
    if (activeTool !== 'select') setCursor('')
  }, [activeTool, setCursor])

  // A frame deleted or hidden mid-hover never fires mouseleave
  useEffect(() => () => {
    if (cursorElRef.current) cursorElRef.current.style.cursor = ''
  }, [])

  const syncTitle = useCallback(() => {
    if (groupRef.current && titleRef.current) {
      titleRef.current.x(groupRef.current.x())
      titleRef.current.y(groupRef.current.y())
    }
  }, [])

  return (
    <>
      <Text
        ref={titleRef}
        name={`frame-title-${shape.id}`}
        x={shape.x}
        y={shape.y}
        offsetY={labelOffset}
        rotation={shape.rotation}
        text={shape.name}
        fontSize={fontSize}
        fill="#666666"
        opacity={isEditingTitle ? 0 : shape.opacity}
        visible={shape.visible}
        onMouseDown={(e) => {
          if (isEditingTitle) return
          // Selection first — SelectionOverlay's dragstart reads selectedIds to
          // resolve roots, entourage and alt-duplicate for the gesture.
          onSelect(shape.id, e.evt)
          armDragFromHandle(groupRef.current, e)
        }}
        onDblClick={() => setEditingFrameTitleId(shape.id)}
        onDblTap={() => setEditingFrameTitleId(shape.id)}
        onMouseEnter={() => {
          setHoveredId(shape.id)
          if (!shape.locked && !isEditingTitle) setCursor('move')
        }}
        onMouseLeave={() => {
          setHoveredId(null)
          setCursor('')
        }}
      />
      <Group
        ref={groupRef}
        id={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation}
        opacity={shape.opacity}
        visible={shape.visible}
        draggable={!shape.locked}
        onDragEnd={() => {}}
        onDragMove={syncTitle}
        clipFunc={shape.clipContent ? (ctx) => {
          ctx.rect(0, 0, shape.width, shape.height)
        } : undefined}
        onMouseDown={(e) => onSelect(shape.id, e.evt)}
        onMouseEnter={() => setHoveredId(shape.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {bgElement}
        {childShapes && renderChild && (
          <Group x={-shape.x} y={-shape.y}>
            {childShapes.map((child) => renderChild(child))}
          </Group>
        )}
        {showRulers && <FrameRulers shape={shape} />}
      </Group>
    </>
  )
})
