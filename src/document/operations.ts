import * as Y from 'yjs'
import type { Shape, ShapeType } from '../types/document'
import { createShapeData, nextShapeName } from './schema'
import { getShapesArray } from './createDoc'
import {
  buildShapeIndex,
  findDropFrame,
  getDescendants,
  getShapeCenter,
  isContainer,
  selectionRoots,
} from './hierarchy'
import {
  ORDER_STEP,
  orderOnTopOf,
  ordersBetween,
  renormalizedOrders,
  sortByOrder,
} from './ordering'

/** id → live Y.Map index for a page, for cheap in-transaction lookups. */
function mapsById(shapesArr: Y.Array<Y.Map<unknown>>): Map<string, Y.Map<unknown>> {
  const m = new Map<string, Y.Map<unknown>>()
  for (let i = 0; i < shapesArr.length; i++) {
    const ym = shapesArr.get(i) as Y.Map<unknown>
    m.set(ym.get('id') as string, ym)
  }
  return m
}

/** Shapes sharing a parent, in z-order, optionally excluding some ids. */
function siblingsOf(all: Shape[], parentId: string | null, exclude?: Set<string>): Shape[] {
  return all.filter(
    (s) => (s.parentId ?? null) === parentId && !(exclude?.has(s.id) ?? false)
  )
}

/** An order placing a shape directly above `shape` within its sibling group. */
function orderJustAbove(all: Shape[], shape: Shape): number {
  const sibs = siblingsOf(all, shape.parentId ?? null)
  const i = sibs.findIndex((s) => s.id === shape.id)
  const above = i >= 0 && i + 1 < sibs.length ? sibs[i + 1].order : null
  const slot = ordersBetween(shape.order ?? 0, above, 1)
  return slot ? slot[0] : (shape.order ?? 0) + ORDER_STEP
}

/** Keys whose values are object arrays stored as JSON strings in Yjs */
const OBJECT_ARRAY_KEYS = new Set(['rulers', 'exports'])

/**
 * A text shape's body is stored as Y.Text rather than a plain string, so two
 * people editing different parts of the same text merge instead of one
 * overwriting the other. Everything outside this module still sees a string.
 */
const TEXT_KEY = 'text'

/**
 * Rewrite `ytext` to `next` using the smallest edit that spans the changed
 * region (common prefix/suffix trimmed). Characters nobody touched keep their
 * CRDT identity, which is what lets concurrent edits merge.
 */
function applyTextDiff(ytext: Y.Text, next: string) {
  const prev = ytext.toString()
  if (prev === next) return

  let start = 0
  const shortest = Math.min(prev.length, next.length)
  while (start < shortest && prev[start] === next[start]) start++

  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
  }

  if (endPrev > start) ytext.delete(start, endPrev - start)
  if (endNext > start) ytext.insert(start, next.slice(start, endNext))
}

function setYMapValue(map: Y.Map<unknown>, key: string, value: unknown) {
  if (key === TEXT_KEY && typeof value === 'string') {
    // A not-yet-integrated map has no value here, which is fine — it just
    // means we create the Y.Text rather than diffing into an existing one.
    const existing = map.doc ? map.get(key) : undefined
    if (existing instanceof Y.Text) applyTextDiff(existing, value)
    else map.set(key, new Y.Text(value))
    return
  }
  if (Array.isArray(value)) {
    if (OBJECT_ARRAY_KEYS.has(key)) {
      map.set(key, JSON.stringify(value))
    } else {
      const arr = new Y.Array()
      arr.push(value)
      map.set(key, arr)
    }
  } else {
    map.set(key, value)
  }
}

function shapeToYMap(shape: Shape): Y.Map<unknown> {
  const map = new Y.Map()
  for (const [key, value] of Object.entries(shape)) {
    setYMapValue(map, key, value)
  }
  return map
}

