import { create } from 'zustand'
import type * as Y from 'yjs'

interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoManager: Y.UndoManager | null

  setUndoManager: (um: Y.UndoManager) => void
  updateFlags: () => void
  undo: () => void
  redo: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  canUndo: false,
  canRedo: false,
  undoManager: null,

  setUndoManager: (um) => {
    const updateFlags = get().updateFlags
    um.on('stack-item-added', updateFlags)
    um.on('stack-item-popped', updateFlags)
    set({ undoManager: um })
    updateFlags()
  },

  updateFlags: () => {
    const um = get().undoManager
    if (!um) return
    set({
      canUndo: um.undoStack.length > 0,
      canRedo: um.redoStack.length > 0,
    })
  },

  undo: () => get().undoManager?.undo(),
  redo: () => get().undoManager?.redo(),
}))
