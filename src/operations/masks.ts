import * as Y from 'yjs'
import type { Shape } from '../types/document'
import { getAllShapes, updateShape, groupShapes } from '../document/operations'
import { selectionRoots, isContainer } from '../document/hierarchy'

/**
 * Figma-style "Use as mask".
 *
 * Multiple roots selected → group them and flag the bottom-most root as the
 * mask (it clips the siblings above it). Single shape already inside a
 * group/frame → toggle its mask flag in place.
 *
 * Returns the id the caller should select (the new group, or the toggled
 * shape), or null when nothing applied.
 */
export function makeMask(doc: Y.Doc, pageId: string, selectedIds: Set<string>): string | null {
  const all = getAllShapes(doc, pageId)
  const roots = selectionRoots(all, selectedIds)
  if (roots.length === 0) return null

  if (roots.length >= 2) {
    let gid = ''
    // One outer transaction so group + flag is a single undo step
    doc.transact(() => {
      gid = groupShapes(doc, pageId, selectedIds)
      if (gid) updateShape(doc, pageId, roots[0].id, { isMask: true })
    }, 'local')
    return gid || null
  }

  const shape = roots[0]
  const parent = shape.parentId ? all.find((s) => s.id === shape.parentId) : undefined
  if (!parent || !isContainer(parent)) return null
  updateShape(doc, pageId, shape.id, { isMask: !shape.isMask })
  return shape.id
}

/** Clear the mask flag on every selected shape that has it. */
export function removeMask(doc: Y.Doc, pageId: string, selectedIds: Set<string>) {
  const all = getAllShapes(doc, pageId)
  doc.transact(() => {
    for (const s of all) {
      if (selectedIds.has(s.id) && s.isMask) {
        updateShape(doc, pageId, s.id, { isMask: false })
      }
    }
  }, 'local')
}

/** Whether "Use as Mask" applies: multiple roots, or one non-mask container child. */
export function canUseAsMask(selected: Shape[], allShapes: Shape[]): boolean {
  if (selected.length === 0) return false
  const roots = selectionRoots(allShapes, new Set(selected.map((s) => s.id)))
  if (roots.length >= 2) return true
  if (roots.length !== 1) return false
  const shape = roots[0]
  if (shape.isMask) return false
  const parent = shape.parentId ? allShapes.find((s) => s.id === shape.parentId) : undefined
  return !!parent && isContainer(parent)
}

export function hasMaskInSelection(selected: Shape[]): boolean {
  return selected.some((s) => s.isMask)
}
