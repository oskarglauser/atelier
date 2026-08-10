import { useEffect, useRef, useCallback } from 'react'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { useShapes } from '../hooks/useShapes'
import { useViewportStore } from '../store/viewportStore'
import { updateShape } from '../document/operations'

export function InlineFrameTitleEditor() {
  const editingFrameTitleId = useUIStore((s) => s.editingFrameTitleId)
  if (!editingFrameTitleId) return null
  return <InlineFrameTitleEditorInner editingId={editingFrameTitleId} />
}

function InlineFrameTitleEditorInner({ editingId }: { editingId: string }) {
  const setEditingFrameTitleId = useUIStore((s) => s.setEditingFrameTitleId)
  const { doc, activePageId } = useDocument()
  const shapes = useShapes()
  const { zoom, offsetX, offsetY } = useViewportStore()
  const inputRef = useRef<HTMLInputElement>(null)

  const shape = shapes.find((s) => s.id === editingId)

  const commit = useCallback(() => {
    if (!inputRef.current) return
    const value = inputRef.current.value.trim()
    if (value && shape && value !== shape.name) {
      updateShape(doc, activePageId, editingId, { name: value })
    }
    setEditingFrameTitleId(null)
  }, [doc, activePageId, editingId, shape, setEditingFrameTitleId])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        commit()
      }
    }
    // Delay to avoid the double-click that opened it from closing it
    const timeout = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(timeout); document.removeEventListener('mousedown', handler) }
  }, [commit])

  if (!shape || shape.type !== 'frame') return null

  const labelOffset = 18 / zoom
  const screenX = shape.x * zoom + offsetX
  const screenY = (shape.y - labelOffset) * zoom + offsetY
  const inputFontSize = 11

  return (
    <input
      ref={inputRef}
      defaultValue={shape.name}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditingFrameTitleId(null)
      }}
      onBlur={commit}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        fontSize: inputFontSize,
        fontFamily: 'system-ui, sans-serif',
        color: '#666666',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: 0,
        margin: 0,
        lineHeight: `${labelOffset * zoom}px`,
        height: labelOffset * zoom,
        minWidth: 40,
        zIndex: 9999,
      }}
    />
  )
}
