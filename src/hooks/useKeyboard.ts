import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useViewportStore } from '../store/viewportStore'
import { useDocument } from './useDocument'
import { addShape, deleteShapes, duplicateShapes, updateShape, groupShapes, ungroupShapes, getAllShapes, cloneSubtrees, insertShapes, bringToFront, sendToBack } from '../document/operations'
import { selectionRoots, getDescendants, resolveParentForBounds } from '../document/hierarchy'
import { getShapesBounds } from '../utils/math'
import { outlineSelectedText } from '../operations/textToOutlines'

import { NUDGE_AMOUNT, NUDGE_AMOUNT_SHIFT } from '../utils/constants'
import type { ToolType } from '../types/tools'
import type { Shape } from '../types/document'

let clipboardShapes: Shape[] = []
let clipboardRootIds: string[] = []

/** Selection roots plus all their descendants, in array order */
function captureSelection(all: Shape[], selectedIds: Set<string>): { shapes: Shape[]; rootIds: string[] } {
  const roots = selectionRoots(all, selectedIds)
  const memberIds = new Set<string>()
  for (const r of roots) {
    memberIds.add(r.id)
    for (const d of getDescendants(all, r.id)) memberIds.add(d.id)
  }
  return { shapes: all.filter((s) => memberIds.has(s.id)), rootIds: roots.map((r) => r.id) }
}

const toolShortcuts: Record<string, ToolType> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  e: 'ellipse',
  o: 'ellipse',
  l: 'line',
  p: 'pen',
  d: 'freehand',
  b: 'freehand',
  t: 'text',
  i: 'image',
}

