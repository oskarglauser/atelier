import { create } from 'zustand'
import { clamp } from '../utils/math'
import { MIN_ZOOM, MAX_ZOOM } from '../utils/constants'

interface ViewportState {
  zoom: number
  offsetX: number
  offsetY: number
  stageWidth: number
  stageHeight: number

  setZoom: (zoom: number, centerX?: number, centerY?: number) => void
  zoomIn: () => void
  zoomOut: () => void
  zoomToFit: (bounds?: { minX: number; minY: number; maxX: number; maxY: number }) => void
  setOffset: (x: number, y: number) => void
  pan: (dx: number, dy: number) => void
  setStageSize: (width: number, height: number) => void
}

export const useViewportStore = create<ViewportState>((set, get) => ({
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  stageWidth: 0,
  stageHeight: 0,

  setZoom: (newZoom, centerX, centerY) => {
    const z = clamp(newZoom, MIN_ZOOM, MAX_ZOOM)
    const state = get()
    if (centerX !== undefined && centerY !== undefined) {
      const scaleChange = z / state.zoom
      const newOffsetX = centerX - (centerX - state.offsetX) * scaleChange
      const newOffsetY = centerY - (centerY - state.offsetY) * scaleChange
      set({ zoom: z, offsetX: newOffsetX, offsetY: newOffsetY })
    } else {
      set({ zoom: z })
    }
  },

  zoomIn: () => {
    const { zoom, stageWidth, stageHeight } = get()
    get().setZoom(zoom * 1.2, stageWidth / 2, stageHeight / 2)
  },

  zoomOut: () => {
    const { zoom, stageWidth, stageHeight } = get()
    get().setZoom(zoom / 1.2, stageWidth / 2, stageHeight / 2)
  },

  zoomToFit: (bounds) => {
    if (!bounds) {
      set({ zoom: 1, offsetX: 0, offsetY: 0 })
      return
    }
    const { stageWidth, stageHeight } = get()
    const contentWidth = bounds.maxX - bounds.minX
    const contentHeight = bounds.maxY - bounds.minY
    if (contentWidth <= 0 || contentHeight <= 0 || stageWidth <= 0 || stageHeight <= 0) {
      set({ zoom: 1, offsetX: 0, offsetY: 0 })
      return
    }
    const padding = 80
    const availW = stageWidth - padding * 2
    const availH = stageHeight - padding * 2
    const newZoom = clamp(Math.min(availW / contentWidth, availH / contentHeight), MIN_ZOOM, MAX_ZOOM)
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const offsetX = stageWidth / 2 - centerX * newZoom
    const offsetY = stageHeight / 2 - centerY * newZoom
    set({ zoom: newZoom, offsetX, offsetY })
  },

  setOffset: (x, y) => set({ offsetX: x, offsetY: y }),

  pan: (dx, dy) => set((s) => ({ offsetX: s.offsetX + dx, offsetY: s.offsetY + dy })),

  setStageSize: (width, height) => set({ stageWidth: width, stageHeight: height }),
}))
