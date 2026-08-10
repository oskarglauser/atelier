import React, { memo } from 'react'
import { Circle, Line, Group } from 'react-konva'
import { useUIStore } from '../store/uiStore'
import { usePenStore } from '../store/penStore'
import { useViewportStore } from '../store/viewportStore'
import { isNearPoint } from '../utils/math'

export const PenToolOverlay = memo(function PenToolOverlay() {
  const activeTool = useUIStore((s) => s.activeTool)
  const { points, currentPoint, isDrawing } = usePenStore()
  const zoom = useViewportStore((s) => s.zoom)

  if (activeTool !== 'pen' && !isDrawing) return null
  if (points.length === 0 && !currentPoint) return null

  const isNearFirst = isDrawing && points.length >= 2 && currentPoint
    ? isNearPoint(currentPoint.x, currentPoint.y, points[0].x, points[0].y, 10 / zoom)
    : false

  const pathSegments: React.JSX.Element[] = []
  const handleElements: React.JSX.Element[] = []
  const anchorElements: React.JSX.Element[] = []

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]

    anchorElements.push(
      <Circle
        key={`anchor-${i}`}
        x={pt.x}
        y={pt.y}
        radius={i === 0 && isNearFirst ? 6 : 4}
        fill={i === 0 && isNearFirst ? '#4a9eff' : '#ffffff'}
        stroke="#4a9eff"
        strokeWidth={1.5}
        listening={false}
      />
    )

    if (pt.handleOut) {
      handleElements.push(
        <Line
          key={`handle-out-line-${i}`}
          points={[pt.x, pt.y, pt.handleOut.x, pt.handleOut.y]}
          stroke="#4a9eff"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />,
        <Circle
          key={`handle-out-${i}`}
          x={pt.handleOut.x}
          y={pt.handleOut.y}
          radius={3}
          fill="#4a9eff"
          listening={false}
        />
      )
    }

    if (pt.handleIn) {
      handleElements.push(
        <Line
          key={`handle-in-line-${i}`}
          points={[pt.x, pt.y, pt.handleIn.x, pt.handleIn.y]}
          stroke="#4a9eff"
          strokeWidth={1}
          dash={[3, 3]}
          listening={false}
        />,
        <Circle
          key={`handle-in-${i}`}
          x={pt.handleIn.x}
          y={pt.handleIn.y}
          radius={3}
          fill="#4a9eff"
          listening={false}
        />
      )
    }

    if (i > 0) {
      const prev = points[i - 1]
      const segPoints = buildSegmentPoints(prev, pt)
      pathSegments.push(
        <Line
          key={`seg-${i}`}
          points={segPoints}
          stroke="#4a9eff"
          strokeWidth={2}
          listening={false}
          tension={0}
        />
      )
    }
  }

  if (currentPoint && points.length > 0) {
    const last = points[points.length - 1]
    const target = isNearFirst ? points[0] : { x: currentPoint.x, y: currentPoint.y }
    const segPoints = buildSegmentPoints(last, target)
    pathSegments.push(
      <Line
        key="seg-preview"
        points={segPoints}
        stroke="#4a9eff"
        strokeWidth={1.5}
        opacity={isNearFirst ? 0.7 : 0.5}
        dash={[4, 4]}
        listening={false}
      />
    )
  }

  return (
    <Group listening={false}>
      {pathSegments}
      {handleElements}
      {anchorElements}
    </Group>
  )
})

function buildSegmentPoints(from: { x: number; y: number; handleOut?: { x: number; y: number } }, to: { x: number; y: number; handleIn?: { x: number; y: number } }): number[] {
  const hasHandleOut = from.handleOut
  const hasHandleIn = to.handleIn

  if (!hasHandleOut && !hasHandleIn) {
    return [from.x, from.y, to.x, to.y]
  }

  const steps = 20
  const pts: number[] = []
  const cp1x = hasHandleOut ? from.handleOut!.x : from.x
  const cp1y = hasHandleOut ? from.handleOut!.y : from.y
  const cp2x = hasHandleIn ? to.handleIn!.x : to.x
  const cp2y = hasHandleIn ? to.handleIn!.y : to.y

  for (let t = 0; t <= steps; t++) {
    const s = t / steps
    pts.push(
      from.x * (1 - s) * (1 - s) * (1 - s) + 3 * cp1x * (1 - s) * (1 - s) * s + 3 * cp2x * (1 - s) * s * s + to.x * s * s * s,
      from.y * (1 - s) * (1 - s) * (1 - s) + 3 * cp1y * (1 - s) * (1 - s) * s + 3 * cp2y * (1 - s) * s * s + to.y * s * s * s
    )
  }

  return pts
}
