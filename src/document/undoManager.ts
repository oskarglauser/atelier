import * as Y from 'yjs'
import { getShapesArray } from './createDoc'

export function createUndoManager(doc: Y.Doc, pageId: string): Y.UndoManager {
  const shapes = getShapesArray(doc, pageId)
  return new Y.UndoManager([shapes], {
    captureTimeout: 300,
    trackedOrigins: new Set(['local']),
  })
}
