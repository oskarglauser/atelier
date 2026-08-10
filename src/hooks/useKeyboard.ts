import { useEffect } from 'react'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useViewportStore } from '../store/viewportStore'
import { useDocument } from './useDocument'
import { addShape, deleteShapes, duplicateShapes, updateShape, groupShapes, ungroupShapes, getAllShapes } from '../document/operations'
import { getShapesBounds } from '../utils/math'

import { NUDGE_AMOUNT, NUDGE_AMOUNT_SHIFT } from '../utils/constants'
import type { ToolType } from '../types/tools'
import type { Shape } from '../types/document'

let clipboardShapes: Shape[] = []

const toolShortcuts: Record<string, ToolType> = {
  v: 'select',
  f: 'frame',
  r: 'rectangle',
  e: 'ellipse',
  l: 'line',
  p: 'pen',
  d: 'freehand',
  t: 'text',
}

export function useKeyboard() {
  const { doc, activePageId } = useDocument()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const { selectedIds, setSelectedIds, setActiveTool, clearSelection } = useUIStore.getState()
      const { undo, redo } = useHistoryStore.getState()
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 'z') {
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

      if (meta && e.key === 'a') {
        e.preventDefault()
        const all = getAllShapes(doc, activePageId)
        setSelectedIds(new Set(all.map((s) => s.id)))
        return
      }

      if (meta && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.size > 0) {
          const newIds = duplicateShapes(doc, activePageId, selectedIds)
          setSelectedIds(new Set(newIds))
        }
        return
      }

      // Copy: Cmd+C
      if (meta && e.key === 'c' && !e.shiftKey) {
        if (selectedIds.size > 0) {
          clipboardShapes = getAllShapes(doc, activePageId).filter((s) => selectedIds.has(s.id))
        }
        return
      }

      // Cut: Cmd+X
      if (meta && e.key === 'x') {
        if (selectedIds.size > 0) {
          clipboardShapes = getAllShapes(doc, activePageId).filter((s) => selectedIds.has(s.id))
          deleteShapes(doc, activePageId, selectedIds)
          clearSelection()
        }
        return
      }

      // Paste: Cmd+V
      if (meta && e.key === 'v') {
        if (clipboardShapes.length > 0) {
          e.preventDefault()
          const { zoom, offsetX, offsetY } = useViewportStore.getState()
          const centerX = (window.innerWidth / 2 - offsetX) / zoom
          const centerY = (window.innerHeight / 2 - offsetY) / zoom

          // Calculate clipboard bounds center
          const { minX, minY, maxX, maxY } = getShapesBounds(clipboardShapes)
          const clipCenterX = (minX + maxX) / 2
          const clipCenterY = (minY + maxY) / 2
          const offsetDx = centerX - clipCenterX + 20
          const offsetDy = centerY - clipCenterY + 20

          const newIds: string[] = []
          for (const original of clipboardShapes) {
            const shape = addShape(doc, activePageId, original.type, {
              ...original,
              x: original.x + offsetDx,
              y: original.y + offsetDy,
            })
            newIds.push(shape.id)
          }
          setSelectedIds(new Set(newIds))
        }
        return
      }

      // Group: Cmd+G
      if (meta && e.key === 'g' && !e.shiftKey) {
        e.preventDefault()
        if (selectedIds.size >= 2) {
          const groupId = groupShapes(doc, activePageId, selectedIds)
          if (groupId) setSelectedIds(new Set([groupId]))
        }
        return
      }

      // Ungroup: Cmd+Shift+G
      if (meta && e.key === 'g' && e.shiftKey) {
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
        selectedIds.forEach((id) => {
          const shapes = doc.getArray(`page:${activePageId}:shapes`)
          for (let i = 0; i < shapes.length; i++) {
            const map = shapes.get(i) as import('yjs').Map<unknown>
            if (map.get('id') === id) {
              updateShape(doc, activePageId, id, {
                x: (map.get('x') as number) + dx,
                y: (map.get('y') as number) + dy,
              })
              break
            }
          }
        })
        return
      }

      if (!meta && !e.altKey && toolShortcuts[e.key]) {
        setActiveTool(toolShortcuts[e.key])
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
              const maxDim = 400
              let w = img.width
              let h = img.height
              if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h)
                w *= scale
                h *= scale
              }
              const shape = addShape(doc, activePageId, 'image', {
                x: centerX - w / 2, y: centerY - h / 2,
                width: w, height: h,
                src,
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
