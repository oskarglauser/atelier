import type { Shape, FrameShape } from '../types/document'

/**
 * Pure hierarchy helpers over the flat Shape[] snapshot.
 *
 * The document stores shapes in one flat array per page; hierarchy is expressed
 * through `parentId` and z-order through array index (higher = on top). All
 * coordinates are absolute page coordinates, so reparenting never moves a shape.
 *
 * Containment tests use axis-aligned bounds; rotated frames are not supported
 * as drop targets (known limitation).
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ShapeIndex {
  byId: Map<string, Shape>
  childrenOf: Map<string, Shape[]>
  indexOf: Map<string, number>
}

export function buildShapeIndex(shapes: Shape[]): ShapeIndex {
  const byId = new Map<string, Shape>()
  const childrenOf = new Map<string, Shape[]>()
  const indexOf = new Map<string, number>()
  shapes.forEach((s, i) => {
    byId.set(s.id, s)
    indexOf.set(s.id, i)
    if (s.parentId) {
      const arr = childrenOf.get(s.parentId)
      if (arr) arr.push(s)
      else childrenOf.set(s.parentId, [s])
    }
  })
  return { byId, childrenOf, indexOf }
}

export function isContainer(s: Shape): boolean {
  return s.type === 'frame' || s.type === 'group'
}

export function getChildren(shapes: Shape[], parentId: string): Shape[] {
  return shapes.filter((s) => s.parentId === parentId)
}

/** All shapes below rootId in the hierarchy, in array order. Cycle-safe. */
export function getDescendants(shapes: Shape[], rootId: string): Shape[] {
  const index = buildShapeIndex(shapes)
  const result: Shape[] = []
  const visited = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const child of index.childrenOf.get(id) || []) {
      if (visited.has(child.id)) continue
      visited.add(child.id)
      result.push(child)
      queue.push(child.id)
    }
  }
  return result
}

/** Ancestor chain of a shape, nearest parent first. Cycle-safe. */
export function getAncestors(shapes: Shape[], id: string, index?: ShapeIndex): Shape[] {
  const byId = index?.byId ?? new Map(shapes.map((s) => [s.id, s]))
  const result: Shape[] = []
  const visited = new Set<string>([id])
  let current = byId.get(id)
  while (current?.parentId) {
    if (visited.has(current.parentId)) break
    visited.add(current.parentId)
    const parent = byId.get(current.parentId)
    if (!parent) break
    result.push(parent)
    current = parent
  }
  return result
}

/** True if `id` sits anywhere below `ancestorId` in the hierarchy. */
export function isDescendant(shapes: Shape[], id: string, ancestorId: string, index?: ShapeIndex): boolean {
  return getAncestors(shapes, id, index).some((a) => a.id === ancestorId)
}

/** Nesting depth: 0 for root shapes. */
export function getShapeDepth(shapes: Shape[], id: string, index?: ShapeIndex): number {
  return getAncestors(shapes, id, index).length
}

export function getShapeCenter(s: Shape): Point {
  return { x: s.x + (s.width || 0) / 2, y: s.y + (s.height || 0) / 2 }
}

/**
 * Reduce a selection to its top-most members: drop any id that has a selected
 * ancestor (moving the ancestor already moves its subtree). Array order.
 */
export function selectionRoots(shapes: Shape[], ids: Set<string>): Shape[] {
  const index = buildShapeIndex(shapes)
  return shapes.filter(
    (s) => ids.has(s.id) && !getAncestors(shapes, s.id, index).some((a) => ids.has(a.id))
  )
}

/** Highest array index occupied by rootId or any of its descendants. */
export function getSubtreeTopIndex(shapes: Shape[], rootId: string): number {
  const index = buildShapeIndex(shapes)
  let top = index.indexOf.get(rootId) ?? -1
  for (const d of getDescendants(shapes, rootId)) {
    const i = index.indexOf.get(d.id) ?? -1
    if (i > top) top = i
  }
  return top
}

function pointInShape(p: Point, s: Shape): boolean {
  return p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height
}

/**
 * THE containment rule: which frame should own a shape whose bounds center is
 * at `center`? Candidates are visible, unlocked frames (with visible, unlocked
 * ancestors) outside the moved subtree (`excludeIds` plus their descendants —
 * the cycle guard). Deepest nested candidate wins; ties go to the topmost in z.
 */
export function findDropFrame(
  shapes: Shape[],
  center: Point,
  excludeIds: Set<string>,
  index?: ShapeIndex
): FrameShape | null {
  const idx = index ?? buildShapeIndex(shapes)
  let best: FrameShape | null = null
  let bestDepth = -1
  let bestIndex = -1

  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i]
    if (s.type !== 'frame') continue
    if (!s.visible || s.locked) continue
    if (excludeIds.has(s.id)) continue
    if (!pointInShape(center, s)) continue

    const ancestors = getAncestors(shapes, s.id, idx)
    if (ancestors.some((a) => excludeIds.has(a.id) || !a.visible || a.locked)) continue

    const depth = ancestors.length
    if (depth > bestDepth || (depth === bestDepth && i > bestIndex)) {
      best = s as FrameShape
      bestDepth = depth
      bestIndex = i
    }
  }
  return best
}

/** findDropFrame for a bounds rect: tests the rect's center. */
export function resolveParentForBounds(
  shapes: Shape[],
  bounds: Rect,
  excludeIds: Set<string> = new Set()
): string | null {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  return findDropFrame(shapes, center, excludeIds)?.id ?? null
}

/**
 * Full-AABB containment. Used ONLY by the frame tool when adopting existing
 * shapes into a freshly drawn frame — the one intentional exception to the
 * center-point rule, so a new frame never swallows half-overlapping neighbors.
 */
export function isFullyContained(s: Shape, r: Rect): boolean {
  return (
    s.x >= r.x &&
    s.y >= r.y &&
    s.x + (s.width || 0) <= r.x + r.width &&
    s.y + (s.height || 0) <= r.y + r.height
  )
}
