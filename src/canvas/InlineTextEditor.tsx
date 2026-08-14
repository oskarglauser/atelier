import { useEffect, useRef, useCallback } from 'react'
import type Konva from 'konva'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { useShapes } from '../hooks/useShapes'
import { useViewportStore } from '../store/viewportStore'
import { deleteShapes, updateShape } from '../document/operations'
import { loadGoogleFont } from '../fonts/fontLoader'
import type { TextShape } from '../types/document'

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
}

function getCursorOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return 0
  const range = sel.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(el)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

function setCursorOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let pos = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent?.length || 0
    if (pos + len >= offset) {
      const range = document.createRange()
      range.setStart(node, offset - pos)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
    pos += len
  }
}

function getKernStep(key: string, shiftKey: boolean): number {
  const delta = key === 'ArrowRight' ? 0.5 : -0.5
  return shiftKey ? delta * 5 : delta
}

export function InlineTextEditor({ stageRef: _stageRef }: Props) {
  const editingTextId = useUIStore((s) => s.editingTextId)
  const setEditingTextId = useUIStore((s) => s.setEditingTextId)
  const { doc, activePageId } = useDocument()
  const shapes = useShapes()
  const { zoom, offsetX, offsetY } = useViewportStore()
  const editorRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef('')
  const kerningRef = useRef<number[]>([])

  const found = editingTextId ? shapes.find((s) => s.id === editingTextId) : undefined
  const shape = found?.type === 'text' ? found as TextShape : undefined

  const applyKerningSpans = useCallback((el: HTMLElement, text: string, kerning: number[], letterSpacing: number) => {
    const z = useViewportStore.getState().zoom
    const hasKerning = kerning.some((k) => k !== 0)
    if (!hasKerning) {
      // If no kerning, use plain text (no spans)
      if (el.childElementCount > 0) {
        el.textContent = text
      }
      return
    }
    const chars = text.split('')
    el.innerHTML = ''
    chars.forEach((char, i) => {
      const span = document.createElement('span')
      span.textContent = char
      const k = kerning[i] || 0
      if (k !== 0) {
        span.style.letterSpacing = `${(letterSpacing + k) * z}px`
      }
      el.appendChild(span)
    })
  }, [])

  useEffect(() => {
    if (shape) {
      valueRef.current = shape.text
      kerningRef.current = shape.kerning || []
      loadGoogleFont(shape.fontFamily)
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.textContent = shape.text
          applyKerningSpans(editorRef.current, shape.text, kerningRef.current, shape.letterSpacing || 0)
          editorRef.current.focus()
          const sel = window.getSelection()
          if (sel) sel.selectAllChildren(editorRef.current)
        }
      }, 0)
    }
    // Re-initialize the editor only when a different shape enters editing — depending on
    // `shape` itself would reset content/selection on every live update while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape?.id, applyKerningSpans])

  const finishingRef = useRef(false)
  const finish = useCallback(() => {
    if (!editingTextId || finishingRef.current) return
    finishingRef.current = true
    const el = editorRef.current
    const text = el?.textContent || ''
    if (text.trim()) {
      const updates: Partial<TextShape> = { text, kerning: kerningRef.current }
      // Auto-fit height to content: the editor mirrors the shape's font
      // metrics at screen scale, so its scrollHeight is the content height.
      // Without this a new box stays one line tall and clips everything below.
      if (el) {
        const z = useViewportStore.getState().zoom
        const contentHeight = el.scrollHeight / z
        const minHeight = (shape?.fontSize ?? 16) * (shape?.lineHeight ?? 1.3)
        const fitted = Math.max(contentHeight, minHeight)
        if (Math.abs(fitted - (shape?.height ?? 0)) > 1) updates.height = fitted
      }
      updateShape(doc, activePageId, editingTextId, updates)
    } else {
      deleteShapes(doc, activePageId, new Set([editingTextId]))
      useUIStore.getState().clearSelection()
    }
    setEditingTextId(null)
    finishingRef.current = false
  }, [editingTextId, doc, activePageId, setEditingTextId, shape])

  const handleInput = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const cursorPos = getCursorOffset(el)
    const text = el.textContent || ''
    valueRef.current = text
    const newKerning = [...kerningRef.current]
    while (newKerning.length < text.length - 1) newKerning.push(0)
    if (newKerning.length > text.length - 1) newKerning.length = text.length - 1
    kerningRef.current = newKerning
    // Re-apply kerning spans if kerning is active
    if (newKerning.some((k) => k !== 0)) {
      applyKerningSpans(el, text, newKerning, shape?.letterSpacing || 0)
      requestAnimationFrame(() => setCursorOffset(el, cursorPos))
    }
  }, [applyKerningSpans, shape?.letterSpacing])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Commit, never discard — typed work must survive Escape, and the
      // empty-commit branch cleans up a cancelled new text box.
      finish()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      finish()
      return
    }

    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      e.stopPropagation()
      const el = editorRef.current
      if (!el || !editingTextId) return

      const step = getKernStep(e.key, e.shiftKey)
      const sel = window.getSelection()

      if (sel && !sel.isCollapsed) {
        const newSpacing = Math.round(((shape?.letterSpacing || 0) + step) * 10) / 10
        updateShape(doc, activePageId, editingTextId, { letterSpacing: newSpacing } as Partial<TextShape>)
      } else {
        const cursorPos = getCursorOffset(el)
        const gapIndex = cursorPos - 1
        if (gapIndex < 0) return

        const text = el.textContent || ''
        const newKerning = [...kerningRef.current]
        while (newKerning.length < text.length - 1) newKerning.push(0)

        newKerning[gapIndex] = Math.round((newKerning[gapIndex] + step) * 10) / 10
        kerningRef.current = newKerning
        updateShape(doc, activePageId, editingTextId, { kerning: newKerning } as Partial<TextShape>)

        const curText = el.textContent || ''
        applyKerningSpans(el, curText, newKerning, shape?.letterSpacing || 0)
        requestAnimationFrame(() => setCursorOffset(el, cursorPos))
      }
      return
    }

    e.stopPropagation()
  }, [finish, editingTextId, shape, doc, activePageId, applyKerningSpans])

  if (!shape || !editingTextId) return null

  const screenX = shape.x * zoom + offsetX
  const screenY = shape.y * zoom + offsetY
  const scaledFontSize = shape.fontSize * zoom
  const baseSpacing = (shape.letterSpacing || 0) * zoom

  const textTransformMap: Record<string, string> = {
    none: 'none', uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize',
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: Math.max(100, shape.width * zoom),
        minHeight: Math.max(scaledFontSize * shape.lineHeight + 4, (shape.height || 30) * zoom),
        outline: '2px solid var(--color-accent)',
        outlineOffset: -1,
        borderRadius: 2,
        zIndex: 100,
        transformOrigin: 'top left',
        transform: `rotate(${shape.rotation}deg)`,
        overflow: 'hidden',
      }}
    >
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={finish}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: scaledFontSize,
          fontFamily: shape.fontFamily,
          fontWeight: shape.fontWeight,
          fontStyle: shape.fontStyle,
          fontVariant: shape.fontVariant,
          lineHeight: shape.lineHeight,
          letterSpacing: baseSpacing,
          textAlign: shape.textAlign,
          textTransform: textTransformMap[shape.textTransform || 'none'] as React.CSSProperties['textTransform'],
          textDecoration: shape.textDecoration === 'none' ? 'none' : (shape.textDecoration || 'none'),
          color: shape.fill || '#000',
          background: 'transparent',
          outline: 'none',
          padding: 0,
          margin: 0,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          caretColor: 'var(--color-accent)',
        }}
      />
    </div>
  )
}
