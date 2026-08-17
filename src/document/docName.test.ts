import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDoc, getDocName, setDocName } from './createDoc'

/**
 * A project's name lives in ProjectMeta, which is per-machine and never syncs.
 * Carrying it in the document too is what stops a collaborator being stuck
 * looking at the placeholder a join starts with.
 */
describe('the document name', () => {
  it('is empty on a document that never carried one', () => {
    // Every document written before the name existed reads back this way.
    expect(getDocName(createDoc())).toBe('')
  })

  it('round-trips', () => {
    const doc = createDoc()
    setDocName(doc, 'Brand system')
    expect(getDocName(doc)).toBe('Brand system')
  })

  it('reaches a peer', () => {
    const a = createDoc()
    const b = createDoc()
    setDocName(a, 'Moodboard')
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    expect(getDocName(b)).toBe('Moodboard')
  })

  it('writes nothing when the name is unchanged', () => {
    const doc = createDoc()
    setDocName(doc, 'Same')
    let updates = 0
    doc.on('update', () => { updates++ })
    setDocName(doc, 'Same')
    expect(updates).toBe(0)
  })

  it('stays off the undo stack', () => {
    // Naming is not a canvas edit; undo must not walk back through it.
    const doc = createDoc()
    const undo = new Y.UndoManager([doc.getMap('meta')], {
      trackedOrigins: new Set(['local']),
    })
    setDocName(doc, 'Not undoable')
    expect(undo.undoStack.length).toBe(0)
    undo.destroy()
  })

  it('takes the later name when two peers both set one', () => {
    // Last writer wins on a Y.Map key, and both replicas must agree on which.
    const a = createDoc()
    const b = createDoc()
    setDocName(a, 'From A')
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    setDocName(b, 'From B')
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    expect(getDocName(a)).toBe(getDocName(b))
    expect(getDocName(a)).toBe('From B')
  })
})
