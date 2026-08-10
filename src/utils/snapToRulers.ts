import type { Shape, FrameShape } from '../types/document'
import { snapValue, useCanvasStore } from '../store/canvasStore'

/** Combined grid + ruler snap. Use this instead of calling snapValue + snapToFrameRulers separately. */
export function snapWithRulers(x: number, y: number, shapes: Shape[]): { x: number; y: number } {
  let sx = snapValue(x)
  let sy = snapValue(y)
  if (useCanvasStore.getState().snapToRulers) {
    const frames = shapes.filter((s): s is FrameShape => s.type === 'frame' && !!s.rulers?.length)
    const rulerSnap = snapToFrameRulers(sx, sy, frames)
    sx = rulerSnap.x
    sy = rulerSnap.y
  }
  return { x: sx, y: sy }
}

export function snapToFrameRulers(
  x: number,
  y: number,
  frames: FrameShape[],
  threshold = 5
): { x: number; y: number } {
  let snappedX = x
  let snappedY = y

  for (const frame of frames) {
    // Check if point is inside the frame
    if (x < frame.x || x > frame.x + frame.width || y < frame.y || y > frame.y + frame.height) {
      continue
    }

    if (!frame.rulers || frame.rulers.length === 0) continue

    for (const ruler of frame.rulers) {
      if (ruler.axis === 'x') {
        const absPos = frame.x + ruler.position
        if (Math.abs(x - absPos) <= threshold) {
          snappedX = absPos
        }
      } else {
        const absPos = frame.y + ruler.position
        if (Math.abs(y - absPos) <= threshold) {
          snappedY = absPos
        }
      }
    }
  }

  return { x: snappedX, y: snappedY }
}
