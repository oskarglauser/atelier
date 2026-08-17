import { useShapes } from '../hooks/useShapes'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useDocument } from '../hooks/useDocument'
import { updateShape, deleteShapes, moveShapes, type MoveDestination } from '../document/operations'
import { getDescendants, selectionRoots } from '../document/hierarchy'
import { addPage, deletePage, renamePage } from '../document/createDoc'
import { useProjectStore } from '../projects/projectStore'
import { Square, Circle, Minus, Pen, Type, Image, Frame, Eye, EyeOff, Trash2, Group, ChevronRight, ChevronDown, Plus, FileText, Scissors } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { Shape } from '../types/document'

const typeIcons: Record<string, LucideIcon> = {
  rectangle: Square,
  ellipse: Circle,
  line: Minus,
  path: Pen,
  text: Type,
  image: Image,
  frame: Frame,
  group: Group,
}

const DRAG_THRESHOLD = 4
const AUTOSCROLL_BAND = 28
const AUTOSCROLL_MAX_SPEED = 14
const EXPAND_HOVER_DELAY = 500

type DropTarget =
  | { kind: 'row'; id: string; zone: 'above' | 'below' | 'inside' }
  | { kind: 'root-bottom' }
  | null

/** Hot-path drag state, kept in a ref; a minimal mirror drives rendering */
interface PanelDrag {
  phase: 'pending' | 'active'
  pressedId: string
  draggedIds: string[]
  /** Dragged ids + all their descendants — no drop may land on or inside these */
  invalidTargets: Set<string>
  startX: number
  startY: number
  pointerY: number
  target: DropTarget
  valid: boolean
}

interface PanelDragMirror {
  target: DropTarget
  valid: boolean
  ghostLabel: string
  ghostCount: number
  draggedIds: string[]
}

