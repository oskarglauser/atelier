import { memo } from 'react'
import { Shape as KonvaShape } from 'react-konva'
import { useViewportStore } from '../store/viewportStore'
import { useCanvasStore } from '../store/canvasStore'

function getLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export const Grid = memo(function Grid() {
  const { zoom, offsetX, offsetY, stageWidth, stageHeight } = useViewportStore()
  const showGrid = useCanvasStore((s) => s.showGrid)
  const gridSize = useCanvasStore((s) => s.gridSize)
  const backgroundColor = useCanvasStore((s) => s.backgroundColor)

  if (!showGrid || zoom < 0.3) return null

  const spacing = gridSize
  const dotRadius = (zoom >= 2 ? 0.5 : 1) / zoom
  const bgLum = getLuminance(backgroundColor || '#fafafa')
  const dotColor = bgLum > 0.5 ? '#000000' : '#ffffff'
  const opacity = zoom >= 2 ? 0.05 : 0.08

  const startX = Math.floor((-offsetX / zoom) / spacing) * spacing
  const endX = Math.ceil((-offsetX / zoom + stageWidth / zoom) / spacing) * spacing
  const startY = Math.floor((-offsetY / zoom) / spacing) * spacing
  const endY = Math.ceil((-offsetY / zoom + stageHeight / zoom) / spacing) * spacing

  return (
    <KonvaShape
      listening={false}
      sceneFunc={(ctx) => {
        ctx.fillStyle = dotColor
        ctx.globalAlpha = opacity
        for (let x = startX; x <= endX; x += spacing) {
          for (let y = startY; y <= endY; y += spacing) {
            ctx.beginPath()
            ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.globalAlpha = 1
      }}
    />
  )
})
