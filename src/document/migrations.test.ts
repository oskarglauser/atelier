import { describe, it, expect } from 'vitest'
import { runMigrations, getSchemaVersion, CURRENT_SCHEMA_VERSION } from './migrations'
import { getAllShapes } from './operations'
import { makeLegacyDoc, legacyFrame, legacyRect } from './__fixtures__/legacyDoc'

const parentOf = (doc: Parameters<typeof getAllShapes>[0], pageId: string, id: string) =>
  getAllShapes(doc, pageId).find((s) => s.id === id)?.parentId

describe('runMigrations', () => {
  it('stamps the current version on an unversioned document', () => {
    const { doc } = makeLegacyDoc({ shapes: [legacyRect] })
    expect(getSchemaVersion(doc)).toBe(0)

    const result = runMigrations(doc)

    expect(getSchemaVersion(doc)).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.from).toBe(0)
    expect(result.to).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('does no work on an already-current document', () => {
    const { doc } = makeLegacyDoc({
      shapes: [legacyRect],
      schemaVersion: CURRENT_SCHEMA_VERSION,
    })
    const before = Y_snapshot(doc)

    const result = runMigrations(doc)

    expect(result.applied).toEqual([])
    expect(Y_snapshot(doc)).toBe(before)
  })

  it('is idempotent', () => {
    const { doc, pageId } = makeLegacyDoc({
      shapes: [legacyFrame, { ...legacyRect, parentId: 'ghost' }],
    })

    runMigrations(doc)
    const afterFirst = getAllShapes(doc, pageId).map((s) => [s.id, s.parentId])
    runMigrations(doc)
    const afterSecond = getAllShapes(doc, pageId).map((s) => [s.id, s.parentId])

    expect(afterSecond).toEqual(afterFirst)
  })
})

describe('parent link repair', () => {
  it('clears a parentId pointing at a shape that no longer exists', () => {
    // Without this the shape is filtered out of the root list yet has no
    // container to render it, so it vanishes and cannot be selected.
    const { doc, pageId } = makeLegacyDoc({
      shapes: [{ ...legacyRect, parentId: 'deleted-frame' }],
    })

    runMigrations(doc)

    expect(parentOf(doc, pageId, 'rect-legacy')).toBeNull()
  })

  it('clears a parentId pointing at a non-container', () => {
    const { doc, pageId } = makeLegacyDoc({
      shapes: [legacyRect, { ...legacyRect, id: 'rect-child', parentId: 'rect-legacy' }],
    })

    runMigrations(doc)

    expect(parentOf(doc, pageId, 'rect-child')).toBeNull()
  })

  it('clears a self-referencing parentId', () => {
    const { doc, pageId } = makeLegacyDoc({
      shapes: [{ ...legacyFrame, parentId: 'frame-legacy' }],
    })

    runMigrations(doc)

    expect(parentOf(doc, pageId, 'frame-legacy')).toBeNull()
  })

  it('breaks a parent cycle', () => {
    const { doc, pageId } = makeLegacyDoc({
      shapes: [
        { ...legacyFrame, id: 'frame-a', parentId: 'frame-b' },
        { ...legacyFrame, id: 'frame-b', parentId: 'frame-a' },
      ],
    })

    runMigrations(doc)

    const parents = [parentOf(doc, pageId, 'frame-a'), parentOf(doc, pageId, 'frame-b')]
    expect(parents.filter((p) => p === null).length).toBeGreaterThan(0)
    // Whatever survives must terminate rather than loop
    expect(parents).not.toEqual(['frame-b', 'frame-a'])
  })

  it('leaves a valid container parent alone', () => {
    const { doc, pageId } = makeLegacyDoc({
      shapes: [legacyFrame, { ...legacyRect, parentId: 'frame-legacy' }],
    })

    runMigrations(doc)

    expect(parentOf(doc, pageId, 'rect-legacy')).toBe('frame-legacy')
  })
})

/** Cheap structural fingerprint for "nothing changed" assertions */
function Y_snapshot(doc: Parameters<typeof getAllShapes>[0]): string {
  return JSON.stringify({
    meta: doc.getMap('meta').toJSON(),
    pages: doc.getArray('pages').toJSON(),
  })
}
