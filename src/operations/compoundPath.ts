import * as Y from 'yjs'
import type { Shape, PathShape } from '../types/document'
import { getAllShapes, addShape, deleteShapes, takeShapeOrderOf, moveShapes } from '../document/operations'
import { selectionRoots } from '../document/hierarchy'
import { getPaperScope, shapeToPaperPath, boundsNormalize } from './paperScope'
import { countSubpaths } from '../utils/pathData'

/**
 * Merge the selected shapes into a single multi-subpath PathShape rendered
 * with the even-odd rule, so overlaps become holes. No boolean geometry is
 * computed — subpaths are concatenated as-is, which is what makes Release a
 * faithful inverse.
 *
 * Follows the outlineSelectedText flow: async geometry first, then one
 * 'local' transaction (add → reorder to the topmost input's live index →
 * delete inputs). Returns the new shape's id; the caller sets selection.
 */
export async function makeCompoundPath(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>
): Promise<string | null> {
  const all = getAllShapes(doc, pageId)
  const roots = selectionRoots(all, selectedIds)
  if (roots.length < 2) return null

  const scope = await getPaperScope()

  let normalized: ReturnType<typeof boundsNormalize> = null
  try {
    scope.activate()
    const items = roots
      .map((s) => shapeToPaperPath(scope, s))
      .filter((p): p is paper.PathItem => p !== null)
    if (items.length < 2) {
      items.forEach((p) => p.remove())
      return null
    }

    // Flatten: a multi-subpath input imports as a CompoundPath; lift its
    // children so the result is one flat compound rather than nested shells.
    const leaves: paper.Path[] = []
    const shells: paper.PathItem[] = []
    for (const item of items) {
      if (item.className === 'CompoundPath') {
        leaves.push(...([...item.children] as paper.Path[]))
        shells.push(item)
      } else {
        leaves.push(item as paper.Path)
      }
    }

    const compound = new scope.CompoundPath({ children: leaves })
    normalized = boundsNormalize(scope, compound)
    compound.remove()
    shells.forEach((s) => s.remove())
    items.forEach((p) => p.remove())
  } catch (e) {
    console.error('Make compound path failed:', e)
    return null
  }
  if (!normalized) return null
  const result = normalized

  const bottom = roots[0]
  const topmost = roots[roots.length - 1]

  let newId: string | null = null
  doc.transact(() => {
    const shape = addShape(doc, pageId, 'path', {
      ...result,
      closed: true,
      fillRule: 'evenodd',
      fill: bottom.fill,
      stroke: bottom.stroke,
      strokeWidth: bottom.strokeWidth,
      opacity: bottom.opacity,
      colorMode: bottom.colorMode,
      parentId: topmost.parentId ?? null,
    })
    // Take over the topmost input's z position; the inputs are deleted next
    takeShapeOrderOf(doc, pageId, shape.id, topmost.id)
    deleteShapes(doc, pageId, new Set(roots.map((r) => r.id)))
    newId = shape.id
  }, 'local')

  return newId
}

/**
 * Split a multi-subpath PathShape back into one PathShape per subpath, each
 * with the source's style and the default nonzero rule, stacked in subpath
 * order at the source's z position. Returns the new ids.
 */
export async function releaseCompoundPath(
  doc: Y.Doc,
  pageId: string,
  pathId: string
): Promise<string[]> {
  const all = getAllShapes(doc, pageId)
  const source = all.find((s) => s.id === pathId)
  if (!source || source.type !== 'path') return []
  const src = source as PathShape
  if (countSubpaths(src.pathData) < 2) return []

  const scope = await getPaperScope()

  const parts: Array<{ pathData: string; x: number; y: number; width: number; height: number }> = []
  try {
    scope.activate()
    // shapeToPaperPath resolves position, scale and rotation to absolute coords
    const item = shapeToPaperPath(scope, source)
    if (!item) return []
    if (item.className !== 'CompoundPath') {
      item.remove()
      return []
    }
    // Copy the array — normalizing detaches nothing, but children mutate order
    const children = [...item.children] as paper.Path[]
    for (const child of children) {
      const normalized = boundsNormalize(scope, child)
      if (normalized) parts.push(normalized)
    }
    item.remove()
  } catch (e) {
    console.error('Release compound path failed:', e)
    return []
  }
  if (parts.length === 0) return []

  const newIds: string[] = []
  doc.transact(() => {
    parts.forEach((part) => {
      const shape = addShape(doc, pageId, 'path', {
        ...part,
        closed: src.closed,
        fillRule: 'nonzero',
        fill: src.fill,
        stroke: src.stroke,
        strokeWidth: src.strokeWidth,
        opacity: src.opacity,
        visible: src.visible,
        locked: src.locked,
        colorMode: src.colorMode,
        parentId: src.parentId ?? null,
      })
      newIds.push(shape.id)
    })
    // Stack them in subpath order where the source sits; each addShape already
    // put them on top in that order, so one move keeps the sequence.
    // Rotation/scale are baked into the parts.
    moveShapes(doc, pageId, newIds, { kind: 'above-anchor', anchorId: src.id })
    deleteShapes(doc, pageId, new Set([src.id]))
  }, 'local')

  return newIds
}

/** Whether "Release Compound Path" applies to the current selection. */
export function canReleaseCompound(selected: Shape[]): boolean {
  return (
    selected.length === 1 &&
    selected[0].type === 'path' &&
    countSubpaths((selected[0] as PathShape).pathData) > 1
  )
}
