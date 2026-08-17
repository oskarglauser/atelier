import { describe, it, expect } from 'vitest'
import { partitionMaskSegments } from './maskSegments'
import { createShapeData } from '../../document/schema'
import type { Shape } from '../../types/document'

function shape(overrides: Partial<Shape> = {}): Shape {
  return createShapeData('rectangle', overrides)
}

describe('partitionMaskSegments', () => {
  it('returns everything as leading when there are no masks', () => {
    const children = [shape(), shape(), shape()]
    const { leading, segments } = partitionMaskSegments(children)
    expect(leading).toEqual(children)
    expect(segments).toEqual([])
  })

  it('mask at the bottom clips all siblings above', () => {
    const mask = shape({ isMask: true })
    const a = shape()
    const b = shape()
    const { leading, segments } = partitionMaskSegments([mask, a, b])
    expect(leading).toEqual([])
    expect(segments).toHaveLength(1)
    expect(segments[0].mask).toBe(mask)
    expect(segments[0].content).toEqual([a, b])
  })

  it('mask in the middle leaves shapes below unclipped', () => {
    const below = shape()
    const mask = shape({ isMask: true })
    const above = shape()
    const { leading, segments } = partitionMaskSegments([below, mask, above])
    expect(leading).toEqual([below])
    expect(segments[0].content).toEqual([above])
  })

  it('mask at the top clips nothing but still forms a segment', () => {
    const a = shape()
    const mask = shape({ isMask: true })
    const { leading, segments } = partitionMaskSegments([a, mask])
    expect(leading).toEqual([a])
    expect(segments).toHaveLength(1)
    expect(segments[0].content).toEqual([])
  })

  it('multiple masks segment the run between them', () => {
    const m1 = shape({ isMask: true })
    const a = shape()
    const m2 = shape({ isMask: true })
    const b = shape()
    const c = shape()
    const { leading, segments } = partitionMaskSegments([m1, a, m2, b, c])
    expect(leading).toEqual([])
    expect(segments).toHaveLength(2)
    expect(segments[0].content).toEqual([a])
    expect(segments[1].content).toEqual([b, c])
  })

  it('an invisible mask does not clip', () => {
    const mask = shape({ isMask: true, visible: false })
    const a = shape()
    const { leading, segments } = partitionMaskSegments([mask, a])
    expect(leading).toEqual([mask, a])
    expect(segments).toEqual([])
  })

  it('mask as only child yields one empty segment', () => {
    const mask = shape({ isMask: true })
    const { leading, segments } = partitionMaskSegments([mask])
    expect(leading).toEqual([])
    expect(segments).toHaveLength(1)
    expect(segments[0].content).toEqual([])
  })
})