export function useKeyboard() {
  const { doc, activePageId } = useDocument()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const { selectedIds, setSelectedIds, setActiveTool, clearSelection, setShortcutHelpOpen, isShortcutHelpOpen } = useUIStore.getState()
      const { undo, redo } = useHistoryStore.getState()
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (isShortcutHelpOpen) return

      if (!meta && !e.altKey && e.key === '?') {
        e.preventDefault()
        setShortcutHelpOpen(true)
        return
      }

      if (meta && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }

      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useViewportStore.getState().zoomIn()
        return
      }

      if (meta && e.key === '-') {
        e.preventDefault()
        useViewportStore.getState().zoomOut()
        return
      }

      if (meta && e.key === '0') {
        e.preventDefault()
        const { stageWidth, stageHeight } = useViewportStore.getState()
        useViewportStore.getState().setZoom(1, stageWidth / 2, stageHeight / 2)
        return
      }

      if (!meta && !e.altKey && e.shiftKey && e.code === 'Digit1') {
        e.preventDefault()
        const all = getAllShapes(doc, activePageId)
        useViewportStore.getState().zoomToFit(all.length > 0 ? getShapesBounds(all) : undefined)
        return
      }

      if (!meta && !e.altKey && e.shiftKey && e.code === 'Digit2') {
        e.preventDefault()
        if (selectedIds.size > 0) {
          const selected = getAllShapes(doc, activePageId).filter((shape) => selectedIds.has(shape.id))
          if (selected.length > 0) useViewportStore.getState().zoomToFit(getShapesBounds(selected))
        }
        return
      }

      if (!meta && !e.altKey && e.shiftKey && e.code === 'Digit0') {
        e.preventDefault()
        const { stageWidth, stageHeight } = useViewportStore.getState()
        useViewportStore.getState().setZoom(1, stageWidth / 2, stageHeight / 2)
        return
      }

      if (!meta && !e.altKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        useViewportStore.getState().zoomIn()
        return
      }

      if (!meta && !e.altKey && e.key === '-') {
        e.preventDefault()
        useViewportStore.getState().zoomOut()
        return
      }

      if (meta && key === 'a') {
        e.preventDefault()
        const all = getAllShapes(doc, activePageId)
        setSelectedIds(new Set(all.map((s) => s.id)))
        return
      }

      if (meta && key === 'd') {
        e.preventDefault()
        if (selectedIds.size > 0) {
          const newIds = duplicateShapes(doc, activePageId, selectedIds)
          setSelectedIds(new Set(newIds))
        }
        return
      }

      // Copy: Cmd+C — captures whole subtrees so frames keep their children
      if (meta && key === 'c' && !e.shiftKey) {
        if (selectedIds.size > 0) {
          const captured = captureSelection(getAllShapes(doc, activePageId), selectedIds)
          clipboardShapes = captured.shapes
          clipboardRootIds = captured.rootIds
        }
        return
      }

      // Cut: Cmd+X
      if (meta && key === 'x') {
        if (selectedIds.size > 0) {
          const captured = captureSelection(getAllShapes(doc, activePageId), selectedIds)
          clipboardShapes = captured.shapes
          clipboardRootIds = captured.rootIds
          deleteShapes(doc, activePageId, selectedIds)
          clearSelection()
        }
        return
      }

      // Paste: Cmd+V — deep clones with fresh ids; each pasted root's parent
      // is re-resolved at the pasted position (the copied parentId is stale)
      if (meta && key === 'v') {
        if (clipboardShapes.length > 0) {
          e.preventDefault()
          const { zoom, offsetX, offsetY } = useViewportStore.getState()
          const centerX = (window.innerWidth / 2 - offsetX) / zoom
          const centerY = (window.innerHeight / 2 - offsetY) / zoom

          const { minX, minY, maxX, maxY } = getShapesBounds(clipboardShapes)
          const offsetDx = centerX - (minX + maxX) / 2 + 20
          const offsetDy = centerY - (minY + maxY) / 2 + 20

          useHistoryStore.getState().undoManager?.stopCapturing()
          const newRootIds: string[] = []
          doc.transact(() => {
            const current = getAllShapes(doc, activePageId)
            for (const sub of cloneSubtrees(clipboardShapes, clipboardRootIds, offsetDx, offsetDy)) {
              const rootClone = sub.clones.find((c) => c.id === sub.rootCloneId)!
              rootClone.parentId = resolveParentForBounds(current, {
                x: rootClone.x,
                y: rootClone.y,
                width: rootClone.width || 0,
                height: rootClone.height || 0,
              })
              insertShapes(doc, activePageId, sub.clones)
              newRootIds.push(rootClone.id)
            }
          }, 'local')
          setSelectedIds(new Set(newRootIds))
        }
        return
      }

      // Group: Cmd+G
      if (meta && key === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.size >= 2) {
          const groupId = groupShapes(doc, activePageId, selectedIds)
          if (groupId) setSelectedIds(new Set([groupId]))
        }
        return
      }

      // Ungroup: Cmd+Shift+G
      if (meta && key === 'g' && e.shiftKey) {
        e.preventDefault()
        if (selectedIds.size > 0) {
          const all = getAllShapes(doc, activePageId)
          const groupIds = new Set<string>()
          const childIds = new Set<string>()

          selectedIds.forEach((id) => {
            const shape = all.find((s) => s.id === id)
            if (shape?.type === 'group') {
              groupIds.add(id)
              all.forEach((s) => {
                if (s.parentId === id) childIds.add(s.id)
              })
            }
          })

          if (groupIds.size > 0) {
            ungroupShapes(doc, activePageId, groupIds)
            setSelectedIds(childIds)
          }
        }
        return
      }

      if (meta && e.shiftKey && e.code === 'BracketRight' && selectedIds.size > 0) {
        e.preventDefault()
        bringToFront(doc, activePageId, selectedIds)
        return
      }

      if (meta && e.shiftKey && e.code === 'BracketLeft' && selectedIds.size > 0) {
        e.preventDefault()
        sendToBack(doc, activePageId, selectedIds)
        return
      }

      if (meta && e.shiftKey && key === 'l' && selectedIds.size > 0) {
        e.preventDefault()
        const all = getAllShapes(doc, activePageId)
        const selected = all.filter((shape) => selectedIds.has(shape.id))
        const nextLocked = !selected.every((shape) => shape.locked)
        doc.transact(() => {
          selected.forEach((shape) => updateShape(doc, activePageId, shape.id, { locked: nextLocked }))
        }, 'local')
        return
      }

      if (meta && e.shiftKey && key === 'h' && selectedIds.size > 0) {
        e.preventDefault()
        const all = getAllShapes(doc, activePageId)
        const selected = all.filter((shape) => selectedIds.has(shape.id))
        const nextVisible = selected.every((shape) => !shape.visible)
        doc.transact(() => {
          selected.forEach((shape) => updateShape(doc, activePageId, shape.id, { visible: nextVisible }))
        }, 'local')
        return
      }

      if (meta && e.shiftKey && key === 'o' && selectedIds.size > 0) {
        e.preventDefault()
        void outlineSelectedText(doc, activePageId, selectedIds).then((outlineIds) => {
          if (outlineIds.length > 0) useUIStore.getState().setSelectedIds(new Set(outlineIds))
        })
        return
      }

      if (meta && !e.shiftKey && ['b', 'i', 'u'].includes(key) && selectedIds.size > 0) {
        const all = getAllShapes(doc, activePageId)
        const textShapes = all.filter((shape) => selectedIds.has(shape.id) && shape.type === 'text')
        if (textShapes.length > 0) {
          e.preventDefault()
          doc.transact(() => {
            for (const shape of textShapes) {
              if (shape.type !== 'text') continue
              if (key === 'b') {
                updateShape(doc, activePageId, shape.id, { fontWeight: shape.fontWeight >= 600 ? 400 : 700 })
              } else if (key === 'i') {
                updateShape(doc, activePageId, shape.id, { fontStyle: shape.fontStyle === 'italic' ? 'normal' : 'italic' })
              } else {
                updateShape(doc, activePageId, shape.id, { textDecoration: shape.textDecoration === 'underline' ? 'none' : 'underline' })
              }
            }
          }, 'local')
          return
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        deleteShapes(doc, activePageId, selectedIds)
        clearSelection()
        return
      }

      if (e.key === 'Escape') {
        clearSelection()
        setActiveTool('select')
        return
      }

      const nudge = e.shiftKey ? NUDGE_AMOUNT_SHIFT : NUDGE_AMOUNT
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedIds.size > 0) {
        e.preventDefault()
        const dx = e.key === 'ArrowLeft' ? -nudge : e.key === 'ArrowRight' ? nudge : 0
        const dy = e.key === 'ArrowUp' ? -nudge : e.key === 'ArrowDown' ? nudge : 0
        // Move selection roots together with their descendants — child
        // coordinates are absolute, so nudging a frame must carry its contents
        const all = getAllShapes(doc, activePageId)
        const roots = selectionRoots(all, selectedIds)
        doc.transact(() => {
          for (const r of roots) {
            updateShape(doc, activePageId, r.id, { x: r.x + dx, y: r.y + dy })
            for (const d of getDescendants(all, r.id)) {
              updateShape(doc, activePageId, d.id, { x: d.x + dx, y: d.y + dy })
            }
          }
        }, 'local')
        return
      }

      if (!meta && !e.altKey && toolShortcuts[key]) {
        setActiveTool(toolShortcuts[key])
      }
    }

    const pasteHandler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) return

          const reader = new FileReader()
          reader.onload = () => {
            const src = reader.result as string
            const img = new window.Image()
            img.onload = () => {
              const { zoom, offsetX, offsetY } = useViewportStore.getState()
              const centerX = (window.innerWidth / 2 - offsetX) / zoom
              const centerY = (window.innerHeight / 2 - offsetY) / zoom
              // Clipboard images from a Retina screen carry device pixels
              // (a 400pt capture is 800px on a 2x display). Place them at
              // their logical size so they match what was captured; the full
              // pixel data is kept, so they stay sharp when zoomed or exported.
              const dpr = window.devicePixelRatio || 1
              const w = img.width / dpr
              const h = img.height / dpr
              const current = getAllShapes(doc, activePageId)
              const bounds = { x: centerX - w / 2, y: centerY - h / 2, width: w, height: h }
              const shape = addShape(doc, activePageId, 'image', {
                ...bounds,
                src,
                parentId: resolveParentForBounds(current, bounds),
              })
              useUIStore.getState().setSelectedIds(new Set([shape.id]))
            }
            img.src = src
          }
          reader.readAsDataURL(file)
          return
        }
      }
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('paste', pasteHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('paste', pasteHandler)
    }
  }, [doc, activePageId])
}
