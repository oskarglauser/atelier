import { create } from 'zustand'

export interface PenPoint {
  x: number
  y: number
  handleIn?: { x: number; y: number }
  handleOut?: { x: number; y: number }
}

interface PenState {
  points: PenPoint[]
  currentPoint: { x: number; y: number } | null
  isDragging: boolean
  dragStartIndex: number | null
  isDrawing: boolean

  addPoint: (point: PenPoint) => void
  updateLastPoint: (updates: Partial<PenPoint>) => void
  setCurrentPoint: (point: { x: number; y: number } | null) => void
  setIsDragging: (dragging: boolean, index?: number | null) => void
  setIsDrawing: (drawing: boolean) => void
  reset: () => void
  getPathData: (closed?: boolean) => string
}

export const usePenStore = create<PenState>((set, get) => ({
  points: [],
  currentPoint: null,
  isDragging: false,
  dragStartIndex: null,
  isDrawing: false,

  addPoint: (point) => set((s) => ({ points: [...s.points, point] })),

  updateLastPoint: (updates) => set((s) => {
    const pts = [...s.points]
    if (pts.length === 0) return s
    pts[pts.length - 1] = { ...pts[pts.length - 1], ...updates }
    return { points: pts }
  }),

  setCurrentPoint: (point) => set({ currentPoint: point }),
  setIsDragging: (dragging, index = null) => set({ isDragging: dragging, dragStartIndex: index }),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),

  reset: () => set({ points: [], currentPoint: null, isDragging: false, dragStartIndex: null, isDrawing: false }),

  getPathData: (closed) => {
    const { points } = get()
    if (points.length === 0) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

    let d = `M ${points[0].x} ${points[0].y}`

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const hasHandleOut = prev.handleOut
      const hasHandleIn = curr.handleIn

      if (hasHandleOut || hasHandleIn) {
        const cp1x = hasHandleOut ? prev.handleOut!.x : prev.x
        const cp1y = hasHandleOut ? prev.handleOut!.y : prev.y
        const cp2x = hasHandleIn ? curr.handleIn!.x : curr.x
        const cp2y = hasHandleIn ? curr.handleIn!.y : curr.y
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.x} ${curr.y}`
      } else {
        d += ` L ${curr.x} ${curr.y}`
      }
    }

    if (closed && points.length > 2) {
      const last = points[points.length - 1]
      const first = points[0]
      const hasHandleOut = last.handleOut
      const hasHandleIn = first.handleIn

      if (hasHandleOut || hasHandleIn) {
        const cp1x = hasHandleOut ? last.handleOut!.x : last.x
        const cp1y = hasHandleOut ? last.handleOut!.y : last.y
        const cp2x = hasHandleIn ? first.handleIn!.x : first.x
        const cp2y = hasHandleIn ? first.handleIn!.y : first.y
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${first.x} ${first.y}`
      }
      d += ' Z'
    }

    return d
  },
}))
