import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { makeMask, removeMask, canUseAsMask } from './masks'
import { addShape, getAllShapes, ungroupShapes, groupShapes } from '../document/operations'
import { createUndoManager } from '../document/undoManager'

const PAGE = 'page-1'

function makeDoc(): Y.Doc {
  const doc = new Y.Doc()
  doc.getArray(`page:${PAGE}:shapes`)
  return doc
}

describe('makeMask', () => {
  it('auto-groups a multi-selection and flags the bottom-most root', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})

    const gid = makeMask(doc, PAGE, new Set([a.id, b.id]))

    expect(gid).toBeTruthy()
    const all = getAllShapes(doc, PAGE)
    const group = all.find((s) => s.id === gid)
    expect(group?.type).toBe('group')
    const aAfter = all.find((s) => s.id === a.id)!
    const bAfter = all.find((s) => s.id === b.id)!
    expect(aAfter.parentId).toBe(gid)
    expect(bAfter.parentId).toBe(gid)
    // a was added first → bottom-most → becomes the mask
    expect(aAfter.isMask).toBe(true)
    expect(bAfter.isMask).toBe(false)
  })

  it('auto-group + flag is a single undo step', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})
    const um = createUndoManager(doc, PAGE)
    um.stopCapturing()

    makeMask(doc, PAGE, new Set([a.id, b.id]))
    um.undo()

    const all = getAllShapes(doc, PAGE)
    expect(all).toHaveLength(2)
    expect(all.every((s) => !s.isMask && s.parentId === null)).toBe(true)
  })

  it('toggles the flag on a single shape already inside a group', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})
    groupShapes(doc, PAGE, new Set([a.id, b.id]))

    expect(makeMask(doc, PAGE, new Set([a.id]))).toBe(a.id)
    expect(getAllShapes(doc, PAGE).find((s) => s.id === a.id)!.isMask).toBe(true)
    // toggles back off
    makeMask(doc, PAGE, new Set([a.id]))
    expect(getAllShapes(doc, PAGE).find((s) => s.id === a.id)!.isMask).toBe(false)
  })

  it('does nothing for a single root-level shape', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    expect(makeMask(doc, PAGE, new Set([a.id]))).toBeNull()
    expect(getAllShapes(doc, PAGE)[0].isMask).toBe(false)
  })
})

describe('removeMask', () => {
  it('clears the flag on selected masks only', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})
    makeMask(doc, PAGE, new Set([a.id, b.id]))

    removeMask(doc, PAGE, new Set([a.id]))

    expect(getAllShapes(doc, PAGE).find((s) => s.id === a.id)!.isMask).toBe(false)
  })
})

describe('ungroupShapes', () => {
  it('clears isMask on promoted children', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})
    const gid = makeMask(doc, PAGE, new Set([a.id, b.id]))!

    ungroupShapes(doc, PAGE, new Set([gid]))

    const all = getAllShapes(doc, PAGE)
    expect(all.find((s) => s.id === a.id)!.isMask).toBe(false)
    expect(all.find((s) => s.id === a.id)!.parentId).toBeNull()
  })
})

describe('canUseAsMask', () => {
  it('true for multiple roots, false for a lone root shape, false for an existing mask', () => {
    const doc = makeDoc()
    const a = addShape(doc, PAGE, 'rectangle', {})
    const b = addShape(doc, PAGE, 'ellipse', {})
    let all = getAllShapes(doc, PAGE)
    expect(canUseAsMask([a, b], all)).toBe(true)
    expect(canUseAsMask([a], all)).toBe(false)

    makeMask(doc, PAGE, new Set([a.id, b.id]))
    all = getAllShapes(doc, PAGE)
    const mask = all.find((s) => s.id === a.id)!
    const other = all.find((s) => s.id === b.id)!
    expect(canUseAsMask([mask], all)).toBe(false)
    expect(canUseAsMask([other], all)).toBe(true)
  })
})
