import * as Y from 'yjs'
import { getShapesArray } from './createDoc'

export function createUndoManager(doc: Y.Doc, pageId: string): Y.UndoManager {
  const shapes = getShapesArray(doc, pageId)
  return new Y.UndoManager([shapes], {
    captureTimeout: 300,
    // Only edits made by this client (origin 'local') are undoable. Remote
    // peers apply updates with the provider object as origin, so they are
    // never captured here.
    trackedOrigins: new Set(['local']),
    // Without this, undoing a local edit also reverts any key a remote peer
    // changed on the same shape afterwards, silently clobbering their work.
    ignoreRemoteMapChanges: true,
  })
}
