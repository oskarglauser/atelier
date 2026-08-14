import { useEffect, useRef, useCallback, useMemo } from 'react'
import { Transformer } from 'react-konva'
import type Konva from 'konva'
import { useUIStore } from '../store/uiStore'
import { useHistoryStore } from '../store/historyStore'
import { useDocument } from '../hooks/useDocument'
import { useShapes } from '../hooks/useShapes'
import { updateShape, duplicateShapes, moveShapes, cloneSubtrees } from '../document/operations'
import { selectionRoots, getDescendants, getAncestors, getChildren, findDropFrame } from '../document/hierarchy'
import type { Shape } from '../types/document'
import { snapWithRulers } from '../utils/snapToRulers'

const ROTATE_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="%23000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 13.72A10 10 0 1 1 18.57 4.34L21.5 2"/></svg>`
const ROTATE_CURSOR = `url('data:image/svg+xml,${ROTATE_CURSOR_SVG}') 8 8, crosshair`

interface Props {
  stageRef: React.RefObject<Konva.Stage | null>
}

/**
 * One canvas drag = one gesture. Nothing is written to Yjs until dragend:
 * Konva moves the nodes imperatively (container children follow for free as
 * Konva descendants), then a single transaction commits positions, optional
 * alt-duplicates, and reparenting — so every gesture is exactly one undo step.
 */
interface DragGesture {
  /** The grabbed node — drives snapping and drop-target evaluation */
  primaryId: string
  /** Pointer position in page coords at gesture start */
  pointerStart: { x: number; y: number }
  /** Every Konva node that fired dragstart (transformer-synced set) */
  nodeIds: Set<string>
  /** Moved root shape ids, in array order */
  roots: string[]
  /**
   * Set when dragging an unselected child of a selected group: the whole
   * group subtree moves and no reparenting happens.
   */
  entourage: { rootId: string; peerIds: string[] } | null
  /** Start positions for every shape whose x/y will be committed */
  startPositions: Map<string, { x: number; y: number }>
  /** Snapshot of root shapes at gesture start (bounds for reparent tests) */
  rootShapesAtStart: Map<string, Shape>
  /** Shapes snapshot at gesture start (drop-frame lookups) */
  allShapesAtStart: Shape[]
  /** Roots + all their descendants — exclusion set for findDropFrame */
  movedIds: Set<string>
  alt: boolean
  committed: boolean
  lastDelta: { x: number; y: number }
}

/** Stage pointer position in page coordinates */
function getPagePointer(stage: Konva.Stage): { x: number; y: number } | null {
  const pos = stage.getPointerPosition()
  if (!pos) return null
  return stage.getAbsoluteTransform().copy().invert().point(pos)
}

export function SelectionOverlay({ stageRef }: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const { doc, activePageId } = useDocument()
  const shapes = useShapes()
  const isDragging = useRef(false)
  const gestureRef = useRef<DragGesture | null>(null)
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

    // Transformer-synced secondary dragstarts join the active gesture; they
    // must never reset shared state (that corrupted multi-select drags).
    const active = gestureRef.current
    if (active && !active.committed) {
      active.nodeIds.add(id)
      return
    }

    const stage = stageRef.current
    if (!stage) return
    const allShapes = shapesRef.current
    const shape = shapesMapRef.current.get(id)
    if (!shape) return
    const pointer = getPagePointer(stage) ?? { x: shape.x, y: shape.y }

    const selection = useUIStore.getState().selectedIds
    const isSelected = selection.has(id)

    // Dragging an unselected child whose selected ancestor is a group moves
    // the whole group (groups have no spatial boundary to escape). Frame
    // children always move alone — exiting is handled by the symmetric
    // center-point rule at dragend.
    let entourage: DragGesture['entourage'] = null
    let roots: Shape[]
    if (isSelected) {
      roots = selectionRoots(allShapes, selection)
      if (!roots.some((r) => r.id === id)) roots = [shape]
    } else {
      const ancestors = getAncestors(allShapes, id)
      const selectedGroupAncestor = [...ancestors].reverse().find(
        (a) => selection.has(a.id) && a.type === 'group'
      )
      if (selectedGroupAncestor) {
        roots = [selectedGroupAncestor]
        // Imperative peers: the group's direct children besides the grabbed
        // branch (each Konva node carries its own subtree). When the grabbed
        // node sits deeper, peers still cover everything outside its branch.
        const grabbedBranch = ancestors.length > 0
          ? [...ancestors].reverse().find((a) => a.parentId === selectedGroupAncestor.id)?.id ?? id
          : id
        const branchTop = shape.parentId === selectedGroupAncestor.id ? id : grabbedBranch
        entourage = {
          rootId: selectedGroupAncestor.id,
          peerIds: getChildren(allShapes, selectedGroupAncestor.id)
            .filter((c) => c.id !== branchTop)
            .map((c) => c.id),
        }
      } else {
        roots = [shape]
      }
    }

    const movedIds = new Set<string>()
    const startPositions = new Map<string, { x: number; y: number }>()
    const rootShapesAtStart = new Map<string, Shape>()
    for (const r of roots) {
      movedIds.add(r.id)
      startPositions.set(r.id, { x: r.x, y: r.y })
      rootShapesAtStart.set(r.id, r)
      for (const d of getDescendants(allShapes, r.id)) {
        movedIds.add(d.id)
        startPositions.set(d.id, { x: d.x, y: d.y })
      }
    }
    // The grabbed node may not be a root in the entourage case
    if (!startPositions.has(id)) startPositions.set(id, { x: shape.x, y: shape.y })

    const alt = e.evt.altKey && isSelected

    // Show the copies immediately rather than only on drop. Yjs still holds the
    // start positions for the whole gesture, so these render exactly where the
    // real duplicates will land. Built with the same cloneSubtrees the commit
    // uses, at zero offset, so the preview can't drift from the result.
    if (alt) {
      const preview = cloneSubtrees(allShapes, roots.map((r) => r.id)).flatMap((s) => s.clones)
      useUIStore.getState().setAltDragPreview(preview)
    }

    isDragging.current = true
    gestureRef.current = {
      primaryId: id,
      pointerStart: pointer,
      nodeIds: new Set([id]),
      roots: roots.map((r) => r.id),
      entourage,
      startPositions,
      rootShapesAtStart,
      allShapesAtStart: allShapes,
      movedIds,
      alt,
      committed: false,
      lastDelta: { x: 0, y: 0 },
    }
  }, [stageRef])

  const onDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const g = gestureRef.current
    if (!g || g.committed) return
    const node = e.target
    const id = node.id()
    if (!id) return
    const stage = stageRef.current
    if (!stage) return

    // Delta comes from the pointer, snapped once against the primary node —
    // identical for every synced node, so multi-select never tears apart.
    if (id === g.primaryId) {
      const pointer = getPagePointer(stage)
      if (pointer) {
        const primaryStart = g.startPositions.get(g.primaryId)!
        const raw = {
          x: primaryStart.x + (pointer.x - g.pointerStart.x),
          y: primaryStart.y + (pointer.y - g.pointerStart.y),
        }
        const snapped = snapWithRulers(raw.x, raw.y, shapesRef.current)
        g.lastDelta = { x: snapped.x - primaryStart.x, y: snapped.y - primaryStart.y }
      }
    }

    // Each node positions itself in its own event — Konva's internal drag
    // update can never clobber a cross-node write.
    const start = g.startPositions.get(id)
    if (start) {
      node.x(start.x + g.lastDelta.x)
      node.y(start.y + g.lastDelta.y)
      // Frame titles are sibling Text nodes and don't follow automatically
      const titleNode = stage.findOne(`.frame-title-${id}`)
      if (titleNode) {
        titleNode.x(start.x + g.lastDelta.x)
        titleNode.y(start.y + g.lastDelta.y)
      }
    }

    if (id !== g.primaryId) return

    // Entourage peers move imperatively; their Konva subtrees follow for free
    if (g.entourage) {
      for (const peerId of g.entourage.peerIds) {
        const peerStart = g.startPositions.get(peerId)
        const peerNode = stage.findOne(`#${peerId}`)
        if (peerStart && peerNode) {
          peerNode.x(peerStart.x + g.lastDelta.x)
          peerNode.y(peerStart.y + g.lastDelta.y)
        }
        const peerTitle = stage.findOne(`.frame-title-${peerId}`)
        const ps = g.startPositions.get(peerId)
        if (peerTitle && ps) {
          peerTitle.x(ps.x + g.lastDelta.x)
          peerTitle.y(ps.y + g.lastDelta.y)
        }
      }
      return
    }

    // Live drop-target highlight, evaluated from the grabbed root's center
    const primaryRoot = g.rootShapesAtStart.get(g.roots.includes(id) ? id : g.roots[0])
    if (primaryRoot) {
      const center = {
        x: primaryRoot.x + (primaryRoot.width || 0) / 2 + g.lastDelta.x,
        y: primaryRoot.y + (primaryRoot.height || 0) / 2 + g.lastDelta.y,
      }
      const target = findDropFrame(g.allShapesAtStart, center, g.movedIds)
      useUIStore.getState().setDropTargetFrameId(target?.id ?? null)
    }
  }, [stageRef])

  const onDragEnd = useCallback(() => {
    const g = gestureRef.current
    if (!g || g.committed) return
    g.committed = true

    // Isolate this gesture as its own undo step regardless of capture timing
    useHistoryStore.getState().undoManager?.stopCapturing()

    doc.transact(() => {
      // Alt-drag: duplicates stay at the start positions with original parent
      // and z (deep clones — frame copies keep their children); the grabbed
      // originals move on. Yjs still holds start positions here, so offset 0.
      if (g.alt) {
        duplicateShapes(doc, activePageId, new Set(g.roots), 0)
      }

      for (const [sid, start] of g.startPositions) {
        updateShape(doc, activePageId, sid, {
          x: start.x + g.lastDelta.x,
          y: start.y + g.lastDelta.y,
        })
      }

      // Reparent each moved root by the center-point rule (symmetric for
      // enter and exit; frame→frame works in one gesture). Same parent →
      // no z write at all. Group parents are only left when the drop lands
      // in a frame — groups have no spatial boundary.
      if (!g.entourage) {
        const byId = new Map(g.allShapesAtStart.map((s) => [s.id, s]))
        const byDest = new Map<string | null, string[]>()
        for (const rootId of g.roots) {
          const startShape = g.rootShapesAtStart.get(rootId)
          if (!startShape) continue
          const center = {
            x: startShape.x + (startShape.width || 0) / 2 + g.lastDelta.x,
            y: startShape.y + (startShape.height || 0) / 2 + g.lastDelta.y,
          }
          const currentParent = startShape.parentId ?? null
          let newParent = findDropFrame(g.allShapesAtStart, center, g.movedIds)?.id ?? null
          if (newParent === null && currentParent && byId.get(currentParent)?.type === 'group') {
            newParent = currentParent
          }
          if (newParent !== currentParent) {
            const list = byDest.get(newParent) || []
            list.push(rootId)
            byDest.set(newParent, list)
          }
        }
        for (const [dest, ids] of byDest) {
          moveShapes(
            doc, activePageId, ids,
            dest ? { kind: 'inside', containerId: dest } : { kind: 'root-top' }
          )
        }
      }
    }, 'local')

    useUIStore.getState().setDropTargetFrameId(null)
    useUIStore.getState().setAltDragPreview(null)
    gestureRef.current = null
    isDragging.current = false
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
