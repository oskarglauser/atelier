import { Line } from 'react-konva'
import type { FrameShape } from '../../types/document'
import { useViewportStore } from '../../store/viewportStore'
import { memo } from 'react'

interface Props {
  shape: FrameShape
}

export const FrameRulers = memo(function FrameRulers({ shape }: Props) {
  const zoom = useViewportStore((s) => s.zoom)

  if (!shape.rulers || shape.rulers.length === 0) return null

  const dashSize = 4 / zoom
  const sw = 1 / zoom

  return (
    <>
      {shape.rulers.map((ruler) => {
        if (ruler.axis === 'x') {
          // Vertical line at ruler.position from left
          return (
            <Line
              key={ruler.id}
              points={[ruler.position, 0, ruler.position, shape.height]}
              stroke="rgba(0, 180, 255, 0.35)"
              strokeWidth={sw}
              dash={[dashSize, dashSize]}
              listening={false}
            />
          )
        } else {
          // Horizontal line at ruler.position from top
          return (
            <Line
              key={ruler.id}
              points={[0, ruler.position, shape.width, ruler.position]}
              stroke="rgba(0, 180, 255, 0.35)"
              strokeWidth={sw}
              dash={[dashSize, dashSize]}
              listening={false}
            />
          )
        }
      })}
    </>
  )
})
