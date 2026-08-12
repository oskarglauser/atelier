import { create } from 'zustand'
import type { ToolType } from '../types/tools'

interface UIState {
  activeTool: ToolType
  selectedIds: Set<string>
  hoveredId: string | null
  /** Frame highlighted as the drop target during a canvas drag */
  dropTargetFrameId: string | null
  editingTextId: string | null
  editingFrameTitleId: string | null
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  isShortcutHelpOpen: boolean

  setActiveTool: (tool: ToolType) => void
  setSelectedIds: (ids: Set<string>) => void
  addToSelection: (id: string) => void
  removeFromSelection: (id: string) => void
  clearSelection: () => void
  setHoveredId: (id: string | null) => void
  setDropTargetFrameId: (id: string | null) => void
  setEditingTextId: (id: string | null) => void
  setEditingFrameTitleId: (id: string | null) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  setShortcutHelpOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  selectedIds: new Set(),
  hoveredId: null,
  dropTargetFrameId: null,
  editingTextId: null,
  editingFrameTitleId: null,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,
  isShortcutHelpOpen: false,

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
  // No-ops when unchanged — called at pointer-move frequency during drags
  setDropTargetFrameId: (id) =>
    set((s) => (s.dropTargetFrameId === id ? s : { dropTargetFrameId: id })),
  setEditingTextId: (id) => set({ editingTextId: id }),
  setEditingFrameTitleId: (id) => set({ editingFrameTitleId: id }),
  toggleLeftPanel: () => set((s) => ({ isLeftPanelOpen: !s.isLeftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ isRightPanelOpen: !s.isRightPanelOpen })),
  setShortcutHelpOpen: (open) => set({ isShortcutHelpOpen: open }),
}))