export function LayersPanel() {
  const shapes = useShapes()
  const { selectedIds, setSelectedIds } = useUIStore()
  const { doc, pages, activePageId } = useDocument()
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const isOpen = useUIStore((s) => s.isLeftPanelOpen)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<PanelDragMirror | null>(null)
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editPageName, setEditPageName] = useState('')
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null)
  const [editShapeName, setEditShapeName] = useState('')

  const dragRef = useRef<PanelDrag | null>(null)
  const shapesLiveRef = useRef(shapes)
  const ghostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const expandTimerRef = useRef<{ id: string; timer: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    shapesLiveRef.current = shapes
  }, [shapes])

  // Cancel any in-flight drag on unmount
  useEffect(() => () => cleanupRef.current?.(), [])

  const clearExpandTimer = () => {
    if (expandTimerRef.current) {
      window.clearTimeout(expandTimerRef.current.timer)
      expandTimerRef.current = null
    }
  }

  const startDrag = useCallback((e: React.PointerEvent, pressedId: string) => {
    if (e.button !== 0) return
    // Don't start drags from the row's buttons or the rename input
    if ((e.target as HTMLElement).closest('button, input')) return

    dragRef.current = {
      phase: 'pending',
      pressedId,
      draggedIds: [],
      invalidTargets: new Set(),
      startX: e.clientX,
      startY: e.clientY,
      pointerY: e.clientY,
      target: null,
      valid: false,
    }

    const syncMirror = () => {
      const d = dragRef.current
      if (!d || d.phase !== 'active') return
      const all = shapesLiveRef.current
      const first = all.find((s) => s.id === d.draggedIds[0])
      setDrag({
        target: d.target,
        valid: d.valid,
        ghostLabel: first?.name ?? '',
        ghostCount: d.draggedIds.length,
        draggedIds: d.draggedIds,
      })
    }

    const autoScrollTick = () => {
      const d = dragRef.current
      const container = scrollRef.current
      if (!d || d.phase !== 'active' || !container) return
      const rect = container.getBoundingClientRect()
      const fromTop = d.pointerY - rect.top
      const fromBottom = rect.bottom - d.pointerY
      if (fromTop < AUTOSCROLL_BAND && fromTop > -40) {
        container.scrollTop -= AUTOSCROLL_MAX_SPEED * (1 - Math.max(0, fromTop) / AUTOSCROLL_BAND)
      } else if (fromBottom < AUTOSCROLL_BAND && fromBottom > -40) {
        container.scrollTop += AUTOSCROLL_MAX_SPEED * (1 - Math.max(0, fromBottom) / AUTOSCROLL_BAND)
      }
      rafRef.current = requestAnimationFrame(autoScrollTick)
    }

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      d.pointerY = ev.clientY

      if (d.phase === 'pending') {
        if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < DRAG_THRESHOLD) return
        // Activate: dragging an unselected row selects it; dragging a selected
        // row moves the whole selection (top-most members only)
        const all = shapesLiveRef.current
        const selection = useUIStore.getState().selectedIds
        let dragged: string[]
        if (selection.has(d.pressedId)) {
          dragged = selectionRoots(all, selection).map((s) => s.id).reverse() // panel order
        } else {
          useUIStore.getState().setSelectedIds(new Set([d.pressedId]))
          dragged = [d.pressedId]
        }
        const invalid = new Set(dragged)
        for (const id of dragged) {
          for (const desc of getDescendants(all, id)) invalid.add(desc.id)
        }
        d.phase = 'active'
        d.draggedIds = dragged
        d.invalidTargets = invalid
        suppressClickRef.current = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
        rafRef.current = requestAnimationFrame(autoScrollTick)
        syncMirror()
      }

      // Ghost follows the pointer without re-rendering
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 8}px)`
      }

      const all = shapesLiveRef.current
      const byId = new Map(all.map((s) => [s.id, s]))

      // Resolve the drop target from whatever is under the pointer
      const el = document.elementFromPoint(ev.clientX, ev.clientY)
      const rowEl = el?.closest?.('[data-layer-id]') as HTMLElement | null
      let target: DropTarget = null
      if (rowEl) {
        const overId = rowEl.dataset.layerId!
        const over = byId.get(overId)
        if (over) {
          const rect = rowEl.getBoundingClientRect()
          const y = ev.clientY - rect.top
          const isCont = over.type === 'frame' || over.type === 'group'
          let zone: 'above' | 'below' | 'inside'
          if (isCont) {
            zone = y < rect.height * 0.25 ? 'above' : y > rect.height * 0.75 ? 'below' : 'inside'
          } else {
            zone = y < rect.height / 2 ? 'above' : 'below'
          }
          target = { kind: 'row', id: overId, zone }
        }
      } else if (scrollRef.current) {
        // Empty space below the last row → drop at the root bottom
        const rect = scrollRef.current.getBoundingClientRect()
        if (
          ev.clientX >= rect.left && ev.clientX <= rect.right &&
          ev.clientY >= rect.top && ev.clientY <= rect.bottom
        ) {
          target = { kind: 'root-bottom' }
        }
      }

      // Validate: never drop onto a dragged row or into the dragged subtree
      let valid = false
      if (target?.kind === 'row') {
        const over = byId.get(target.id)
        const prospectiveParent =
          target.zone === 'inside' ? target.id : over?.parentId ?? null
        valid =
          !!over &&
          !d.invalidTargets.has(target.id) &&
          (prospectiveParent === null || !d.invalidTargets.has(prospectiveParent)) &&
          (target.zone !== 'inside' ||
            ((over.type === 'frame' || over.type === 'group') && !over.locked))
      } else if (target?.kind === 'root-bottom') {
        valid = true
      }

      // Auto-expand a collapsed container after hovering "inside" it
      const hoverId = target?.kind === 'row' && target.zone === 'inside' && valid ? target.id : null
      if (expandTimerRef.current && expandTimerRef.current.id !== hoverId) clearExpandTimer()
      if (hoverId && !expandTimerRef.current) {
        expandTimerRef.current = {
          id: hoverId,
          timer: window.setTimeout(() => {
            setCollapsed((prev) => {
              if (!prev.has(hoverId)) return prev
              const next = new Set(prev)
              next.delete(hoverId)
              return next
            })
            expandTimerRef.current = null
          }, EXPAND_HOVER_DELAY),
        }
      }

      const changed =
        JSON.stringify(d.target) !== JSON.stringify(target) || d.valid !== valid
      d.target = target
      d.valid = valid
      document.body.style.cursor = !target || valid ? 'grabbing' : 'not-allowed'
      if (changed) syncMirror()
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      clearExpandTimer()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      dragRef.current = null
      cleanupRef.current = null
      setDrag(null)
    }

    const onUp = () => {
      const d = dragRef.current
      if (d && d.phase === 'active' && d.valid && d.target) {
        let dest: MoveDestination | null = null
        if (d.target.kind === 'row') {
          const t = d.target
          dest =
            t.zone === 'inside' ? { kind: 'inside', containerId: t.id }
            : t.zone === 'above' ? { kind: 'above-anchor', anchorId: t.id }
            : { kind: 'below-anchor', anchorId: t.id }
          if (t.zone === 'inside') {
            setCollapsed((prev) => {
              if (!prev.has(t.id)) return prev
              const next = new Set(prev)
              next.delete(t.id)
              return next
            })
          }
        } else {
          dest = { kind: 'root-bottom' }
        }
        if (dest) {
          // One undo step per drop, never merged with earlier edits
          useHistoryStore.getState().undoManager?.stopCapturing()
          moveShapes(doc, activePageId, d.draggedIds, dest)
        }
      }
      cleanup()
    }

    const onCancel = () => cleanup()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cleanup()
    }

    cleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
  }, [doc, activePageId])

  if (!isOpen) return null

  // Match the canvas root rule so shapes with dangling parentIds stay visible
  const containerIds = new Set(shapes.filter((s) => s.type === 'frame' || s.type === 'group').map((s) => s.id))
  const topLevel = [...shapes].reverse().filter((s) => !s.parentId || !containerIds.has(s.parentId))

  const toggleCollapsed = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }

  const childrenOf = (parentId: string) =>
    [...shapes].reverse().filter((s) => s.parentId === parentId)

  const getDropIndicator = (shapeId: string): 'above' | 'below' | 'inside' | null => {
    if (!drag?.valid || drag.target?.kind !== 'row' || drag.target.id !== shapeId) return null
    return drag.target.zone
  }

  const handleAddPage = () => {
    const id = addPage(doc)
    setActivePageId(id)
  }

  const handleStartRenamePage = (id: string, name: string) => {
    setEditingPageId(id)
    setEditPageName(name)
  }

  const handleFinishRenamePage = () => {
    if (editingPageId && editPageName.trim()) {
      renamePage(doc, editingPageId, editPageName.trim())
    }
    setEditingPageId(null)
  }

  const handleDeletePage = (id: string) => {
    if (pages.length <= 1) return
    const idx = pages.findIndex((p) => p.id === id)
    const nextPage = pages[idx === 0 ? 1 : idx - 1]
    deletePage(doc, id)
    if (activePageId === id && nextPage) {
      setActivePageId(nextPage.id)
    }
  }

  const renderShape = (shape: Shape, depth: number) => {
    const Icon = typeIcons[shape.type] || Square
    const isContainer = shape.type === 'group' || shape.type === 'frame'
    const children = isContainer ? childrenOf(shape.id) : []
    const isCollapsed = collapsed.has(shape.id)
    const indicator = getDropIndicator(shape.id)
    const isDraggedRow = drag !== null && drag.draggedIds.includes(shape.id)

    return (
      <div key={shape.id}>
        <div
          data-layer-id={shape.id}
          onPointerDown={(e) => startDrag(e, shape.id)}
          onClick={(e) => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false
              return
            }
            if (e.shiftKey) {
              const next = new Set(selectedIds)
              if (next.has(shape.id)) next.delete(shape.id)
              else next.add(shape.id)
              setSelectedIds(next)
            } else {
              setSelectedIds(new Set([shape.id]))
            }
          }}
          className={`relative flex items-center gap-1.5 px-3.5 h-7 cursor-pointer select-none text-[13px] group transition-colors ${
            selectedIds.has(shape.id)
              ? 'bg-accent/15 text-text'
              : 'text-text-secondary hover:bg-bg-hover/50'
          } ${indicator === 'inside' ? 'ring-1 ring-inset ring-accent' : ''} ${
            isDraggedRow ? 'opacity-50' : ''
          }`}
          style={{ paddingLeft: 14 + depth * 16 }}
        >
          {indicator === 'above' && (
            <div className="absolute top-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
          )}
          {indicator === 'below' && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
          )}
          {isContainer && children.length > 0 ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleCollapsed(shape.id) }}
              className="w-3 shrink-0 text-text-dim"
            >
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <Icon size={12} className="opacity-50 shrink-0" strokeWidth={1.5} />
          {shape.isMask && (
            <Scissors size={10} className="shrink-0 text-accent/80" strokeWidth={1.5} aria-label="Mask" />
          )}
          {editingShapeId === shape.id ? (
            <input
              autoFocus
              value={editShapeName}
              onChange={(e) => setEditShapeName(e.target.value)}
              onBlur={() => {
                if (editShapeName.trim()) {
                  updateShape(doc, activePageId, shape.id, { name: editShapeName.trim() })
                }
                setEditingShapeId(null)
              }}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  if (editShapeName.trim()) {
                    updateShape(doc, activePageId, shape.id, { name: editShapeName.trim() })
                  }
                  setEditingShapeId(null)
                }
                if (e.key === 'Escape') setEditingShapeId(null)
              }}
              className="flex-1 bg-transparent outline-none text-[13px] min-w-0"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setEditingShapeId(shape.id)
                setEditShapeName(shape.name)
              }}
            >
              {shape.name}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              updateShape(doc, activePageId, shape.id, { visible: !shape.visible })
            }}
            className="opacity-0 group-hover:opacity-40 hover:!opacity-80 shrink-0 transition-opacity"
            title={shape.visible ? 'Hide' : 'Show'}
          >
            {shape.visible ? <Eye size={12} strokeWidth={1.5} /> : <EyeOff size={12} strokeWidth={1.5} />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteShapes(doc, activePageId, new Set([shape.id]))
              // Drop it (and anything it contained) from the selection —
              // otherwise the properties panel and transformer keep pointing
              // at shapes that no longer exist.
              const gone = new Set([shape.id, ...getDescendants(shapes, shape.id).map((d) => d.id)])
              if ([...selectedIds].some((id) => gone.has(id))) {
                setSelectedIds(new Set([...selectedIds].filter((id) => !gone.has(id))))
              }
            }}
            className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-danger shrink-0 transition-opacity"
            title="Delete"
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </button>
        </div>
        {isContainer && !isCollapsed && children.map((child) => renderShape(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="w-56 bg-bg-secondary border-r border-border flex flex-col shrink-0 overflow-hidden">
      {/* Pages section */}
      <div className="flex items-center justify-between px-3.5 h-9 shrink-0">
        <span className="text-text-dim text-[11px] font-semibold uppercase tracking-widest">Pages</span>
        <button
          onClick={handleAddPage}
          className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-text rounded transition-colors"
          title="Add page"
        >
          <Plus size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div className="px-1.5 pb-1.5 shrink-0">
        {pages.map((page) => (
          <div
            key={page.id}
            onClick={() => setActivePageId(page.id)}
            onDoubleClick={() => handleStartRenamePage(page.id, page.name)}
            className={`flex items-center gap-1.5 px-2 h-7 rounded-md cursor-pointer text-[13px] group transition-colors ${
              page.id === activePageId
                ? 'bg-accent/15 text-text'
                : 'text-text-secondary hover:bg-bg-hover/50'
            }`}
          >
            <FileText size={12} className="opacity-50 shrink-0" strokeWidth={1.5} />
            {editingPageId === page.id ? (
              <input
                autoFocus
                value={editPageName}
                onChange={(e) => setEditPageName(e.target.value)}
                onBlur={handleFinishRenamePage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRenamePage()
                  if (e.key === 'Escape') setEditingPageId(null)
                }}
                className="flex-1 bg-transparent outline-none text-[13px] min-w-0"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate">{page.name}</span>
            )}
            {pages.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id) }}
                className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-danger shrink-0 transition-opacity"
              >
                <Trash2 size={11} strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Layers section */}
      <div className="h-9 flex items-center px-3.5 text-text-dim text-[11px] font-semibold uppercase tracking-widest shrink-0">
        Layers
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        {topLevel.length === 0 && (
          <div className="px-4 py-12 text-text-dim text-xs text-center">No layers</div>
        )}
        {topLevel.map((shape) => renderShape(shape, 0))}
        {drag?.valid && drag.target?.kind === 'root-bottom' && (
          <div className="h-0.5 mx-2 bg-accent rounded-full" />
        )}
      </div>

      {/* Drag ghost */}
      {drag && (
        <div
          ref={ghostRef}
          className={`fixed left-0 top-0 z-50 pointer-events-none px-2 py-1 rounded-md border text-[12px] shadow-lg flex items-center gap-1.5 ${
            drag.target && !drag.valid
              ? 'bg-danger/10 border-danger/40 text-danger'
              : 'bg-bg-secondary border-border text-text'
          }`}
        >
          <span className="truncate max-w-40">{drag.ghostLabel}</span>
          {drag.ghostCount > 1 && (
            <span className="text-text-dim shrink-0">+{drag.ghostCount - 1}</span>
          )}
        </div>
      )}
    </div>
  )
}