export function yMapToShape(map: Y.Map<unknown>): Shape {
  const obj: Record<string, unknown> = {}
  map.forEach((value, key) => {
    if (value instanceof Y.Text) {
      obj[key] = value.toString()
    } else if (value instanceof Y.Array) {
      obj[key] = value.toArray()
    } else if (OBJECT_ARRAY_KEYS.has(key) && typeof value === 'string') {
      try {
        obj[key] = JSON.parse(value)
      } catch {
        obj[key] = value
      }
    } else {
      obj[key] = value
    }
  })
  return obj as unknown as Shape
}

export function addShape(doc: Y.Doc, pageId: string, type: ShapeType, overrides: Partial<Shape> = {}, _origin = 'local'): Shape {
  const shapes = getShapesArray(doc, pageId)
  const shape = createShapeData(type, overrides)
  doc.transact(() => {
    const all = getAllShapes(doc, pageId)
    // New shapes land on top of their own sibling group unless the caller
    // pinned an explicit order.
    if (overrides.order === undefined) {
      shape.order = orderOnTopOf(siblingsOf(all, shape.parentId ?? null))
    }
    // Name from what's already in the document, so peers don't all emit "Rectangle 1"
    if (overrides.name === undefined) {
      shape.name = nextShapeName(type, all)
    }
    shapes.push([shapeToYMap(shape)])
  }, _origin)
  return shape
}

export function updateShape(doc: Y.Doc, pageId: string, id: string, updates: Partial<Shape>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (map.get('id') === id) {
        for (const [key, value] of Object.entries(updates)) {
          setYMapValue(map, key, value)
        }
        break
      }
    }
  }, _origin)
}

export function deleteShapes(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  // Expand ids to include children of any groups/frames being deleted (single pass)
  const parentToChildren = new Map<string, string[]>()
  for (let i = 0; i < shapes.length; i++) {
    const map = shapes.get(i) as Y.Map<unknown>
    const parentId = map.get('parentId') as string | null
    if (parentId) {
      let children = parentToChildren.get(parentId)
      if (!children) { children = []; parentToChildren.set(parentId, children) }
      children.push(map.get('id') as string)
    }
  }
  const allIds = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const children = parentToChildren.get(queue.pop()!)
    if (children) {
      for (const childId of children) {
        if (!allIds.has(childId)) { allIds.add(childId); queue.push(childId) }
      }
    }
  }
  doc.transact(() => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (allIds.has(map.get('id') as string)) {
        shapes.delete(i, 1)
      }
    }
  }, _origin)
}

/**
 * Give `id` the z-position currently held by `anchorId`. Intended for cases
 * where a shape replaces another (boolean-op result, text-to-outlines) or
 * slots in where a group of shapes used to sit (frame adoption).
 */
export function takeShapeOrderOf(doc: Y.Doc, pageId: string, id: string, anchorId: string, _origin = 'local') {
  const shapesArr = getShapesArray(doc, pageId)
  doc.transact(() => {
    const byId = mapsById(shapesArr)
    const anchor = byId.get(anchorId)
    const target = byId.get(id)
    if (!anchor || !target) return
    target.set('order', anchor.get('order') as number)
  }, _origin)
}

// --- Reparent + z-order primitive ---

export type MoveDestination =
  | { kind: 'inside'; containerId: string }   // top of the container's children
  | { kind: 'above-anchor'; anchorId: string } // array index idx(anchor)+1; parentId = anchor.parentId
  | { kind: 'below-anchor'; anchorId: string } // array index idx(anchor);   parentId = anchor.parentId
  | { kind: 'root-top' }                      // end of array, parentId = null
  | { kind: 'root-bottom' }                   // index 0, parentId = null

/**
 * Move shapes to a new parent and/or z position in one transaction.
 * The single primitive behind canvas reparenting and layers-panel drops.
 *
 * Only the moved roots' Y.Maps are relocated; their descendants keep their
 * array slots (renderers only care about relative order among siblings).
 * Returns false (writing nothing) when the destination is invalid — e.g.
 * inside the moved subtree itself (cycle guard) or a missing anchor.
 */
