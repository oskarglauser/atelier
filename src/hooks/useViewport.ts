import { useCallback } from 'react'
import type Konva from 'konva'
import { useViewportStore } from '../store/viewportStore'

export function useViewport() {
  const { zoom, setZoom, pan } = useViewportStore()

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = e.target.getStage()
    if (!stage) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    if (e.evt.ctrlKey || e.evt.metaKey) {
      const direction = e.evt.deltaY > 0 ? -1 : 1
      const factor = 1 + direction * 0.08
      setZoom(zoom * factor, pointer.x, pointer.y)
    } else {
      pan(-e.evt.deltaX, -e.evt.deltaY)
    }
  }, [zoom, setZoom, pan])

  return { onWheel }
}
