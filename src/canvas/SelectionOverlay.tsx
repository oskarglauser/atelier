import { useEffect, useRef, useCallback, useMemo } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { useShapes } from '../hooks/useShapes'
import { updateShape, addShape, reorderShape } from '../document/operations'
import type * as Y from 'yjs'
import type { Shape } from '../types/document'
import { snapWithRulers } from '../utils/snapToRulers'

const ROTATE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 13.72A10 10 0 1 1 18.57 4.34L21.5 2"/></svg>`
const ROTATE_CURSOR = `url('data:image/svg+xml,${ROTATE_CURSOR_SVG}') 8 8, crosshair`

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
}

interface GroupContext {
  shape: Shape | undefined
  parentGroupId: string | undefined
  isGroupChild: boolean
  siblings: Shape[]
  children: Shape[]
}

function resolveGroupContext(shapesMap: Map<string, Shape>, shapes: Shape[], id: string): GroupContext {
  const shape = shapesMap.get(id)
  const parentGroupId = shape?.parentId || undefined
  const parentType = parentGroupId ? shapesMap.get(parentGroupId)?.type : undefined
  const isGroupChild = !!parentGroupId && (parentType === 'group' || parentType === 'frame')
  const siblings = isGroupChild && parentType === 'group' ? shapes.filter((s) => s.parentId === parentGroupId && s.id !== id) : []
  const children = (shape?.type === 'group' || shape?.type === 'frame') ? shapes.filter((s) => s.parentId === id) : []
  return { shape, parentGroupId, isGroupChild, siblings, children }
}

function applyDragToGroupContext(
  doc: Y.Doc, pageId: string, id: string,
  newX: number, newY: number, dx: number, dy: number,
  ctx: GroupContext,
  shapesMapRef: Map<string, Shape>,
  prevPositions: Map<string, { x: number; y: number }>
) {
  updateShape(doc, pageId, id, { x: newX, y: newY })

  if (ctx.isGroupChild && ctx.parentGroupId) {
    const parent = shapesMapRef.get(ctx.parentGroupId)
    if (parent?.type === 'frame') {
      const w = ctx.shape?.width || 0
      const h = ctx.shape?.height || 0
      const inside = newX >= parent.x && newY >= parent.y &&
        newX + w <= parent.x + parent.width && newY + h <= parent.y + parent.height
      if (!inside) {
        updateShape(doc, pageId, id, { parentId: null })
      }
    } else {
      for (const sib of ctx.siblings) {
        updateShape(doc, pageId, sib.id, { x: sib.x + dx, y: sib.y + dy })
      }
      const parentPrev = prevPositions.get(ctx.parentGroupId)
      if (parentPrev) {
        updateShape(doc, pageId, ctx.parentGroupId, { x: parentPrev.x + dx, y: parentPrev.y + dy })
      }
    }
  }

  for (const child of ctx.children) {
    updateShape(doc, pageId, child.id, { x: child.x + dx, y: child.y + dy })
  }
}

function tryReparentIntoFrame(
  doc: Y.Doc, pageId: string, id: string,
  newX: number, newY: number,
  ctx: GroupContext,
  allShapes: Shape[]
) {
  if (ctx.isGroupChild && ctx.parentGroupId) {
    // Already in a frame — don't reparent
    return
  }
  const shape = ctx.shape
  if (!shape || shape.type === 'frame') return

  const w = shape.width || 0
  const h = shape.height || 0
  const cx = newX + w / 2
  const cy = newY + h / 2

  for (let fi = allShapes.length - 1; fi >= 0; fi--) {
    const frame = allShapes[fi]
    if (frame.type !== 'frame' || frame.id === id) continue
    if (cx >= frame.x && cx <= frame.x + frame.width &&
        cy >= frame.y && cy <= frame.y + frame.height) {
      updateShape(doc, pageId, id, { parentId: frame.id })
      const frameIdx = allShapes.findIndex((s) => s.id === frame.id)
      if (frameIdx !== -1) {
        reorderShape(doc, pageId, id, frameIdx + 1)
      }
      break
    }
  }
}