export function moveShapes(doc: Y.Doc, pageId: string, ids: string[], dest: MoveDestination, _origin = 'local'): boolean {
  const shapesArr = getShapesArray(doc, pageId)
  const all = getAllShapes(doc, pageId)
  const index = buildShapeIndex(all)

  const roots = selectionRoots(all, new Set(ids))
  if (roots.length === 0) return false

  const movedIds = new Set<string>()
  for (const r of roots) {
    movedIds.add(r.id)
    for (const d of getDescendants(all, r.id)) movedIds.add(d.id)
  }

  let newParentId: string | null = null
  switch (dest.kind) {
    case 'inside': {
      const container = index.byId.get(dest.containerId)
      if (!container || !isContainer(container)) return false
      newParentId = dest.containerId
      break
    }
    case 'above-anchor':
    case 'below-anchor': {
      const anchor = index.byId.get(dest.anchorId)
      if (!anchor || movedIds.has(dest.anchorId)) return false
      newParentId = anchor.parentId ?? null
      break
    }
    default:
      newParentId = null
  }
  if (newParentId && movedIds.has(newParentId)) return false

  doc.transact(() => {
    const shapesById = mapsById(shapesArr)
    // Destination sibling group in z-order, excluding everything being moved.
    let siblings = siblingsOf(getAllShapes(doc, pageId), newParentId, movedIds)

    // The open interval the moved shapes must land in. A null end means
    // "nothing beyond here", so we can just step away from the neighbour.
    const bounds = (): [number | null, number | null] => {
      const lowest = siblings.length ? siblings[0].order : null
      const highest = siblings.length ? siblings[siblings.length - 1].order : null
      switch (dest.kind) {
        case 'root-bottom':
          return [null, lowest]
        case 'above-anchor': {
          const i = siblings.findIndex((s) => s.id === dest.anchorId)
          if (i === -1) return [highest, null]
          return [siblings[i].order, i + 1 < siblings.length ? siblings[i + 1].order : null]
        }
        case 'below-anchor': {
          const i = siblings.findIndex((s) => s.id === dest.anchorId)
          if (i === -1) return [null, lowest]
          return [i > 0 ? siblings[i - 1].order : null, siblings[i].order]
        }
        default: // 'inside' and 'root-top' both mean top of the group
          return [highest, null]
      }
    }

    let [below, above] = bounds()
    let orders = ordersBetween(below, above, roots.length)
    if (!orders) {
      // Repeated midpoint inserts collapsed the gap — respace the whole
      // destination group with fresh integer orders, then try again.
      const fresh = renormalizedOrders(siblings)
      for (const [sid, o] of fresh) shapesById.get(sid)?.set('order', o)
      siblings = sortByOrder(siblings.map((s) => ({ ...s, order: fresh.get(s.id) ?? s.order })))
      ;[below, above] = bounds()
      orders = ordersBetween(below, above, roots.length)
    }
    if (!orders) return

    // `roots` came from a z-sorted snapshot, so this preserves their relative order.
    roots.forEach((r, i) => {
      const ym = shapesById.get(r.id)
      if (!ym) return
      ym.set('parentId', newParentId)
      ym.set('order', orders![i])
    })
  }, _origin)
  return true
}

// --- Deep cloning ---

export interface ClonedSubtree {
  sourceRootId: string
  rootCloneId: string
  /** Clones in source array order, root included; internal parentIds remapped */
  clones: Shape[]
}

/**
 * Deep-clone whole subtrees with fresh ids. parentIds pointing inside a cloned
 * subtree are remapped to the clone ids; the root clone keeps its original
 * parentId (callers decide whether to re-resolve it). Pure — writes nothing.
 */
export function cloneSubtrees(allShapes: Shape[], rootIds: string[], dx = 0, dy = 0): ClonedSubtree[] {
  return rootIds.map((rootId) => {
    const memberIds = new Set([rootId, ...getDescendants(allShapes, rootId).map((d) => d.id)])
    const members = allShapes.filter((s) => memberIds.has(s.id))
    const idMap = new Map<string, string>()
    const clones = members.map((s) => {
      const clone = createShapeData(s.type, { ...s, x: s.x + dx, y: s.y + dy } as Partial<Shape>)
      idMap.set(s.id, clone.id)
      return clone
    })
    for (const c of clones) {
      if (c.parentId && idMap.has(c.parentId)) {
        c.parentId = idMap.get(c.parentId)!
      }
    }
    return { sourceRootId: rootId, rootCloneId: idMap.get(rootId)!, clones }
  })
}

