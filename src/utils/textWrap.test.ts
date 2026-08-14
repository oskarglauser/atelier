import { describe, it, expect } from 'vitest'
import { applyWrapStyle, type MeasureFn } from './textWrap'

// 10px per character, spaces included — makes expected break points exact
const mono: MeasureFn = (t) => t.length * 10

describe('applyWrapStyle', () => {
  it('auto returns the input untouched', () => {
    expect(applyWrapStyle('one two three', 'auto', 50, mono)).toBe('one two three')
  })

  it('zero or negative width returns the input untouched', () => {
    expect(applyWrapStyle('one two', 'balance', 0, mono)).toBe('one two')
  })

  describe('balance', () => {
    it('evens out a long first line with a fragment below', () => {
      // Greedy at 130: "one two three" (13ch=130) fits, "four" wraps → 2 lines
      // Balance narrows until 2 lines even out: "one two" / "three four"
      const result = applyWrapStyle('one two three four', 'balance', 130, mono)
      expect(result).toBe('one two\nthree four')
    })

    it('never changes the line count', () => {
      const text = 'aa bb cc dd ee ff'
      const width = 170 // greedy: all on one line (17ch = 170)
      expect(applyWrapStyle(text, 'balance', width, mono)).toBe(text)
    })

    it('single word is untouched', () => {
      expect(applyWrapStyle('hello', 'balance', 30, mono)).toBe('hello')
    })

    it('treats existing newlines as paragraph boundaries', () => {
      const result = applyWrapStyle('one two three four\nsolo', 'balance', 130, mono)
      expect(result).toBe('one two\nthree four\nsolo')
    })
  })

  describe('pretty', () => {
    it('rescues an orphan by pulling a word down', () => {
      // Greedy at 110: "aaa bbb ccc" (11ch=110) / "dd" → orphan
      // Pretty: "aaa bbb" / "ccc dd"
      const result = applyWrapStyle('aaa bbb ccc dd', 'pretty', 110, mono)
      expect(result).toBe('aaa bbb\nccc dd')
    })

    it('leaves the orphan when the pair would overflow', () => {
      // Greedy at 100: "aaaa bbbb" (9ch=90) / "cccccc"; pair "bbbb cccccc" = 11ch=110 > 100
      const result = applyWrapStyle('aaaa bbbb cccccc', 'pretty', 100, mono)
      expect(result).toBe('aaaa bbbb\ncccccc')
    })

    it('keeps greedy breaks when the last line has multiple words', () => {
      // Greedy at 70: "one two" / "three x" — no orphan, nothing to fix
      const result = applyWrapStyle('one two three x', 'pretty', 70, mono)
      expect(result).toBe('one two\nthree x')
    })

    it('does not steal from a single-word previous line', () => {
      // Two long words, each its own line: nothing to pull without emptying a line
      const result = applyWrapStyle('aaaaaaa bb', 'pretty', 70, mono)
      expect(result).toBe('aaaaaaa\nbb')
    })
  })

  it('preserves content exactly — a break replaces one space, nothing else', () => {
    // Runs of spaces, edge spaces: re-joining broken lines must reconstruct
    // the original text byte-for-byte. Wrap styles move breaks, never edit.
    for (const text of ['one    two three four', ' leading and  double ', 'a  b  c  d  e']) {
      for (const style of ['balance', 'pretty'] as const) {
        const result = applyWrapStyle(text, style, 60, mono)
        expect(result.replace(/\n/g, ' ')).toBe(text)
      }
    }
  })
})
