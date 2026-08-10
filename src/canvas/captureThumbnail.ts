import type Konva from 'konva'

export function captureThumbnail(stage: Konva.Stage): string | null {
  try {
    const canvasColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-canvas').trim() || '#111111'

    const pixelRatio = 0.5
    const stageCanvas = stage.toCanvas({ pixelRatio })

    const output = document.createElement('canvas')
    output.width = stageCanvas.width
    output.height = stageCanvas.height
    const ctx = output.getContext('2d')
    if (!ctx) return null

    // Fill with canvas background first, then draw stage content on top
    ctx.fillStyle = canvasColor
    ctx.fillRect(0, 0, output.width, output.height)
    ctx.drawImage(stageCanvas, 0, 0)

    return output.toDataURL('image/jpeg', 0.6)
  } catch {
    return null
  }
}
