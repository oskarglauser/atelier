import { useShapes } from '../hooks/useShapes'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { updateShape, deleteShapes, reorderShape } from '../document/operations'
import { addPage, deletePage, renamePage } from '../document/createDoc'
import { useProjectStore } from '../projects/projectStore'
import { Square, Circle, Minus, Pen, Type, Image, Frame, Eye, EyeOff, Trash2, Group, ChevronRight, ChevronDown, Plus, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState, useRef } from 'react'

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

interface DragState {
  dragId: string
  overId: string | null
  position: 'above' | 'below' | 'inside'
}

export function LayersPanel() {
  const shapes = useShapes()
  const { selectedIds, setSelectedIds } = useUIStore()
  const { doc, pages, activePageId } = useDocument()
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const isOpen = useUIStore((s) => s.isLeftPanelOpen)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editPageName, setEditPageName] = useState('')
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null)
  const [editShapeName, setEditShapeName] = useState('')
  const dragRef = useRef<DragState | null>(null)

  if (!isOpen) return null

  const topLevel = [...shapes].reverse().filter((s) => !s.parentId)

  const toggleCollapsed = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setCollapsed(next)
  }

  const getChildren = (parentId: string) =>
    [...shapes].reverse().filter((s) => s.parentId === parentId)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const state: DragState = { dragId: id, overId: null, position: 'below' }
    dragRef.current = state
    setDragState(state)
  }

  const handleDragOver = (e: React.DragEvent, overId: string, isContainer: boolean) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top
    const h = rect.height

    let position: 'above' | 'below' | 'inside'
    if (isContainer) {
      if (y < h * 0.25) position = 'above'
      else if (y > h * 0.75) position = 'below'
      else position = 'inside'
    } else {
      position = y < h / 2 ? 'above' : 'below'
    }

    const dragId = dragRef.current?.dragId || ''
    if (overId === dragId) return

    // Skip re-render if nothing changed
    const prev = dragRef.current
    if (prev && prev.overId === overId && prev.position === position) return

    const newState = { dragId, overId: overId, position }
    dragRef.current = newState
    setDragState(newState)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const state = dragRef.current
    if (!state || !state.overId || state.dragId === state.overId) {
      setDragState(null)
      dragRef.current = null
      return
    }

    const { dragId, overId, position } = state
    const dragShape = shapes.find((s) => s.id === dragId)
    const overShape = shapes.find((s) => s.id === overId)
    if (!dragShape || !overShape) {
      setDragState(null)
      dragRef.current = null
      return
    }

    doc.transact(() => {
      if (position === 'inside' && (overShape.type === 'frame' || overShape.type === 'group')) {
        // Reparent into container
        updateShape(doc, activePageId, dragId, { parentId: overId })
      } else {
        // Determine new parentId based on the target's parent
        const newParentId = overShape.parentId
        if (dragShape.parentId !== newParentId) {
          updateShape(doc, activePageId, dragId, { parentId: newParentId })
        }

        // Find array index of the over shape and reorder
        // Shapes in the Yjs array are in forward order, layers panel shows reverse
        const arrayOrder = [...shapes]
        const overIdx = arrayOrder.findIndex((s) => s.id === overId)
        if (overIdx !== -1) {
          // In the Yjs array, higher index = rendered on top = appears first in layers panel
          // "above" in layers = higher z-order = higher index
          // "below" in layers = lower z-order = lower index
          const targetIdx = position === 'above' ? overIdx + 1 : overIdx
          reorderShape(doc, activePageId, dragId, targetIdx)
        }
      }
    }, 'local')

    setDragState(null)
    dragRef.current = null
  }

  const handleDragEnd = () => {
    setDragState(null)
    dragRef.current = null
  }

  const getDropIndicator = (shapeId: string) => {
    if (!dragState || dragState.overId !== shapeId) return null
    if (dragState.position === 'inside') return 'inside'
    return dragState.position
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

  const renderShape = (shape: typeof shapes[0], depth: number) => {
    const Icon = typeIcons[shape.type] || Square
    const isContainer = shape.type === 'group' || shape.type === 'frame'
    const children = isContainer ? getChildren(shape.id) : []
    const isCollapsed = collapsed.has(shape.id)
    const indicator = getDropIndicator(shape.id)

    return (
      <div key={shape.id} onDragEnd={handleDragEnd}>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, shape.id)}
          onDragOver={(e) => handleDragOver(e, shape.id, isContainer)}
          onDrop={handleDrop}
          onClick={(e) => {
            if (e.shiftKey) {
              const next = new Set(selectedIds)
              if (next.has(shape.id)) next.delete(shape.id)
              else next.add(shape.id)
              setSelectedIds(next)
            } else {
              setSelectedIds(new Set([shape.id]))
            }
          }}
          className={`relative flex items-center gap-1.5 px-3.5 h-7 cursor-pointer text-[13px] group transition-colors ${
            selectedIds.has(shape.id)
              ? 'bg-accent/15 text-text'
              : 'text-text-secondary hover:bg-bg-hover/50'
          } ${indicator === 'inside' ? 'ring-1 ring-inset ring-accent' : ''}`}
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
      <div className="flex-1 overflow-y-auto">
        {topLevel.length === 0 && (
          <div className="px-4 py-12 text-text-dim text-xs text-center">No layers</div>
        )}
        {topLevel.map((shape) => renderShape(shape, 0))}
      </div>
    </div>
  )
}