export function duplicateShapes(doc: Y.Doc, pageId: string, ids: Set<string>, offset = 10, _origin = 'local'): string[] {
  const all = getAllShapes(doc, pageId)
  const roots = selectionRoots(all, ids)
  if (roots.length === 0) return []

  const shapesArr = getShapesArray(doc, pageId)
  const newRootIds: string[] = []

  const jobs = roots.map((root) => ({
    root,
    subtree: cloneSubtrees(all, [root.id], offset, offset)[0],
  }))

  doc.transact(() => {
    for (const job of jobs) {
      const rootClone = job.subtree.clones.find((c) => c.id === job.subtree.rootCloneId)!
      // The copy sits directly above its original. Descendant clones keep the
      // source orders, which is correct — they form a fresh sibling group
      // under the cloned root.
      rootClone.order = orderJustAbove(all, job.root)
      // Keep the original parent unless the offset moved the duplicate's
      // center outside that frame — then re-resolve at the new position.
      if (rootClone.parentId) {
        const parent = all.find((s) => s.id === rootClone.parentId)
        const center = getShapeCenter(rootClone)
        const stillInside =
          !parent || parent.type !== 'frame'
            ? true
            : center.x >= parent.x &&
              center.x <= parent.x + parent.width &&
              center.y >= parent.y &&
              center.y <= parent.y + parent.height
        if (!stillInside) {
          const exclude = new Set([job.root.id, ...getDescendants(all, job.root.id).map((d) => d.id)])
          rootClone.parentId = findDropFrame(all, center, exclude)?.id ?? null
          // Different sibling group now — "above the original" is meaningless.
          rootClone.order = orderOnTopOf(siblingsOf(all, rootClone.parentId))
        }
      }
      // Array position is no longer z-order, so a plain append is fine.
      shapesArr.push(job.subtree.clones.map(shapeToYMap))
      newRootIds.push(rootClone.id)
    }
  }, _origin)
  return newRootIds
}

/**
 * Insert fully prepared shapes verbatim (ids preserved), placing each root on
 * top of whichever sibling group it lands in. Shapes whose parent is also in
 * the batch keep their relative orders — they form their own group.
 */
export function insertShapes(doc: Y.Doc, pageId: string, newShapes: Shape[], _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    const all = getAllShapes(doc, pageId)
    const incoming = new Set(newShapes.map((s) => s.id))
    const topOf = new Map<string | null, number>()
    const placed = newShapes.map((s) => {
      const parentId = s.parentId ?? null
      if (incoming.has(parentId ?? '')) return s
      const next = (topOf.get(parentId) ?? orderOnTopOf(siblingsOf(all, parentId))) + ORDER_STEP
      topOf.set(parentId, next)
      return { ...s, order: next }
    })
    shapes.push(placed.map(shapeToYMap))
  }, _origin)
}

/**
 * All shapes on a page **in z-order**. Sorting here (rather than relying on
 * Y.Array position) is what lets every consumer keep treating array order as
 * paint order while writes only ever touch the `order` key.
 */
export function getAllShapes(doc: Y.Doc, pageId: string): Shape[] {
  const shapes = getShapesArray(doc, pageId)
  const result: Shape[] = []
  for (let i = 0; i < shapes.length; i++) {
    result.push(yMapToShape(shapes.get(i) as Y.Map<unknown>))
  }
  return sortByOrder(result)
}

/**
 * Bring an existing document up to the current shape schema:
 *  - backfill `order` from the array sequence, so nothing visibly moves
 *  - upgrade plain-string text bodies to Y.Text so they merge per character
 *
 * Not undoable — it's a migration, not an edit.
 */
export function migrateShapes(doc: Y.Doc, pageIds: string[]) {
  doc.transact(() => {
    for (const pageId of pageIds) {
      const shapesArr = getShapesArray(doc, pageId)
      for (let i = 0; i < shapesArr.length; i++) {
        const ym = shapesArr.get(i) as Y.Map<unknown>
        if (typeof ym.get('order') !== 'number') ym.set('order', i * ORDER_STEP)
        const body = ym.get(TEXT_KEY)
        if (typeof body === 'string') ym.set(TEXT_KEY, new Y.Text(body))
      }
    }
  }, 'migration')
}

