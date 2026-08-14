import * as Y from 'yjs'

/**
 * Builders for documents as older builds wrote them.
 *
 * Shapes are written as raw Y.Maps holding *only* the listed keys, which is
 * what the storage layer actually does — `shapeToYMap` iterates the object, so
 * a field that did not exist in a given version is simply absent from that
 * document forever. Passing partial field sets here reproduces that faithfully
 * without needing binary snapshots checked into the repo.
 */

export interface LegacyDocSpec {
  pageId?: string
  /** Raw stored fields per shape — omit a key to simulate a build predating it */
  shapes: Array<Record<string, unknown>>
  /** Omit to simulate a document written before schema versioning existed */
  schemaVersion?: number
}

export function makeLegacyDoc(spec: LegacyDocSpec): { doc: Y.Doc; pageId: string } {
  const doc = new Y.Doc()
  const pageId = spec.pageId ?? 'page-1'

  doc.transact(() => {
    const page = new Y.Map()
    page.set('id', pageId)
    page.set('name', 'Page 1')
    doc.getArray('pages').push([page])

    const shapesArr = doc.getArray<Y.Map<unknown>>(`page:${pageId}:shapes`)
    shapesArr.push(
      spec.shapes.map((fields) => {
        const map = new Y.Map()
        for (const [k, v] of Object.entries(fields)) map.set(k, v)
        return map
      })
    )

    if (spec.schemaVersion !== undefined) {
      doc.getMap('meta').set('schemaVersion', spec.schemaVersion)
    }
  })

  return { doc, pageId }
}

/**
 * A frame as an early build wrote it: no clipContent, rulers, exports or
 * lockProportions, because none of those fields existed yet.
 */
export const legacyFrame = {
  id: 'frame-legacy',
  type: 'frame',
  name: 'Old Frame',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  backgroundColor: '#ffffff',
}

/** A rectangle from before cornerRadius and lockProportions existed. */
export const legacyRect = {
  id: 'rect-legacy',
  type: 'rectangle',
  name: 'Old Rect',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  fill: '#ff0000',
}
