export type TextWrapStyle = 'auto' | 'balance' | 'pretty'

/** Returns the rendered width of a line of text */
export type MeasureFn = (text: string) => number

/**
 * Greedy word wrap at single-space boundaries. Splitting on ' ' (not / +/)
 * keeps runs of spaces as empty tokens, so joining with ' ' reconstructs the
 * paragraph byte-for-byte — wrap styles must move line breaks, never edit
 * content. A word wider than maxWidth gets its own overflowing line; Konva
 * then char-breaks that line on render (its word mode falls back to char
 * wrapping), which degrades the balance target but stays readable.
 */
function greedyWrap(words: string[], maxWidth: number, measure: MeasureFn): string[][] {
  const lines: string[][] = []
  let current: string[] = []
  for (const word of words) {
    if (current.length === 0) {
      current = [word]
      continue
    }
    if (measure([...current, word].join(' ')) <= maxWidth) {
      current.push(word)
    } else {
      lines.push(current)
      current = [word]
    }
  }
  if (current.length > 0) lines.push(current)
  return lines
}

/**
 * Balance: the narrowest wrap width that still fits the greedy line count,
 * so lines come out visually even instead of a full first line and a
 * fragment below. Line count never changes.
 */
function balanceParagraph(words: string[], maxWidth: number, measure: MeasureFn): string[][] {
  const target = greedyWrap(words, maxWidth, measure)
  if (target.length <= 1) return target

  let lo = Math.max(...words.map((w) => measure(w)))
  let hi = maxWidth
  // Binary search on width; 1px resolution is below visual perception
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2
    if (greedyWrap(words, mid, measure).length <= target.length) hi = mid
    else lo = mid
  }
  return greedyWrap(words, hi, measure)
}

/**
 * Pretty: greedy wrap, then rescue an orphan — a lone word on the last
 * line — by pulling the previous line's last word down when the pair still
 * fits. Everything else keeps its greedy break, so the cost over 'auto' is
 * one slightly-short penultimate line.
 */
function prettyParagraph(words: string[], maxWidth: number, measure: MeasureFn): string[][] {
  const lines = greedyWrap(words, maxWidth, measure)
  if (lines.length < 2) return lines
  const last = lines[lines.length - 1]
  const prev = lines[lines.length - 2]
  if (last.length === 1 && last[0].length > 0 && prev.length >= 2) {
    const pulled = prev[prev.length - 1]
    if (measure(`${pulled} ${last[0]}`) <= maxWidth) {
      lines[lines.length - 2] = prev.slice(0, -1)
      lines[lines.length - 1] = [pulled, ...last]
    }
  }
  return lines
}

/**
 * Re-break `text` for the given wrap style, returning text with explicit
 * newlines. Existing newlines are paragraph boundaries and always kept.
 * 'auto' returns the input untouched — Konva's own wrapping is already
 * correct there and cheaper.
 */
export function applyWrapStyle(
  text: string,
  style: TextWrapStyle,
  maxWidth: number,
  measure: MeasureFn
): string {
  if (style === 'auto' || maxWidth <= 0) return text
  // The balance search re-measures the same candidate lines across ~10
  // iterations; caching turns the quadratic pass into roughly one measure
  // per distinct prefix.
  const cache = new Map<string, number>()
  const cached: MeasureFn = (t) => {
    let w = cache.get(t)
    if (w === undefined) {
      w = measure(t)
      cache.set(t, w)
    }
    return w
  }
  return text
    .split('\n')
    .map((paragraph) => {
      if (paragraph.trim().length === 0) return paragraph
      const words = paragraph.split(' ')
      const lines =
        style === 'balance'
          ? balanceParagraph(words, maxWidth, cached)
          : prettyParagraph(words, maxWidth, cached)
      return lines.map((l) => l.join(' ')).join('\n')
    })
    .join('\n')
}

let measureCanvasCtx: CanvasRenderingContext2D | null | undefined

/**
 * A MeasureFn matching Konva's Text measurement: canvas measureText with the
 * same font string Konva builds (each comma-separated family quoted when it
 * contains a space, mirroring Konva's normalizeFontFamily), plus
 * letterSpacing per character. The canvas is module-level — contexts carry a
 * backing store and must not be allocated per call.
 */
export function makeKonvaMeasure(opts: {
  fontFamily: string
  fontSize: number
  fontStyle: string
  fontVariant?: string
  letterSpacing: number
}): MeasureFn {
  if (measureCanvasCtx === undefined) {
    measureCanvasCtx = document.createElement('canvas').getContext('2d')
  }
  const ctx = measureCanvasCtx
  if (!ctx) return (t) => t.length * opts.fontSize * 0.6
  const family = opts.fontFamily
    .split(',')
    .map((f) => {
      const trimmed = f.trim()
      return trimmed.includes(' ') && !/["']/.test(trimmed) ? `"${trimmed}"` : trimmed
    })
    .join(', ')
  const font = `${opts.fontStyle} ${opts.fontVariant ?? 'normal'} ${opts.fontSize}px ${family}`
  return (text: string) => {
    ctx.font = font
    return ctx.measureText(text).width + text.length * opts.letterSpacing
  }
}
