/**
 * Number of subpaths in an SVG path `d` string = number of M/m commands.
 * Valid path data contains only command letters (MmLlHhVvCcSsQqTtAaZz),
 * numbers, separators, and exponent markers (e/E), so counting M/m tokens
 * needs no full tokenizer. Used to gate compound-path UI without loading
 * Paper.js.
 */
export function countSubpaths(d: string): number {
  if (!d) return 0
  return (d.match(/[Mm]/g) || []).length
}
