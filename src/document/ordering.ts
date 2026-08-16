import type { Shape } from '../types/document'

/**
 * Fractional z-ordering.
 *
 * Z-order used to be the shape's position in the page's Y.Array, which meant
 * reordering had to delete and re-insert the Y.Map. That destroys the map's
 * CRDT identity: a concurrent edit from another peer lands on a map that no
 * longer exists (silently lost), and two peers reordering the same shape each
 * re-insert their own clone, producing two shapes with the same id.
 *
 * Instead every shape carries an `order` number and reordering is an in-place
 * key write, which merges cleanly. Values are only ever compared within a
 * sibling group (same parentId); the page-wide number line is shared purely
 * for convenience.
 */

/** Spacing between adjacent shapes. Large enough that midpoints stay exact for many inserts. */
export const ORDER_STEP = 1024

/** Below this gap, floating-point midpoints start losing precision — renormalize instead. */
const MIN_GAP = 1e-4

/**
 * Total order over shapes. Ties break on id so that every peer — and every
 * reload — agrees on the same sequence.
 */
export function compareShapeOrder(a: Shape, b: Shape): number {
  const d = (a.order ?? 0) - (b.order ?? 0)
  if (d !== 0) return d
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function sortByOrder(shapes: Shape[]): Shape[] {
  return [...shapes].sort(compareShapeOrder)
}

/** An order that sorts above everything in `siblings` (empty → 0). */
export function orderOnTopOf(siblings: Shape[]): number {
  if (siblings.length === 0) return 0
  return Math.max(...siblings.map((s) => s.order ?? 0)) + ORDER_STEP
}

/** An order that sorts below everything in `siblings` (empty → 0). */
export function orderBeneath(siblings: Shape[]): number {
  if (siblings.length === 0) return 0
  return Math.min(...siblings.map((s) => s.order ?? 0)) - ORDER_STEP
}

/**
 * `count` evenly spaced orders strictly between `below` and `above`.
 * Pass null for an open end. Returns null when the gap is too tight to
 * subdivide safely — the caller must renormalize the sibling group first.
 */
export function ordersBetween(
  below: number | null,
  above: number | null,
  count: number
): number[] | null {
  if (count <= 0) return []
  if (below === null && above === null) {
    return Array.from({ length: count }, (_, i) => i * ORDER_STEP)
  }
  if (below === null) {
    // Stack downward from `above`
    return Array.from({ length: count }, (_, i) => above! - (count - i) * ORDER_STEP)
  }
  if (above === null) {
    return Array.from({ length: count }, (_, i) => below + (i + 1) * ORDER_STEP)
  }
  const gap = above - below
  if (gap <= MIN_GAP * (count + 1)) return null
  const step = gap / (count + 1)
  return Array.from({ length: count }, (_, i) => below + step * (i + 1))
}

/**
 * Fresh, evenly spaced orders for a sibling group whose fractional gaps have
 * collapsed. Returns id → order for the group in its current sorted sequence.
 */
export function renormalizedOrders(siblings: Shape[]): Map<string, number> {
  const result = new Map<string, number>()
  sortByOrder(siblings).forEach((s, i) => result.set(s.id, i * ORDER_STEP))
  return result
}
