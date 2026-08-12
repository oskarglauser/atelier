import type * as Y from 'yjs'
import { getAllShapes, updateShape } from '../document/operations'
import { getDescendants, selectionRoots } from '../document/hierarchy'
import type { Shape } from '../types/document'

export type AlignmentMode =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom'

export type DistributionMode = 'horizontal' | 'vertical'

function moveTree(
  doc: Y.Doc,
  pageId: string,
  allShapes: Shape[],
  root: Shape,
  dx: number,
  dy: number,
) {
  if (dx === 0 && dy === 0) return
  updateShape(doc, pageId, root.id, { x: root.x + dx, y: root.y + dy })
  for (const child of getDescendants(allShapes, root.id)) {
    updateShape(doc, pageId, child.id, { x: child.x + dx, y: child.y + dy })
  }
}

function roundPosition(value: number) {
  return Math.round(value * 1000) / 1000
}

function getVisualBounds(shape: Shape) {
  const angle = (shape.rotation * Math.PI) / 180
  if (angle === 0) {
    return {
      minX: shape.x,
      minY: shape.y,
      maxX: shape.x + shape.width,
      maxY: shape.y + shape.height,
    }
  }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const corners = [
    { x: 0, y: 0 },
    { x: shape.width, y: 0 },
    { x: 0, y: shape.height },
    { x: shape.width, y: shape.height },
  ].map((point) => ({
    x: shape.x + point.x * cos - point.y * sin,
    y: shape.y + point.x * sin + point.y * cos,
  }))
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  }
}

export function alignSelectedObjects(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>,
  mode: AlignmentMode,
): boolean {
  const allShapes = getAllShapes(doc, pageId)
  const roots = selectionRoots(allShapes, selectedIds)
  if (roots.length < 2) return false

  const entries = roots.map((shape) => ({ shape, bounds: getVisualBounds(shape) }))
  const left = Math.min(...entries.map(({ bounds }) => bounds.minX))
  const top = Math.min(...entries.map(({ bounds }) => bounds.minY))
  const right = Math.max(...entries.map(({ bounds }) => bounds.maxX))
  const bottom = Math.max(...entries.map(({ bounds }) => bounds.maxY))
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2

  doc.transact(() => {
    for (const { shape, bounds } of entries) {
      let dx = 0
      let dy = 0
      switch (mode) {
        case 'left':
          dx = left - bounds.minX
          break
        case 'horizontal-center':
          dx = centerX - (bounds.minX + bounds.maxX) / 2
          break
        case 'right':
          dx = right - bounds.maxX
          break
        case 'top':
          dy = top - bounds.minY
          break
        case 'vertical-center':
          dy = centerY - (bounds.minY + bounds.maxY) / 2
          break
        case 'bottom':
          dy = bottom - bounds.maxY
          break
      }
      moveTree(doc, pageId, allShapes, shape, roundPosition(dx), roundPosition(dy))
    }
  }, 'local')
  return true
}

export function distributeSelectedObjects(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>,
  mode: DistributionMode,
): boolean {
  const allShapes = getAllShapes(doc, pageId)
  const roots = selectionRoots(allShapes, selectedIds)
  if (roots.length < 3) return false

  const horizontal = mode === 'horizontal'
  const sorted = roots.map((shape) => ({ shape, bounds: getVisualBounds(shape) })).sort((a, b) => {
    const aCenter = horizontal ? (a.bounds.minX + a.bounds.maxX) / 2 : (a.bounds.minY + a.bounds.maxY) / 2
    const bCenter = horizontal ? (b.bounds.minX + b.bounds.maxX) / 2 : (b.bounds.minY + b.bounds.maxY) / 2
    return aCenter - bCenter
  })
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const totalSize = sorted.reduce(
    (sum, entry) => sum + (horizontal ? entry.bounds.maxX - entry.bounds.minX : entry.bounds.maxY - entry.bounds.minY),
    0,
  )
  const start = horizontal ? first.bounds.minX : first.bounds.minY
  const end = horizontal ? last.bounds.maxX : last.bounds.maxY
  const gap = (end - start - totalSize) / (sorted.length - 1)

  let cursor = start
  doc.transact(() => {
    for (const { shape, bounds } of sorted) {
      const current = horizontal ? bounds.minX : bounds.minY
      const delta = roundPosition(cursor - current)
      moveTree(doc, pageId, allShapes, shape, horizontal ? delta : 0, horizontal ? 0 : delta)
      cursor += (horizontal ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY) + gap
    }
  }, 'local')
  return true
}
