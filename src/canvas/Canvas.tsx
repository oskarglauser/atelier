import { useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { setStageRef } from '../store/stageRef'
import { Stage, Layer, Line as KonvaLine, Rect as KonvaRect, Ellipse as KonvaEllipse } from 'react-konva'
import type Konva from 'konva'
import { useShapes } from '../hooks/useShapes'
import { useViewport } from '../hooks/useViewport'
import { useViewportStore } from '../store/viewportStore'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { usePenStore } from '../store/penStore'
import { useCanvasStore, snapValue } from '../store/canvasStore'
import { snapWithRulers } from '../utils/snapToRulers'
import { addShape, updateShape, reorderShape, deleteShapes, duplicateShapes, groupShapes, ungroupShapes, getAllShapes, bringToFront, sendToBack } from '../document/operations'
import { performBooleanOp } from '../operations/booleanOps'
import { textToOutlines } from '../operations/textToOutlines'
import type { Shape, TextShape } from '../types/document'
import { resolveParentForBounds, isFullyContained } from '../document/hierarchy'
import { simplifyPath, pointsToSvgPath, getPointsBounds } from '../utils/path'
import { getShapesBounds, isNearPoint } from '../utils/math'
import { shapesToSvgString } from '../utils/exportShape'
import { ShapeRenderer } from './ShapeRenderer'
import { SelectionOverlay } from './SelectionOverlay'
import { DropTargetHighlight } from './DropTargetHighlight'
import { SelectionBox } from './SelectionBox'
import { Grid } from './Grid'
import { InlineTextEditor } from './InlineTextEditor'
import { InlineFrameTitleEditor } from './InlineFrameTitleEditor'
import { PenToolOverlay } from './PenToolOverlay'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { Copy, Clipboard, Trash2, CopyPlus, ArrowUpToLine, ArrowDownToLine, Group, Ungroup, Merge, Minus as MinusIcon, SquaresIntersect, Diff, TypeOutline, ImageIcon, FileCode } from 'lucide-react'

export function Canvas() {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shapes = useShapes()
  const shapesMap = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])
  const rootShapes = useMemo(() => {
    const containerIds = new Set(
      shapes.filter((s) => s.type === 'frame' || s.type === 'group').map((s) => s.id)
    )
    return shapes.filter((s) => !s.parentId || !containerIds.has(s.parentId))
  }, [shapes])
  const { onWheel } = useViewport()
  const { zoom, offsetX, offsetY, setStageSize } = useViewportStore()
  const { activeTool, selectedIds, setSelectedIds, clearSelection, setActiveTool, setEditingTextId } = useUIStore()
  const { doc, activePageId } = useDocument()
  const penStore = usePenStore()

  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const selectionOrigin = useRef<{ x: number; y: number } | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createStart, setCreateStart] = useState<{ x: number; y: number } | null>(null)
  const [createEnd, setCreateEnd] = useState<{ x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [penDragStart, setPenDragStart] = useState<{ x: number; y: number } | null>(null)
  const freehandPointsRef = useRef<{ x: number; y: number }[]>([])
  const [freehandPoints, setFreehandPoints] = useState<{ x: number; y: number }[]>([])
  const [isDrawingFreehand, setIsDrawingFreehand] = useState(false)
  const spaceHeldRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  useEffect(() => {
    if (stageRef.current) setStageRef(stageRef.current)
    return () => setStageRef(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setStageSize(entry.contentRect.width, entry.contentRect.height)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [setStageSize])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !(e.target as HTMLElement).isContentEditable && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault()
        spaceHeldRef.current = true
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const getPointerPos = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    return {
      x: (pointer.x - offsetX) / zoom,
      y: (pointer.y - offsetY) / zoom,
    }
  }, [zoom, offsetX, offsetY])

  const finishPenPath = useCallback((closed = false) => {
    if (penStore.points.length < 2) { penStore.reset(); setActiveTool('select'); return }

    const xs = penStore.points.map((p) => p.x)
    const ys = penStore.points.map((p) => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)

    // Offset all points so path data is relative to (minX, minY)
    const offsetPoints = penStore.points.map((p) => ({
      x: p.x - minX,
      y: p.y - minY,
      handleIn: p.handleIn ? { x: p.handleIn.x - minX, y: p.handleIn.y - minY } : undefined,
      handleOut: p.handleOut ? { x: p.handleOut.x - minX, y: p.handleOut.y - minY } : undefined,
    }))

    // Build path data from offset points
    let d = `M ${offsetPoints[0].x} ${offsetPoints[0].y}`
    for (let i = 1; i < offsetPoints.length; i++) {
      const prev = offsetPoints[i - 1]
      const curr = offsetPoints[i]
      if (prev.handleOut || curr.handleIn) {
        const cp1x = prev.handleOut ? prev.handleOut.x : prev.x
        const cp1y = prev.handleOut ? prev.handleOut.y : prev.y
        const cp2x = curr.handleIn ? curr.handleIn.x : curr.x
        const cp2y = curr.handleIn ? curr.handleIn.y : curr.y
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.x} ${curr.y}`
      } else {
        d += ` L ${curr.x} ${curr.y}`
      }
    }
    if (closed && offsetPoints.length > 2) {
      const last = offsetPoints[offsetPoints.length - 1]
      const first = offsetPoints[0]
      if (last.handleOut || first.handleIn) {
        const cp1x = last.handleOut ? last.handleOut.x : last.x
        const cp1y = last.handleOut ? last.handleOut.y : last.y
        const cp2x = first.handleIn ? first.handleIn.x : first.x
        const cp2y = first.handleIn ? first.handleIn.y : first.y
        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${first.x} ${first.y}`
      }
      d += ' Z'
    }

    const penBounds = { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 }
    const newShape = addShape(doc, activePageId, 'path', {
      ...penBounds,
      pathData: d,
      closed,
      fill: closed ? '#000000' : '',
      stroke: '#000000',
      strokeWidth: 2,
      parentId: resolveParentForBounds(shapes, penBounds),
    })
    useUIStore.getState().setSelectedIds(new Set([newShape.id]))
    penStore.reset()
    setActiveTool('select')
  }, [penStore, doc, activePageId, setActiveTool, shapes])

  // Find the topmost container (group/frame) parent for a shape
  const getContainerParent = useCallback((startId: string): string | null => {
    const walk = (id: string, depth: number): string | null => {
      if (depth > 20) return null
      const shape = shapesMap.get(id)
      if (!shape?.parentId) return null
      const parent = shapesMap.get(shape.parentId)
      if (!parent || (parent.type !== 'group' && parent.type !== 'frame')) return null
      return walk(parent.id, depth + 1) || parent.id
    }
    return walk(startId, 0)
  }, [shapesMap])

  const onSelect = useCallback((id: string, e: MouseEvent) => {
    if (activeTool !== 'select') return

    // Single click: if the shape is inside a group/frame, select the container
    // unless the container is already selected (then select the child to "enter")
    let targetId = id
    const containerId = getContainerParent(id)
    if (containerId && !selectedIds.has(containerId)) {
      targetId = containerId
    }

    if (e.shiftKey || e.metaKey) {
      const next = new Set(selectedIds)
      if (next.has(targetId)) next.delete(targetId)
      else next.add(targetId)
      setSelectedIds(next)
    } else {
      if (!selectedIds.has(targetId)) {
        setSelectedIds(new Set([targetId]))
      }
    }
  }, [activeTool, selectedIds, setSelectedIds, getContainerParent])

  const onDblClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool !== 'select') return
    const target = e.target
    const id = target.id()
    if (!id) return
    // Double-click: select the child directly, bypassing container grouping
    const shape = shapesMap.get(id)
    if (shape?.parentId) {
      const parent = shapesMap.get(shape.parentId)
      if (parent && (parent.type === 'group' || parent.type === 'frame')) {
        setSelectedIds(new Set([id]))
      }
    }
  }, [activeTool, shapesMap, setSelectedIds])

  const handlePointerDown = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    const pos = getPointerPos()
    if (!pos) return

    if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.altKey) || (e.evt.button === 0 && spaceHeld)) {
      setIsPanning(true)
      setPanStart({ x: e.evt.clientX, y: e.evt.clientY })
      return
    }

    if (activeTool === 'freehand') {
      const snapped = { x: snapValue(pos.x), y: snapValue(pos.y) }
      setIsDrawingFreehand(true)
      freehandPointsRef.current = [snapped]
      setFreehandPoints([snapped])
      return
    }

    if (activeTool === 'pen') {
      const snapped = { x: snapValue(pos.x), y: snapValue(pos.y) }
      // Close path if clicking near the first point
      if (penStore.isDrawing && penStore.points.length >= 2) {
        const first = penStore.points[0]
        if (isNearPoint(pos.x, pos.y, first.x, first.y, 10 / zoom)) {
          finishPenPath(true)
          return
        }
      }
      penStore.addPoint({ x: snapped.x, y: snapped.y })
      penStore.setIsDrawing(true)
      setPenDragStart(snapped)
      penStore.setIsDragging(true, penStore.points.length)
      return
    }

    if (activeTool === 'select') {
      const target = e.target
      const stage = stageRef.current
      if (target === stage) {
        clearSelection()
        selectionOrigin.current = { x: pos.x, y: pos.y }
        setSelectionBox({ x: pos.x, y: pos.y, width: 0, height: 0 })
      }
      return
    }

    if (['rectangle', 'ellipse', 'frame', 'line'].includes(activeTool)) {
      setIsCreating(true)
      const snapped = snapWithRulers(pos.x, pos.y, shapes)
      setCreateStart(snapped)
    }

    if (activeTool === 'text') {
      // 300×36 = the schema's default text bounds
      const newShape = addShape(doc, activePageId, 'text', {
        x: pos.x,
        y: pos.y,
        parentId: resolveParentForBounds(shapes, { x: pos.x, y: pos.y, width: 300, height: 36 }),
      })
      setSelectedIds(new Set([newShape.id]))
      setEditingTextId(newShape.id)
      setActiveTool('select')
    }

    if (activeTool === 'image') {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          const src = reader.result as string
          const img = new window.Image()
          img.onload = () => {
            const maxDim = 400
            let w = img.width
            let h = img.height
            if (w > maxDim || h > maxDim) {
              const scale = maxDim / Math.max(w, h)
              w *= scale
              h *= scale
            }
            // Resolve the parent against a fresh snapshot — the file dialog is
            // async and the captured `shapes` may be stale by now
            const current = getAllShapes(doc, activePageId)
            addShape(doc, activePageId, 'image', {
              x: pos.x, y: pos.y,
              width: w, height: h,
              src,
              parentId: resolveParentForBounds(current, { x: pos.x, y: pos.y, width: w, height: h }),
            })
          }
          img.src = src
        }
        reader.readAsDataURL(file)
      }
      input.click()
      setActiveTool('select')
    }
  }, [activeTool, getPointerPos, clearSelection, doc, activePageId, setActiveTool, penStore, spaceHeld, finishPenPath, setEditingTextId, setSelectedIds, shapes, zoom])

  const handlePointerMove = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    if (isPanning && panStart) {
      const dx = e.evt.clientX - panStart.x
      const dy = e.evt.clientY - panStart.y
      useViewportStore.getState().setOffset(
        useViewportStore.getState().offsetX + dx,
        useViewportStore.getState().offsetY + dy
      )
      setPanStart({ x: e.evt.clientX, y: e.evt.clientY })
      return
    }

    const pos = getPointerPos()
    if (!pos) return

    if (activeTool === 'freehand' && isDrawingFreehand) {
      const snapped = { x: snapValue(pos.x), y: snapValue(pos.y) }
      freehandPointsRef.current.push(snapped)
      setFreehandPoints([...freehandPointsRef.current])
      return
    }

    if (activeTool === 'pen') {
      if (penStore.isDragging && penDragStart) {
        const sx = snapValue(pos.x)
        const sy = snapValue(pos.y)
        const dx = sx - penDragStart.x
        const dy = sy - penDragStart.y
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          penStore.updateLastPoint({
            handleOut: { x: penDragStart.x + dx, y: penDragStart.y + dy },
            handleIn: { x: penDragStart.x - dx, y: penDragStart.y - dy },
          })
        }
      } else if (penStore.isDrawing) {
        penStore.setCurrentPoint({ x: snapValue(pos.x), y: snapValue(pos.y) })
      }
      return
    }

    if (selectionBox && selectionOrigin.current) {
      const origin = selectionOrigin.current
      const box = {
        x: Math.min(origin.x, pos.x),
        y: Math.min(origin.y, pos.y),
        width: Math.abs(pos.x - origin.x),
        height: Math.abs(pos.y - origin.y),
      }
      setSelectionBox(box)

      // Live-update selection during drag
      const ids = new Set<string>()
      shapes.forEach((s: Shape) => {
        if (
          s.x < box.x + box.width &&
          s.x + s.width > box.x &&
          s.y < box.y + box.height &&
          s.y + s.height > box.y
        ) {
          ids.add(s.id)
        }
      })
      // Resolve children to their topmost container (same as single-click behavior)
      const resolvedIds = new Set<string>()
      ids.forEach((id) => {
        const containerId = getContainerParent(id)
        resolvedIds.add(containerId || id)
      })
      setSelectedIds(resolvedIds)
    }

    if (isCreating && createStart) {
      const snappedPos = snapWithRulers(pos.x, pos.y, shapes)
      setCreateEnd(snappedPos)
      setSelectionBox({
        x: Math.min(createStart.x, snappedPos.x),
        y: Math.min(createStart.y, snappedPos.y),
        width: Math.abs(snappedPos.x - createStart.x),
        height: Math.abs(snappedPos.y - createStart.y),
      })
    }
  }, [isPanning, panStart, selectionBox, isCreating, createStart, getPointerPos, activeTool, penStore, penDragStart, isDrawingFreehand, getContainerParent, setSelectedIds, shapes])

  const handlePointerUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false)
      setPanStart(null)
      return
    }

    if (activeTool === 'freehand' && isDrawingFreehand) {
      setIsDrawingFreehand(false)
      const pts = freehandPointsRef.current
      if (pts.length >= 2) {
        const simplified = simplifyPath(pts, 1.5)
        const { minX, minY, maxX, maxY } = getPointsBounds(simplified)
        const normalized = simplified.map((p) => ({ x: p.x - minX, y: p.y - minY }))
        const freehandBounds = { x: minX, y: minY, width: maxX - minX || 1, height: maxY - minY || 1 }
        const newShape = addShape(doc, activePageId, 'path', {
          ...freehandBounds,
          pathData: pointsToSvgPath(normalized),
          closed: false,
          fill: '',
          stroke: '#000000',
          strokeWidth: 2,
          parentId: resolveParentForBounds(shapes, freehandBounds),
        })
        setSelectedIds(new Set([newShape.id]))
      }
      freehandPointsRef.current = []
      setFreehandPoints([])
      setActiveTool('select')
      return
    }

    if (activeTool === 'pen') {
      penStore.setIsDragging(false)
      setPenDragStart(null)
      return
    }

    if (selectionBox && !isCreating) {
      selectionOrigin.current = null
      setSelectionBox(null)
    }

    if (isCreating && createStart) {
      const rawPos = getPointerPos()
      if (rawPos) {
        const pos = snapWithRulers(rawPos.x, rawPos.y, shapes)
        const x = Math.min(createStart.x, pos.x)
        const y = Math.min(createStart.y, pos.y)
        const width = Math.abs(pos.x - createStart.x)
        const height = Math.abs(pos.y - createStart.y)

        if (width > 2 || height > 2) {
          const type = activeTool === 'frame' ? 'frame' : activeTool as 'rectangle' | 'ellipse' | 'line'
          let newShape

          if (type === 'line') {
            newShape = addShape(doc, activePageId, 'line', {
              x: createStart.x,
              y: createStart.y,
              points: [0, 0, pos.x - createStart.x, pos.y - createStart.y],
              width,
              height,
              // Containment uses the normalized min corner, not the (possibly
              // bottom-right) drag start the shape itself is anchored to
              parentId: resolveParentForBounds(shapes, { x, y, width, height }),
            })
          } else if (type !== 'frame') {
            newShape = addShape(doc, activePageId, type, {
              x, y, width, height,
              parentId: resolveParentForBounds(shapes, { x, y, width, height }),
            })
          } else {
            // A frame drawn inside another frame nests into it
            const frameParentId = resolveParentForBounds(shapes, { x, y, width, height })
            // Adopt unlocked siblings at the same level that the drawn rect
            // fully contains (full containment on purpose: the center rule
            // would swallow half-overlapping neighbors)
            const enclosed = shapes.filter((s) =>
              (s.parentId ?? null) === frameParentId && !s.locked &&
              isFullyContained(s, { x, y, width, height })
            )
            doc.transact(() => {
              newShape = addShape(doc, activePageId, 'frame', { x, y, width, height, parentId: frameParentId })
              if (enclosed.length > 0) {
                // Insert the frame below its adoptees so they render on top of it
                const allCurrent = getAllShapes(doc, activePageId)
                let lowestIndex = allCurrent.length
                for (const s of enclosed) {
                  const idx = allCurrent.findIndex((c) => c.id === s.id)
                  if (idx >= 0 && idx < lowestIndex) lowestIndex = idx
                }
                reorderShape(doc, activePageId, newShape.id, lowestIndex)
                for (const s of enclosed) {
                  updateShape(doc, activePageId, s.id, { parentId: newShape.id })
                }
              }
            }, 'local')
          }
          if (newShape) setSelectedIds(new Set([newShape.id]))
        }
      }
      setIsCreating(false)
      setCreateStart(null)
      setCreateEnd(null)
      setSelectionBox(null)
      setActiveTool('select')
    }
  }, [isPanning, selectionBox, isCreating, createStart, shapes, setSelectedIds, getPointerPos, activeTool, doc, activePageId, setActiveTool, penStore, isDrawingFreehand])

  // Escape/Enter to finish pen path
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (penStore.isDrawing && (e.key === 'Enter' || e.key === 'Escape')) {
        e.preventDefault()
        if (e.key === 'Escape' && penStore.points.length < 2) {
          penStore.reset()
          setActiveTool('select')
        } else {
          finishPenPath()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [penStore, finishPenPath, setActiveTool])

  const getCursor = () => {
    if (isPanning) return 'grabbing'
    if (spaceHeld) return 'grab'
    switch (activeTool) {
      case 'select': return 'default'
      case 'text': return 'text'
      case 'pen': return 'crosshair'
      case 'freehand': return 'crosshair'
      default: return 'crosshair'
    }
  }

  const { stageWidth, stageHeight } = useViewportStore()
  const canvasBg = useCanvasStore((s) => s.backgroundColor)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const selected = shapes.filter((s) => selectedIds.has(s.id))
  const hasText = selected.some((s) => s.type === 'text')
  const hasGroup = selected.some((s) => s.type === 'group')
  const canBoolean = selected.length >= 2

  const handleBooleanOp = async (op: 'union' | 'subtract' | 'intersect' | 'exclude') => {
    const result = await performBooleanOp(selected, op)
    if (result) {
      // Result takes the topmost input's parent and z position; one undo step
      const topmost = selected[selected.length - 1]
      const allBefore = getAllShapes(doc, activePageId)
      const topIdx = allBefore.findIndex((s) => s.id === topmost.id)
      const removedBelow = allBefore.filter((s, i) => i < topIdx && selectedIds.has(s.id)).length
      let shape: Shape | null = null
      doc.transact(() => {
        deleteShapes(doc, activePageId, selectedIds)
        shape = addShape(doc, activePageId, 'path', {
          ...result,
          closed: true,
          fill: selected[0].fill,
          stroke: selected[0].stroke,
          strokeWidth: selected[0].strokeWidth,
          parentId: topmost.parentId ?? null,
        })
        reorderShape(doc, activePageId, shape.id, Math.max(0, topIdx - removedBelow))
      }, 'local')
      if (shape) setSelectedIds(new Set([(shape as Shape).id]))
    }
  }

  const handleTextToOutlines = async () => {
    // Await all conversions first — transactions must stay synchronous
    const conversions: { source: TextShape; result: { pathData: string; width: number; height: number } }[] = []
    for (const s of selected) {
      if (s.type === 'text') {
        const result = await textToOutlines(s as TextShape)
        if (result) conversions.push({ source: s as TextShape, result })
      }
    }
    doc.transact(() => {
      for (const { source, result } of conversions) {
        const newShape = addShape(doc, activePageId, 'path', {
          x: source.x,
          y: source.y,
          ...result,
          closed: true,
          fill: source.fill,
          stroke: source.stroke,
          strokeWidth: source.strokeWidth,
          parentId: source.parentId ?? null,
        })
        // Slot the outline path in just below its source text
        const live = getAllShapes(doc, activePageId)
        const srcIdx = live.findIndex((s) => s.id === source.id)
        if (srcIdx >= 0) reorderShape(doc, activePageId, newShape.id, srcIdx)
      }
      deleteShapes(doc, activePageId, selectedIds)
    }, 'local')
    clearSelection()
  }

  const copyAsPng = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || selectedIds.size === 0) return
    const selectedShapes = shapes.filter((s) => selectedIds.has(s.id))
    if (selectedShapes.length === 0) return

    const shapesLayer = stage.findOne('.shapes-layer') as Konva.Layer | undefined
    if (!shapesLayer) return

    const hiddenNodes: Konva.Node[] = []
    shapesLayer.children?.forEach((node) => {
      if (!selectedIds.has(node.id())) {
        node.hide()
        hiddenNodes.push(node)
      }
    })

    const overlayLayer = stage.findOne('.overlay-layer') as Konva.Layer | undefined
    overlayLayer?.hide()
    const gridLayer = stage.findOne('.grid-layer') as Konva.Layer | undefined
    gridLayer?.hide()

    const { minX, minY, maxX, maxY } = getShapesBounds(selectedShapes)

    const dataUrl = stage.toDataURL({
      x: minX * zoom + offsetX,
      y: minY * zoom + offsetY,
      width: (maxX - minX) * zoom,
      height: (maxY - minY) * zoom,
      pixelRatio: 2,
    })

    hiddenNodes.forEach((n) => n.show())
    overlayLayer?.show()
    gridLayer?.show()

    const res = await fetch(dataUrl)
    const blob = await res.blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  }, [shapes, selectedIds, zoom, offsetX, offsetY])

  const copyAsSvg = useCallback(async () => {
    const selectedShapes = shapes.filter((s) => selectedIds.has(s.id))
    if (selectedShapes.length === 0) return
    const svg = await shapesToSvgString(selectedShapes)
    navigator.clipboard.writeText(svg)
  }, [shapes, selectedIds])

  const contextMenuItems: MenuEntry[] = selectedIds.size > 0
    ? [
        { label: 'Duplicate', icon: CopyPlus, shortcut: '⌘D', action: () => duplicateShapes(doc, activePageId, selectedIds) },
        { label: 'Copy', icon: Copy, shortcut: '⌘C', action: () => {} },
        { label: 'Copy as PNG', icon: ImageIcon, action: copyAsPng },
        { label: 'Copy as SVG', icon: FileCode, action: copyAsSvg },
        { label: 'Paste', icon: Clipboard, shortcut: '⌘V', action: () => {} },
        { divider: true },
        ...(selectedIds.size >= 2 ? [{ label: 'Group', icon: Group, shortcut: '⌘G', action: () => {
          const gid = groupShapes(doc, activePageId, selectedIds)
          if (gid) setSelectedIds(new Set([gid]))
        }}] : []),
        ...(hasGroup ? [{ label: 'Ungroup', icon: Ungroup, shortcut: '⌘⇧G', action: () => {
          const all = getAllShapes(doc, activePageId)
          const childIds = new Set<string>()
          const gids = new Set<string>()
          selectedIds.forEach((id) => {
            const s = all.find((x) => x.id === id)
            if (s?.type === 'group') {
              gids.add(id)
              all.forEach((x) => { if (x.parentId === id) childIds.add(x.id) })
            }
          })
          ungroupShapes(doc, activePageId, gids)
          setSelectedIds(childIds)
        }}] : []),
        { divider: true },
        { label: 'Bring to Front', icon: ArrowUpToLine, action: () => bringToFront(doc, activePageId, selectedIds) },
        { label: 'Send to Back', icon: ArrowDownToLine, action: () => sendToBack(doc, activePageId, selectedIds) },
        ...(canBoolean ? [
          { divider: true } as const,
          { label: 'Union', icon: Merge, action: () => handleBooleanOp('union') },
          { label: 'Subtract', icon: MinusIcon, action: () => handleBooleanOp('subtract') },
          { label: 'Intersect', icon: SquaresIntersect, action: () => handleBooleanOp('intersect') },
          { label: 'Exclude', icon: Diff, action: () => handleBooleanOp('exclude') },
        ] : []),
        ...(hasText ? [
          { divider: true } as const,
          { label: 'Outline Text', icon: TypeOutline, action: handleTextToOutlines },
        ] : []),
        { divider: true },
        { label: 'Delete', icon: Trash2, shortcut: '⌫', danger: true, action: () => { deleteShapes(doc, activePageId, selectedIds); clearSelection() } },
      ]
    : [
        { label: 'Paste', icon: Clipboard, shortcut: '⌘V', action: () => {} },
        { divider: true },
        { label: 'Select All', shortcut: '⌘A', action: () => setSelectedIds(new Set(shapes.map((s) => s.id))) },
      ]

  return (
    <div ref={containerRef} className="flex-1 h-full overflow-hidden relative" style={{ cursor: getCursor(), backgroundColor: canvasBg }} onContextMenu={handleContextMenu}>
      <InlineTextEditor stageRef={stageRef} />
      <InlineFrameTitleEditor />
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />
      )}
      <Stage
        ref={stageRef}
        width={stageWidth || 800}
        height={stageHeight || 600}
        scaleX={zoom}
        scaleY={zoom}
        x={offsetX}
        y={offsetY}
        onWheel={onWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDblClick={onDblClick}
      >
        <Layer name="grid-layer" listening={false}>
          <Grid />
        </Layer>
        <Layer name="shapes-layer">
          {isCreating && selectionBox && activeTool === 'frame' && (
            <KonvaRect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="#ffffff"
              stroke="#4a9eff"
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
          {rootShapes.map((shape) => (
            <ShapeRenderer key={shape.id} shape={shape} onSelect={onSelect} allShapes={shapes} />
          ))}
        </Layer>
        <Layer name="overlay-layer">
          <DropTargetHighlight />
          <SelectionOverlay stageRef={stageRef} />
          <SelectionBox box={!isCreating ? selectionBox : null} />
          {isCreating && selectionBox && activeTool === 'ellipse' && (
            <KonvaEllipse
              x={selectionBox.x + selectionBox.width / 2}
              y={selectionBox.y + selectionBox.height / 2}
              radiusX={selectionBox.width / 2}
              radiusY={selectionBox.height / 2}
              fill="#d9d9d9"
              stroke="#4a9eff"
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
          {isCreating && createStart && createEnd && activeTool === 'line' && (
            <KonvaLine
              points={[createStart.x, createStart.y, createEnd.x, createEnd.y]}
              stroke="#000000"
              strokeWidth={2}
              listening={false}
            />
          )}
          {isCreating && selectionBox && activeTool === 'rectangle' && (
            <KonvaRect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="#d9d9d9"
              stroke="#4a9eff"
              strokeWidth={1 / zoom}
              listening={false}
            />
          )}
          <PenToolOverlay />
          {isDrawingFreehand && freehandPoints.length >= 2 && (
            <KonvaLine
              points={freehandPoints.flatMap((p) => [p.x, p.y])}
              stroke="#4a9eff"
              strokeWidth={2 / zoom}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  )
}
