import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDoc, ensureDefaultPage, getPages, getShapesArray } from './createDoc'
import { addShape, updateShape, getAllShapes } from './operations'
import type { Shape, TextShape } from '../types/document'

/**
 * Writing a field that already holds the same value used to record a real Yjs
 * change: an undo entry that reverts nothing visible, and an update sent to
 * every peer. Callers pass whole objects, so unchanged fields ride along
 * constantly — which only became obvious once text published while you type.
 */

/** A doc with its default page created, and that page's id. */
function setup() {
  const doc = createDoc()
  ensureDefaultPage(doc)
  return { doc, pageId: getPages(doc)[0].id }
}

/** Updates this doc would send to a peer, counted as they are produced. */
function countUpdates(doc: Y.Doc) {
  const state = { n: 0 }
  doc.on('update', () => {
    state.n++
  })
  return state
}

function read(doc: Y.Doc, pageId: string, id: string) {
  return getAllShapes(doc, pageId).find((s) => s.id === id)
}

const addRect = (doc: Y.Doc, pageId: string) =>
  addShape(doc, pageId, 'rectangle', { x: 0, y: 0, width: 100, height: 50 })

const addText = (doc: Y.Doc, pageId: string, overrides: Partial<Shape>) =>
  addShape(doc, pageId, 'text', overrides)

describe('writing an unchanged value', () => {
  it('sends nothing when a number is rewritten identically', () => {
    const { doc, pageId } = setup()
    const { id } = addRect(doc, pageId)

    const updates = countUpdates(doc)
    updateShape(doc, pageId, id, { x: 0 })
    expect(updates.n).toBe(0)

    updateShape(doc, pageId, id, { x: 25 })
    expect(updates.n).toBe(1)
  })

  it('sends nothing when an array is rewritten with equal contents', () => {
    const { doc, pageId } = setup()
    const { id } = addText(doc, pageId, { text: 'hi', kerning: [0, 0] } as Partial<Shape>)

    const updates = countUpdates(doc)
    // A fresh array with the same contents — the case that had typing send a
    // brand new Y.Array four times a second.
    updateShape(doc, pageId, id, { kerning: [0, 0] } as Partial<Shape>)
    expect(updates.n).toBe(0)

    updateShape(doc, pageId, id, { kerning: [0, 1.5] } as Partial<Shape>)
    expect(updates.n).toBe(1)
    expect((read(doc, pageId, id) as TextShape).kerning).toEqual([0, 1.5])
  })

  it('still writes when an array changes length', () => {
    const { doc, pageId } = setup()
    const { id } = addText(doc, pageId, { text: 'hi', kerning: [0, 0] } as Partial<Shape>)

    updateShape(doc, pageId, id, { kerning: [0, 0, 0] } as Partial<Shape>)
    expect((read(doc, pageId, id) as TextShape).kerning).toEqual([0, 0, 0])
  })

  it('leaves no undo entry for a write that changes nothing', () => {
    const { doc, pageId } = setup()
    const { id } = addRect(doc, pageId)
    const shapes = getShapesArray(doc, pageId)

    const undo = new Y.UndoManager([shapes], { trackedOrigins: new Set(['local']) })
    updateShape(doc, pageId, id, { x: 0, width: 100 })
    expect(undo.undoStack.length).toBe(0)

    updateShape(doc, pageId, id, { x: 0, width: 140 })
    expect(undo.undoStack.length).toBe(1)
    undo.destroy()
  })

  it('writes the fields that differ while ignoring the ones that do not', () => {
    const { doc, pageId } = setup()
    const { id } = addRect(doc, pageId)

    const updates = countUpdates(doc)
    // Typical of the editor: a whole object where one field actually moved.
    updateShape(doc, pageId, id, { x: 0, y: 0, width: 100, height: 77 })
    expect(updates.n).toBe(1)
    expect(read(doc, pageId, id)).toMatchObject({ x: 0, y: 0, width: 100, height: 77 })
  })

  it('sends nothing when text is rewritten identically', () => {
    const { doc, pageId } = setup()
    const { id } = addText(doc, pageId, { text: 'hello' } as Partial<Shape>)

    const updates = countUpdates(doc)
    updateShape(doc, pageId, id, { text: 'hello' } as Partial<Shape>)
    expect(updates.n).toBe(0)

    updateShape(doc, pageId, id, { text: 'hello there' } as Partial<Shape>)
    expect(updates.n).toBe(1)
    expect((read(doc, pageId, id) as TextShape).text).toBe('hello there')
  })

  it('does not mistake a shorter array for an equal one', () => {
    const { doc, pageId } = setup()
    const { id } = addText(doc, pageId, { text: 'abc', kerning: [1, 2] } as Partial<Shape>)

    updateShape(doc, pageId, id, { kerning: [1] } as Partial<Shape>)
    expect((read(doc, pageId, id) as TextShape).kerning).toEqual([1])
  })
})
