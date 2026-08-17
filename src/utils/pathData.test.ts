import { describe, it, expect } from 'vitest'
import { countSubpaths } from './pathData'

describe('countSubpaths', () => {
  it('counts absolute M commands', () => {
    expect(countSubpaths('M 0 0 L 10 0 Z M 20 20 L 30 20 Z')).toBe(2)
  })

  it('counts relative m commands', () => {
    expect(countSubpaths('M0,0 L10,0 z m5,5 l2,2')).toBe(2)
  })

  it('is 1 for a simple path with curves', () => {
    expect(countSubpaths('M 0 0 C 1 1 2 2 3 3 Q 4 4 5 5 Z')).toBe(1)
  })

  it('counts unclosed subpaths', () => {
    expect(countSubpaths('M 0 0 L 5 5 M 10 10 L 15 15 M 20 20 L 25 25')).toBe(3)
  })

  it('is not fooled by exponent notation', () => {
    expect(countSubpaths('M 1e-5 2E+3 L 10 0 Z')).toBe(1)
  })

  it('returns 0 for empty input', () => {
    expect(countSubpaths('')).toBe(0)
  })
})
