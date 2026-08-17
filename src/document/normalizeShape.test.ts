import { describe, it, expect } from 'vitest'
import { normalizeShape, yMapToStored, getAllShapes, type StoredShape } from './operations'
import { makeLegacyDoc, legacyFrame, legacyRect, legacyPath, legacyText } from './__fixtures__/legacyDoc'
import type { FrameShape, PathShape, RectangleShape, TextShape } from '../types/document'

describe('normalizeShape', () => {
  it('fills in fields that did not exist when the shape was written', () => {
    const frame = normalizeShape(legacyFrame as StoredShape) as FrameShape
    // The regression this guards: an old frame read back with clipContent
    // undefined renders without a clipFunc and silently does not clip.
    expect(frame.clipContent).toBe(true)
    expect(frame.rulers).toEqual([])
    expect(frame.exports).toEqual([])
    expect(frame.lockProportions).toBe(false)
    expect(frame.visible).toBe(true)
    expect(frame.opacity).toBe(1)
    expect(frame.parentId).toBeNull()
  })

  it('backfills fillRule and isMask on shapes written before they existed', () => {
    const path = normalizeShape(legacyPath as StoredShape) as PathShape
    expect(path.fillRule).toBe('nonzero')
    expect(path.isMask).toBe(false)

    const frame = normalizeShape(legacyFrame as StoredShape)
    expect(frame.isMask).toBe(false)
  })

  it('backfills textWrap and fontVariant on text written before they existed', () => {
    const text = normalizeShape(legacyText as StoredShape) as TextShape
    expect(text.textWrap).toBe('auto')
    expect(text.fontVariant).toBe('normal')
  })

  it('preserves stored fillRule and isMask', () => {
    const path = normalizeShape({ ...legacyPath, fillRule: 'evenodd', isMask: true } as StoredShape) as PathShape
    expect(path.fillRule).toBe('evenodd')
    expect(path.isMask).toBe(true)
  })

  it('applies type-specific defaults', () => {
    const rect = normalizeShape(legacyRect as StoredShape) as RectangleShape
    expect(rect.cornerRadius).toEqual([0, 0, 0, 0])
  })

  it('never overwrites a stored value with a default', () => {
    const rect = normalizeShape({
      ...legacyRect,
      opacity: 0.25,
      fill: '#123456',
    } as StoredShape)
    expect(rect.opacity).toBe(0.25)
    expect(rect.fill).toBe('#123456')
  })

  it('preserves stored values that are falsy', () => {
    // A naive `value || default` would resurrect the defaults here.
    const rect = normalizeShape({
      ...legacyRect,
      visible: false,
      opacity: 0,
      locked: true,
      rotation: 0,
      name: '',
    } as StoredShape)
    expect(rect.visible).toBe(false)
    expect(rect.opacity).toBe(0)
    expect(rect.locked).toBe(true)
  })

  it('treats an explicitly undefined field as absent', () => {
    const rect = normalizeShape({ ...legacyRect, visible: undefined } as StoredShape)
    expect(rect.visible).toBe(true)
  })

  it('keeps id and type intact', () => {
    const frame = normalizeShape(legacyFrame as StoredShape)
    expect(frame.id).toBe('frame-legacy')
    expect(frame.type).toBe('frame')
  })

  it('does not throw on an unrecognised type', () => {
    expect(() =>
      normalizeShape({ id: 'x', type: 'sparkle' } as unknown as StoredShape)
    ).not.toThrow()
  })
})

describe('reading a legacy document', () => {
  it('returns complete shapes so consumers need no per-field guards', () => {
    const { doc, pageId } = makeLegacyDoc({ shapes: [legacyFrame, legacyRect] })
    const shapes = getAllShapes(doc, pageId)

    expect(shapes).toHaveLength(2)
    for (const s of shapes) {
      expect(s.visible).toBeDefined()
      expect(s.opacity).toBeDefined()
      expect(s.locked).toBeDefined()
      expect(s.parentId).not.toBeUndefined()
    }
    expect((shapes[0] as FrameShape).clipContent).toBe(true)
  })

  it('yMapToStored reports only what was actually written', () => {
    const { doc, pageId } = makeLegacyDoc({ shapes: [legacyFrame] })
    const map = doc.getArray(`page:${pageId}:shapes`).get(0)
    const stored = yMapToStored(map as never)

    // The honest read: absent means absent, so the type system stops pretending
    expect(stored.clipContent).toBeUndefined()
    expect('clipContent' in stored).toBe(false)
    expect(stored.id).toBe('frame-legacy')
  })
})