// --- Group / Ungroup ---

export function groupShapes(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local'): string {
  const allShapes = getAllShapes(doc, pageId)
  // Group only the top-most selected shapes — a selected child of another
  // selected container stays inside its container.
  const roots = selectionRoots(allShapes, ids)
  if (roots.length < 2) return ''

  const minX = Math.min(...roots.map((s) => s.x))
  const minY = Math.min(...roots.map((s) => s.y))
  const maxX = Math.max(...roots.map((s) => s.x + s.width))
  const maxY = Math.max(...roots.map((s) => s.y + s.height))

  // The group inherits the members' shared parent (e.g. grouping inside a
  // frame keeps everything in the frame); mixed parents fall back to root.
  const sharedParentId = roots.every((r) => r.parentId === roots[0].parentId) ? roots[0].parentId : null

  const group = createShapeData('group', {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    fill: '',
    stroke: '',
    strokeWidth: 0,
    parentId: sharedParentId,
    // Sits just above its topmost member rather than at the page top. Members
    // keep their orders — they now form the group's own sibling group.
    order: orderJustAbove(allShapes, roots[roots.length - 1]),
  })

  const rootIds = new Set(roots.map((r) => r.id))
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    shapes.push([shapeToYMap(group)])
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (rootIds.has(map.get('id') as string)) {
        map.set('parentId', group.id)
      }
    }
  }, _origin)

  return group.id
}

export function ungroupShapes(doc: Y.Doc, pageId: string, groupIds: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  const all = getAllShapes(doc, pageId)
  // Children are promoted to each group's own parent (which may be a frame),
  // not unconditionally to root.
  const groupParent = new Map<string, string | null>()
  for (const s of all) {
    if (groupIds.has(s.id) && s.type === 'group') groupParent.set(s.id, s.parentId)
  }
  doc.transact(() => {
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      const parentId = map.get('parentId') as string | null
      if (parentId && groupParent.has(parentId)) {
        map.set('parentId', groupParent.get(parentId) ?? null)
      }
    }
    // Delete group shapes
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (groupIds.has(map.get('id') as string) && map.get('type') === 'group') {
        shapes.delete(i, 1)
      }
    }
  }, _origin)
}

// --- Bring to front / Send to back ---

/** Send every selected shape to the top (or bottom) of its own sibling group. */
function moveToExtreme(doc: Y.Doc, pageId: string, ids: Set<string>, toFront: boolean, _origin: string) {
  const shapesArr = getShapesArray(doc, pageId)
  doc.transact(() => {
    const all = getAllShapes(doc, pageId)
    const selected = all.filter((s) => ids.has(s.id))
    if (selected.length === 0) return
    const byId = mapsById(shapesArr)

    // Group by parent: a selected child rises within its container, not to
    // the top of the page.
    const groups = new Map<string | null, Shape[]>()
    for (const s of selected) {
      const p = s.parentId ?? null
      const arr = groups.get(p)
      if (arr) arr.push(s)
      else groups.set(p, [s])
    }

    for (const [parentId, members] of groups) {
      const others = siblingsOf(all, parentId, new Set(members.map((m) => m.id)))
      if (others.length === 0) continue
      const orders = others.map((o) => o.order ?? 0)
      const base = toFront ? Math.max(...orders) : Math.min(...orders)
      // `members` is z-sorted, so relative order is preserved either way.
      members.forEach((m, i) => {
        const ym = byId.get(m.id)
        if (!ym) return
        ym.set('order', toFront
          ? base + (i + 1) * ORDER_STEP
          : base - (members.length - i) * ORDER_STEP)
      })
    }
  }, _origin)
}

export function bringToFront(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  moveToExtreme(doc, pageId, ids, true, _origin)
}

export function sendToBack(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  moveToExtreme(doc, pageId, ids, false, _origin)
}
