import { create } from 'zustand'

const STORAGE_KEY = 'atelier-canvas-settings'

export type ColorMode = 'rgb' | 'cmyk'
export type ExportScaleSetting = '0.5x' | '1x' | '2x' | '3x' | '4x'

interface CanvasSettings {
  backgroundColor: string
  showGrid: boolean
  gridSize: number
  snapToGrid: boolean
  snapToRulers: boolean
  showRulers: boolean
  colorMode: ColorMode
  lastExportFormat: string
  lastExportScale: ExportScaleSetting

  setBackgroundColor: (color: string) => void
  setShowGrid: (show: boolean) => void
  setGridSize: (size: number) => void
  setSnapToGrid: (snap: boolean) => void
  setSnapToRulers: (snap: boolean) => void
  setShowRulers: (show: boolean) => void
  setColorMode: (mode: ColorMode) => void
  setLastExport: (format: string, scale: string) => void
  setDefaultExportScale: (scale: ExportScaleSetting) => void
}

function loadSettings(): Partial<CanvasSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveSettings(state: CanvasSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      backgroundColor: state.backgroundColor,
      showGrid: state.showGrid,
      gridSize: state.gridSize,
      snapToGrid: state.snapToGrid,
      snapToRulers: state.snapToRulers,
      showRulers: state.showRulers,
      colorMode: state.colorMode,
      lastExportFormat: state.lastExportFormat,
      lastExportScale: state.lastExportScale,
    }))
  } catch { /* ignore */ }
}

const saved = loadSettings()

export const useCanvasStore = create<CanvasSettings>((set, get) => ({
  backgroundColor: saved.backgroundColor ?? '#f5f5f5',
  showGrid: saved.showGrid ?? true,
  gridSize: saved.gridSize ?? 25,
  snapToGrid: saved.snapToGrid ?? false,
  snapToRulers: saved.snapToRulers ?? false,
  showRulers: saved.showRulers ?? true,
  colorMode: (saved.colorMode as ColorMode) ?? 'rgb',
  lastExportFormat: (saved.lastExportFormat as string) || 'png',
  lastExportScale: (saved.lastExportScale as ExportScaleSetting) || '2x',

  setBackgroundColor: (color) => { set({ backgroundColor: color }); saveSettings({ ...get(), backgroundColor: color }) },
  setShowGrid: (show) => { set({ showGrid: show }); saveSettings({ ...get(), showGrid: show }) },
  setGridSize: (size) => { set({ gridSize: size }); saveSettings({ ...get(), gridSize: size }) },
  setSnapToGrid: (snap) => { set({ snapToGrid: snap }); saveSettings({ ...get(), snapToGrid: snap }) },
  setSnapToRulers: (snap) => { set({ snapToRulers: snap }); saveSettings({ ...get(), snapToRulers: snap }) },
  setShowRulers: (show) => { set({ showRulers: show }); saveSettings({ ...get(), showRulers: show }) },
  setColorMode: (mode) => { set({ colorMode: mode }); saveSettings({ ...get(), colorMode: mode }) },
  setLastExport: (format, scale) => {
    const exportScale = scale as ExportScaleSetting
    set({ lastExportFormat: format, lastExportScale: exportScale })
    saveSettings({ ...get(), lastExportFormat: format, lastExportScale: exportScale })
  },
  setDefaultExportScale: (scale) => {
    set({ lastExportScale: scale })
    saveSettings({ ...get(), lastExportScale: scale })
  },
}))

export function snapValue(v: number): number {
  const { snapToGrid, gridSize } = useCanvasStore.getState()
  if (!snapToGrid) return v
  return Math.round(v / gridSize) * gridSize
}
