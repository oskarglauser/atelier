import type Konva from 'konva'

/** Shared rectangular hit function for Konva shapes — stable reference, no deps */
export const rectHitFunc = (ctx: Konva.Context, ks: Konva.Shape) => {
  ctx.beginPath()
  ctx.rect(0, 0, ks.width(), ks.height())
  ctx.closePath()
  ctx.fillStrokeShape(ks)
}

/** No-op handler for onDragEnd (required by Konva for draggable nodes) */
export const NOOP = () => {}
