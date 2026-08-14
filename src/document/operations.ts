import * as Y from 'yjs'
import type { Shape, ShapeType } from '../types/document'
import { createShapeData, baseDefaults, typeDefaults } from './schema'
import { getShapesArray } from './createDoc'
import {
  buildShapeIndex,
  findDropFrame,
  getDescendants,
  getShapeCenter,
  getSubtreeTopIndex,
  isContainer,
  selectionRoots,
} from './hierarchy'

/** Keys whose values are object arrays stored as JSON strings in Yjs */
const OBJECT_ARRAY_KEYS = new Set(['rulers', 'exports'])

function setYMapValue(map: Y.Map<unknown>, key: string, value: unknown) {
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

/**
 * A shape exactly as stored: only the keys that build actually wrote. Fields
 * added in later versions are simply absent, so this is deliberately not a
 * `Shape` — claiming otherwise is what let missing fields reach consumers
 * typed against a complete shape.
 */
type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never

/** Omit applied per-variant, so variant-specific fields survive the union */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * Every field any shape variant can carry, all optional. The `type` discriminant
 * is removed before merging — intersecting its literal types would collapse the
 * whole thing to `never` — and re-added as the open ShapeType.
 */
export type StoredShape = Partial<UnionToIntersection<DistributiveOmit<Shape, 'type'>>> & {
  id: string
  type: ShapeType
}

/** Decode a Y.Map into the raw stored fields, without filling anything in. */
export function yMapToStored(map: Y.Map<unknown>): StoredShape {
  const obj: Record<string, unknown> = {}
  map.forEach((value, key) => {
    if (value instanceof Y.Array) {
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
  return obj as StoredShape
}

/**
 * Fill in every field a shape of this type should have. The only place a
 * `Shape` is produced from stored data — so a document written by any past
 * version reads back complete, and consumers never need per-field guards.
 *
 * Stored values always win; defaults only supply what is absent.
 */
export function normalizeShape(stored: StoredShape): Shape {
  const defaults = typeDefaults[stored.type] ?? {}
  const result: Record<string, unknown> = { ...baseDefaults, ...defaults }
  // Assign explicitly rather than spreading: a key stored as undefined must not
  // clobber its default, which a spread would do.
  for (const [key, value] of Object.entries(stored)) {
    if (value !== undefined) result[key] = value
  }
  return result as unknown as Shape
}

export function yMapToShape(map: Y.Map<unknown>): Shape {
  return normalizeShape(yMapToStored(map))
}

export function addShape(doc: Y.Doc, pageId: string, type: ShapeType, overrides: Partial<Shape> = {}, _origin = 'local'): Shape {
  const shapes = getShapesArray(doc, pageId)
  const shape = createShapeData(type, overrides)
  doc.transact(() => {
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

export function reorderShape(doc: Y.Doc, pageId: string, id: string, newIndex: number, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    let oldIndex = -1
    let shapeData: Shape | null = null
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (map.get('id') === id) {
        oldIndex = i
        shapeData = yMapToShape(map)
        break
      }
    }
    if (oldIndex === -1 || !shapeData) return
    shapes.delete(oldIndex, 1)
    const adjustedIndex = newIndex > oldIndex ? newIndex - 1 : newIndex
    shapes.insert(Math.min(adjustedIndex, shapes.length), [shapeToYMap(shapeData)])
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
    // Pull the moved roots out (descending index), keeping clones in ascending
    // original order so the inserted block preserves their relative z.
    const rootIdSet = new Set(roots.map((r) => r.id))
    const clones: Shape[] = []
    for (let i = shapesArr.length - 1; i >= 0; i--) {
      const map = shapesArr.get(i) as Y.Map<unknown>
      if (rootIdSet.has(map.get('id') as string)) {
        clones.unshift(yMapToShape(map))
        shapesArr.delete(i, 1)
      }
    }

    // Compute the insertion index on the live post-delete array by anchor id —
    // never from pre-delete numeric indexes.
    const live = getAllShapes(doc, pageId)
    let insertAt: number
    switch (dest.kind) {
      case 'inside':
        insertAt = getSubtreeTopIndex(live, dest.containerId) + 1
        break
      case 'above-anchor':
        insertAt = live.findIndex((s) => s.id === dest.anchorId) + 1
        break
      case 'below-anchor':
        insertAt = live.findIndex((s) => s.id === dest.anchorId)
        break
      case 'root-top':
        insertAt = live.length
        break
      case 'root-bottom':
        insertAt = 0
        break
    }
    if (insertAt < 0) insertAt = live.length

    const maps = clones.map((c) => shapeToYMap({ ...c, parentId: newParentId } as Shape))
    shapesArr.insert(Math.min(insertAt, shapesArr.length), maps)
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

  // Plan insertions from the initial snapshot; process in descending index
  // order so earlier (higher) insertions don't shift later ones.
  const jobs = roots
    .map((root) => ({
      root,
      insertAt: getSubtreeTopIndex(all, root.id) + 1,
      subtree: cloneSubtrees(all, [root.id], offset, offset)[0],
    }))
    .sort((a, b) => b.insertAt - a.insertAt)

  doc.transact(() => {
    for (const job of jobs) {
      const rootClone = job.subtree.clones.find((c) => c.id === job.subtree.rootCloneId)!
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
        }
      }
      shapesArr.insert(Math.min(job.insertAt, shapesArr.length), job.subtree.clones.map(shapeToYMap))
      newRootIds.push(rootClone.id)
    }
  }, _origin)
  return newRootIds
}

/** Insert fully prepared shapes verbatim (ids preserved) at the top of the page. */
export function insertShapes(doc: Y.Doc, pageId: string, newShapes: Shape[], _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    shapes.push(newShapes.map(shapeToYMap))
  }, _origin)
}

export function getAllShapes(doc: Y.Doc, pageId: string): Shape[] {
  const shapes = getShapesArray(doc, pageId)
  const result: Shape[] = []
  for (let i = 0; i < shapes.length; i++) {
    result.push(yMapToShape(shapes.get(i) as Y.Map<unknown>))
  }
  return result
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
  })

  const index = buildShapeIndex(allShapes)
  const topIdx = Math.max(...roots.map((r) => index.indexOf.get(r.id) ?? 0))
  const rootIds = new Set(roots.map((r) => r.id))

  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    // Insert the group just above its topmost member (not at global top)
    shapes.insert(Math.min(topIdx + 1, shapes.length), [shapeToYMap(group)])
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
        // A mask only means something relative to its group's siblings —
        // promoted children must not start clipping their new context.
        if (map.get('isMask') === true) map.set('isMask', false)
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

export function bringToFront(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    const toMove: Shape[] = []
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        toMove.push(yMapToShape(map))
        shapes.delete(i, 1)
      }
    }
    toMove.reverse().forEach((s) => shapes.push([shapeToYMap(s)]))
  }, _origin)
}

export function sendToBack(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    const toMove: Shape[] = []
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        toMove.push(yMapToShape(map))
        shapes.delete(i, 1)
      }
    }
    toMove.forEach((s) => shapes.insert(0, [shapeToYMap(s)]))
  }, _origin)
}
