import type { Point } from './math'

export function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points
  const first = points[0]
  const last = points[points.length - 1]
  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPath(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function perpendicularDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  if (points.length === 1) return d

  for (let i = 1; i < points.length; i++) {
    if (i < points.length - 1) {
      const curr = points[i]
      const next = points[i + 1]
      const cp2x = curr.x + (next.x - curr.x) * 0.5
      const cp2y = curr.y + (next.y - curr.y) * 0.5
      d += ` Q ${curr.x} ${curr.y} ${(curr.x + cp2x) / 2} ${(curr.y + cp2y) / 2}`
    } else {
      d += ` L ${points[i].x} ${points[i].y}`
    }
  }
  return d
}

export function getPointsBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}