export function SelectionOverlay({ stageRef }: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const { doc, activePageId } = useDocument()
  const shapes = useShapes()
  const prevPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const isDragging = useRef(false)
  const altDragDuplicate = useRef(false)
  const dragContext = useRef<GroupContext | null>(null)
  const shapesRef = useRef(shapes)

  const shapesMap = useMemo(() => {
    const m = new Map<string, Shape>()
    for (const s of shapes) m.set(s.id, s)
    return m
  }, [shapes])
  const shapesMapRef = useRef(shapesMap)

  useEffect(() => {
    // Don't rebind transformer nodes during an active drag — it disrupts Konva's drag state
    if (isDragging.current) return

    const tr = trRef.current
    const stage = stageRef.current
    if (!tr || !stage) return

    const nodes: Konva.Node[] = []
    selectedIds.forEach((id) => {
      const shape = shapesMap.get(id)
      if (shape?.type === 'group') {
        const groupNode = stage.findOne(`#${id}`)
        if (groupNode) nodes.push(groupNode)
      } else {
        const node = stage.findOne(`#${id}`)
        if (node) nodes.push(node)
      }
    })

    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, stageRef, shapes, shapesMap])

  const childrenMap = useMemo(() => {
    const m = new Map<string, Shape[]>()
    for (const s of shapes) {
      if (s.parentId) {
        const arr = m.get(s.parentId)
        if (arr) arr.push(s)
        else m.set(s.parentId, [s])
      }
    }
    return m
  }, [shapes])
  const childrenMapRef = useRef(childrenMap)

  // Keep "latest" refs in sync for use inside Konva drag handlers
  useEffect(() => {
    shapesRef.current = shapes
    shapesMapRef.current = shapesMap
    childrenMapRef.current = childrenMap
  }, [shapes, shapesMap, childrenMap])

  const applyTransform = useCallback((resetScale: boolean) => {
    const stage = stageRef.current
    if (!stage) return
    const map = shapesMapRef.current

    doc.transact(() => {
      selectedIds.forEach((id) => {
        const shape = map.get(id)
        if (!shape) return
        const isContainer = shape.type === 'frame' || shape.type === 'group'

        // Skip container updates during continuous transform (onTransform).
        // Children are inside the Group and rotate/scale with it naturally via Konva.
        // Updating shape data mid-transform would re-render the offset wrapper and
        // disrupt the Transformer's active state. Only reconcile on transform end.
        if (isContainer && !resetScale) {
          // Still sync frame title position/rotation since it's a sibling node
          if (shape.type === 'frame') {
            const node = stage.findOne(`#${id}`)
            const titleNode = stage.findOne(`.frame-title-${id}`)
            if (node && titleNode) {
              titleNode.x(node.x())
              titleNode.y(node.y())
              titleNode.rotation(node.rotation())
            }
          }
          return
        }

        const node = stage.findOne(`#${id}`)
        if (!node) return

        const scaleX = node.scaleX()
        const scaleY = node.scaleY()

        const newX = node.x()
        const newY = node.y()
        const newRot = node.rotation()

        if (shape.type === 'path' || shape.type === 'line') {
          updateShape(doc, activePageId, id, {
            x: newX,
            y: newY,
            scaleX,
            scaleY,
            rotation: newRot,
          })
        } else if (shape.type === 'text' && !resetScale) {
          // During continuous transform, update the Konva node dimensions directly
          // so text reflows/wraps correctly, but don't write to Yjs to avoid
          // re-render flickering. The final values are committed on transform end.
          node.width(Math.max(1, node.width() * scaleX))
          node.height(Math.max(1, node.height() * scaleY))
          node.scaleX(1)
          node.scaleY(1)
          return
        } else {
          if (resetScale) {
            node.scaleX(1)
            node.scaleY(1)
          }
          updateShape(doc, activePageId, id, {
            x: newX,
            y: newY,
            width: Math.max(1, node.width() * scaleX),
            height: Math.max(1, node.height() * scaleY),
            rotation: newRot,
          })
        }

        // On transform end, update children's absolute positions to maintain
        // their local offset when the parent's position changed
        if (isContainer) {
          const pdx = newX - shape.x
          const pdy = newY - shape.y
          if (pdx !== 0 || pdy !== 0) {
            const children = childrenMapRef.current.get(id)
            if (children) {
              for (const child of children) {
                updateShape(doc, activePageId, child.id, { x: child.x + pdx, y: child.y + pdy })
              }
            }
          }
        }
      })
    }, 'local')
  }, [doc, activePageId, selectedIds, stageRef])

  const onTransformEnd = useCallback(() => applyTransform(true), [applyTransform])
  const onTransform = useCallback(() => applyTransform(false), [applyTransform])

  const onDragStart = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const id = e.target.id()
    if (!id) return
    isDragging.current = true
    altDragDuplicate.current = false

    // Option+drag: mark for duplication on drag end (defer to avoid re-render during drag)
    if (e.evt.altKey) {
      const { selectedIds } = useUIStore.getState()
      if (selectedIds.has(id)) {
        altDragDuplicate.current = true
      }
    }

    let ctx = resolveGroupContext(shapesMapRef.current, shapesRef.current, id)

    // If this child is directly selected inside a frame,
    // treat it as independent — don't move siblings/parent.
    // Group children always move the whole group together.
    const { selectedIds: currentSelection } = useUIStore.getState()
    const isDirectlySelected = currentSelection.has(id)
    const parentShape = ctx.parentGroupId ? shapesMapRef.current.get(ctx.parentGroupId) : undefined
    if (isDirectlySelected && ctx.isGroupChild && parentShape?.type === 'frame') {
      ctx = { ...ctx, isGroupChild: false, siblings: [] }
    }

    dragContext.current = ctx
    if (!ctx.shape) return

    prevPositions.current.clear()
    prevPositions.current.set(id, { x: ctx.shape.x, y: ctx.shape.y })

    if (ctx.isGroupChild && ctx.parentGroupId) {
      for (const sib of ctx.siblings) {
        prevPositions.current.set(sib.id, { x: sib.x, y: sib.y })
      }
      const parent = shapesMapRef.current.get(ctx.parentGroupId)
      if (parent) prevPositions.current.set(ctx.parentGroupId, { x: parent.x, y: parent.y })
    }

    for (const child of ctx.children) {
      prevPositions.current.set(child.id, { x: child.x, y: child.y })
    }
  }, [])

  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const id = node.id()
    if (!id) return
    const stage = stageRef.current
    if (!stage) return

    const prev = prevPositions.current.get(id)
    if (!prev) return

    // Snap to grid + rulers
    const snapped = snapWithRulers(node.x(), node.y(), shapesRef.current)
    const snappedX = snapped.x
    const snappedY = snapped.y

    node.x(snappedX)
    node.y(snappedY)

    // Sync frame title position after snapping (title is a sibling Text node,
    // not a child, so it doesn't move automatically with the group)
    const titleNode = stage.findOne(`.frame-title-${id}`)
    if (titleNode) {
      titleNode.x(snappedX)
      titleNode.y(snappedY)
    }

    const dx = snappedX - prev.x
    const dy = snappedY - prev.y

    const ctx = dragContext.current

    // Batch all Yjs writes into a single transaction
    doc.transact(() => {
      updateShape(doc, activePageId, id, { x: snappedX, y: snappedY })

      if (ctx) {
        for (const child of ctx.children) {
          const childPrev = prevPositions.current.get(child.id)
          if (childPrev) {
            updateShape(doc, activePageId, child.id, { x: childPrev.x + dx, y: childPrev.y + dy })
          }
        }
      }
    }, 'local')

    if (ctx) {
      if (ctx.isGroupChild) {
        for (const sib of ctx.siblings) {
          const sibNode = stage.findOne(`#${sib.id}`)
          const sibPrev = prevPositions.current.get(sib.id)
          if (sibNode && sibPrev) {
            sibNode.x(sibPrev.x + dx)
            sibNode.y(sibPrev.y + dy)
          }
        }
      }

      for (const child of ctx.children) {
        const childPrev = prevPositions.current.get(child.id)
        if (childPrev) {
          const childNode = stage.findOne(`#${child.id}`)
          if (childNode) {
            childNode.x(childPrev.x + dx)
            childNode.y(childPrev.y + dy)
          }
        }
      }
    }
  }, [stageRef, doc, activePageId])

  const onDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target
    const id = node.id()
    if (!id) return

    const newX = node.x()
    const newY = node.y()
    const prev = prevPositions.current.get(id)
    const dx = prev ? newX - prev.x : 0
    const dy = prev ? newY - prev.y : 0

    const ctx = dragContext.current || resolveGroupContext(shapesMapRef.current, shapesRef.current, id)

    doc.transact(() => {
      // Option+drag: create duplicates at the original positions
      if (altDragDuplicate.current && prev) {
        const { selectedIds } = useUIStore.getState()
        selectedIds.forEach((shapeId) => {
          const shape = shapesMapRef.current.get(shapeId)
          if (!shape) return
          const origPos = prevPositions.current.get(shapeId)
          if (!origPos) return
          const { id: _id, ...rest } = shape
          addShape(doc, activePageId, shape.type, {
            ...rest,
            x: origPos.x,
            y: origPos.y,
          } as Partial<Shape>)
        })
      }

      applyDragToGroupContext(
        doc, activePageId, id, newX, newY, dx, dy,
        ctx, shapesMapRef.current, prevPositions.current
      )

      // Drop into frame (only for normal drag, not alt-drag duplicates)
      if (!altDragDuplicate.current) {
        tryReparentIntoFrame(doc, activePageId, id, newX, newY, ctx, shapesRef.current)
      }
    }, 'local')

    altDragDuplicate.current = false
    isDragging.current = false
    dragContext.current = null
    prevPositions.current.clear()
  }, [doc, activePageId])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const layer = stage.findOne('.shapes-layer') as Konva.Layer | undefined
    if (!layer) return

    const startHandler = onDragStart
    const moveHandler = onDragMove
    const endHandler = onDragEnd

    layer.on('dragstart', startHandler)
    layer.on('dragmove', moveHandler)
    layer.on('dragend', endHandler)
    return () => {
      layer.off('dragstart', startHandler)
      layer.off('dragmove', moveHandler)
      layer.off('dragend', endHandler)
    }
  }, [onDragStart, onDragMove, onDragEnd, stageRef])

  const keepRatio = useMemo(() => {
    if (selectedIds.size === 0) return false
    for (const id of selectedIds) {
      const shape = shapesMap.get(id)
      if (!shape || !shape.lockProportions) return false
    }
    return true
  }, [selectedIds, shapesMap])

  if (selectedIds.size === 0) return null

  return (
    <Transformer
      ref={trRef}
      keepRatio={keepRatio}
      rotateEnabled={true}
      enabledAnchors={[
        'top-left', 'top-center', 'top-right',
        'middle-left', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right',
      ]}
      borderStroke="rgba(74, 158, 255, 0.6)"
      borderStrokeWidth={1}
      anchorStroke="rgba(74, 158, 255, 0.6)"
      anchorFill="#ffffff"
      anchorSize={6}
      anchorCornerRadius={1}
      rotateAnchorOffset={16}
      rotateAnchorCursor={ROTATE_CURSOR}
      onTransform={onTransform}
      onTransformEnd={onTransformEnd}
      boundBoxFunc={(oldBox, newBox) => {
        if (Math.abs(newBox.width) < 1 || Math.abs(newBox.height) < 1) return oldBox
        return newBox
      }}
    />
  )
}
