import type { GradientFill } from '../../types/document'
import { getGradientProps } from './gradientProps'
import { getNoiseCanvas } from './noisePattern'

/**
 * Draw a gradient fill (with optional noise overlay and stroke) into a canvas context.
 * `drawPath` should call ctx.beginPath() and draw the clip path (rect, ellipse, roundedRect, etc).
 */
export function drawGradientNoiseFill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gradient: GradientFill,
  drawPath: (ctx: CanvasRenderingContext2D) => void,
  stroke?: { color: string; width: number },
) {
  const gp = getGradientProps(gradient, w, h)

  drawPath(ctx)

  const grad = ctx.createLinearGradient(
    gp.fillLinearGradientStartPointX, gp.fillLinearGradientStartPointY,
    gp.fillLinearGradientEndPointX, gp.fillLinearGradientEndPointY,
  )
  const stops = gp.fillLinearGradientColorStops
  for (let i = 0; i < stops.length; i += 2) {
    grad.addColorStop(stops[i] as number, stops[i + 1] as string)
  }
  ctx.fillStyle = grad
  ctx.fill()

  if (gradient.noise > 0) {
    ctx.save()
    ctx.clip()
    const noiseCanvas = getNoiseCanvas(gradient.noise)
    const pattern = ctx.createPattern(noiseCanvas, 'repeat')
    if (pattern) {
      ctx.fillStyle = pattern
      ctx.fill()
    }
    ctx.restore()
  }

  if (stroke) {
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.stroke()
  }
}
