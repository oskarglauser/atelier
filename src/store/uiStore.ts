import { create } from 'zustand'
import type { ToolType } from '../types/tools'

interface UIState {
  activeTool: ToolType
  selectedIds: Set<string>
  hoveredId: string | null
  editingTextId: string | null
  editingFrameTitleId: string | null
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean

  setActiveTool: (tool: ToolType) => void
  setSelectedIds: (ids: Set<string>) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  clearSelection: () => void
  setHoveredId: (id: string | null) => void
  setEditingTextId: (id: string | null) => void
  setEditingFrameTitleId: (id: string | null) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  selectedIds: new Set(),
  hoveredId: null,
  editingTextId: null,
  editingFrameTitleId: null,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,

  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  addToSelection: (id) => set((s) => {
    const next = new Set(s.selectedIds)
    next.add(id)
    return { selectedIds: next }
  }),
  removeFromSelection: (id) => set((s) => {
    const next = new Set(s.selectedIds)
    next.delete(id)
    return { selectedIds: next }
  }),
  clearSelection: () => set({ selectedIds: new Set() }),
  setHoveredId: (id) => set({ hoveredId: id }),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setEditingFrameTitleId: (id) => set({ editingFrameTitleId: id }),
  toggleLeftPanel: () => set((s) => ({ isLeftPanelOpen: !s.isLeftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ isRightPanelOpen: !s.isRightPanelOpen })),
}))
