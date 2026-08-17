import * as Y from 'yjs'
import type { Shape, PathShape } from '../types/document'
import { getAllShapes, addShape, deleteShapes, takeShapeOrderOf, moveShapes, groupShapes } from '../document/operations'
import { selectionRoots } from '../document/hierarchy'
import { getPaperScope, shapeToPaperPath, boundsNormalize } from './paperScope'

type PathPayload = { pathData: string; x: number; y: number; width: number; height: number }

/** Offset applied by the context-menu item; the panel field starts here too */
export const DEFAULT_OFFSET_AMOUNT = 10

const EXPANDABLE = new Set(['rectangle', 'ellipse', 'path', 'line'])
const OFFSETTABLE = new Set(['rectangle', 'ellipse', 'path'])

const hasFill = (s: Shape) => !!s.fill && s.fill !== 'none'
const hasStroke = (s: Shape) => !!s.stroke && s.stroke !== 'none' && s.strokeWidth > 0

export function canExpandStroke(selected: Shape[]): boolean {
  return selected.some((s) => EXPANDABLE.has(s.type) && hasStroke(s))
}

export function canOffset(selected: Shape[]): boolean {
  return selected.some((s) => OFFSETTABLE.has(s.type))
}

/**
 * Convert each applicable shape's stroke into filled geometry, replacing the
 * shape in place (same parent and z). A stroke-only shape becomes one path
 * filled with the old stroke color; a fill+stroke shape becomes a group of
 * [fill path, stroke-outline path] so nothing is lost. One undo step.
 * Returns the replacement ids (path or group per source).
 */
export async function expandStrokeOnSelection(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>
): Promise<string[]> {
  const all = getAllShapes(doc, pageId)
  const sources = selectionRoots(all, selectedIds).filter(
    (s) => EXPANDABLE.has(s.type) && hasStroke(s)
  )
  if (sources.length === 0) return []

  const scope = await getPaperScope()
  const { offsetStroke } = await import('paperjs-offset')

  // Geometry is async-free once paper is loaded, but resolve it all before
  // the transaction anyway — transactions must stay synchronous.
  const jobs: Array<{ source: Shape; stroke: PathPayload; fill: PathPayload | null }> = []
  try {
    scope.activate()
    for (const source of sources) {
      const item = shapeToPaperPath(scope, source)
      if (!item) continue
      // Butt caps + miter joins match Konva's canvas stroke defaults
      const outline = offsetStroke(item as paper.Path, source.strokeWidth / 2, {
        cap: 'butt',
        join: 'miter',
        limit: 10,
        insert: false,
      })
      const strokePart = outline ? boundsNormalize(scope, outline) : null
      // The fill body survives only for closed geometry that actually fills
      const fillPart =
        source.type !== 'line' && hasFill(source) ? boundsNormalize(scope, item) : null
      outline?.remove()
      item.remove()
      if (strokePart) jobs.push({ source, stroke: strokePart, fill: fillPart })
    }
  } catch (e) {
    console.error('Expand stroke failed:', e)
    return []
  }
  if (jobs.length === 0) return []

  const newIds: string[] = []
  doc.transact(() => {
    for (const { source, stroke, fill } of jobs) {
      const strokeOverrides: Partial<PathShape> = {
        closed: true,
        fillRule: 'nonzero',
        fill: source.stroke,
        stroke: '',
        strokeWidth: 0,
        opacity: source.opacity,
        visible: source.visible,
        locked: source.locked,
        colorMode: source.colorMode,
        parentId: source.parentId ?? null,
      }

      if (!fill) {
        const shape = addShape(doc, pageId, 'path', { ...stroke, ...strokeOverrides })
        takeShapeOrderOf(doc, pageId, shape.id, source.id)
        newIds.push(shape.id)
      } else {
        const fillShape = addShape(doc, pageId, 'path', {
          ...fill,
          closed: true,
          fillRule: 'nonzero',
          fill: source.fill,
          fillType: source.fillType,
          gradient: source.gradient,
          stroke: '',
          strokeWidth: 0,
          opacity: source.opacity,
          visible: source.visible,
          locked: source.locked,
          colorMode: source.colorMode,
          parentId: source.parentId ?? null,
        })
        const strokeShape = addShape(doc, pageId, 'path', { ...stroke, ...strokeOverrides })
        const gid = groupShapes(doc, pageId, new Set([fillShape.id, strokeShape.id]))
        if (gid) takeShapeOrderOf(doc, pageId, gid, source.id)
        newIds.push(gid || fillShape.id)
      }
    }
    deleteShapes(doc, pageId, new Set(jobs.map((j) => j.source.id)))
  }, 'local')

  return newIds
}

/**
 * Create an offset copy of each applicable selected shape, `delta` px outward
 * (negative = inward), inserted just above its source with the source's full
 * style. Originals are untouched. Returns the new ids.
 */
export async function offsetSelectedPaths(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>,
  delta: number
): Promise<string[]> {
  if (!delta) return []
  const all = getAllShapes(doc, pageId)
  const sources = selectionRoots(all, selectedIds).filter((s) => OFFSETTABLE.has(s.type))
  if (sources.length === 0) return []

  const scope = await getPaperScope()
  const { offset } = await import('paperjs-offset')

  const jobs: Array<{ source: Shape; part: PathPayload }> = []
  try {
    scope.activate()
    for (const source of sources) {
      const item = shapeToPaperPath(scope, source)
      if (!item) continue
      const result = offset(item as paper.Path, delta, { join: 'round', insert: false })
      const part = result ? boundsNormalize(scope, result) : null
      result?.remove()
      item.remove()
      // Over-shrunk shapes collapse to nothing — skip, keep the original
      if (part) jobs.push({ source, part })
    }
  } catch (e) {
    console.error('Offset path failed:', e)
    return []
  }
  if (jobs.length === 0) return []

  const newIds: string[] = []
  doc.transact(() => {
    for (const { source, part } of jobs) {
      const shape = addShape(doc, pageId, 'path', {
        ...part,
        closed: true,
        fillRule: source.type === 'path' ? ((source as PathShape).fillRule ?? 'nonzero') : 'nonzero',
        fill: source.fill,
        fillType: source.fillType,
        gradient: source.gradient,
        stroke: source.stroke,
        strokeWidth: source.strokeWidth,
        opacity: source.opacity,
        colorMode: source.colorMode,
        parentId: source.parentId ?? null,
      })
      // The source survives here, so the new outline sits directly above it.
      moveShapes(doc, pageId, [shape.id], { kind: 'above-anchor', anchorId: source.id })
      newIds.push(shape.id)
    }
  }, 'local')

  return newIds
}
