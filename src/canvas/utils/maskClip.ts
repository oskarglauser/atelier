import type { Shape, PathShape, RectangleShape } from '../../types/document'

const TWO_PI = Math.PI * 2

/**
 * Parsed-path cache: Path2D construction from a `d` string is the expensive
 * part and clipFunc runs on every draw. Bounded — cleared wholesale when it
 * grows past the cap (masks in a document number in the tens at most).
 */
const pathCache = new Map<string, Path2D>()
const PATH_CACHE_CAP = 200

function basePath2D(d: string): Path2D {
  let p = pathCache.get(d)
  if (!p) {
    if (pathCache.size > PATH_CACHE_CAP) pathCache.clear()
    p = new Path2D(d)
    pathCache.set(d, p)
  }
  return p
}

/**
 * The mask shape's geometry as a Path2D in page-absolute coordinates, plus
 * the fill rule to clip with.
 *
 * Coordinate space: the clip Group sits at (0,0) inside the container's
 * (-x,-y) wrapper, so its local space IS page space — geometry lands at the
 * shape's absolute x/y. Rotation pivots at the shape origin, matching Konva.
 * Konva's Context.clip(...) forwards arguments to the native context, so the
 * caller can pass [path, rule] straight through from a clipFunc return.
 */
export function maskShapeToPath2D(shape: Shape): { path: Path2D; rule: CanvasFillRule } {
  const out = new Path2D()
  const m = new DOMMatrix()
    .translateSelf(shape.x, shape.y)
    .rotateSelf(shape.rotation || 0)
  let rule: CanvasFillRule = 'nonzero'

  switch (shape.type) {
    case 'ellipse': {
      const local = new Path2D()
      local.ellipse(shape.width / 2, shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, TWO_PI)
      out.addPath(local, m)
      break
    }
    case 'path': {
      const p = shape as PathShape
      rule = p.fillRule ?? 'nonzero'
      const scaled = m.scaleSelf(p.scaleX ?? 1, p.scaleY ?? 1)
      out.addPath(basePath2D(p.pathData), scaled)
      break
    }
    case 'rectangle': {
      const r = shape as RectangleShape
      const radius = r.cornerRadius?.[0] ?? 0
      const local = new Path2D()
      if (radius > 0) local.roundRect(0, 0, r.width, r.height, radius)
      else local.rect(0, 0, r.width, r.height)
      out.addPath(local, m)
      break
    }
    default: {
      // Text/image/etc mask as their bounding box in v1
      const local = new Path2D()
      local.rect(0, 0, shape.width, shape.height)
      out.addPath(local, m)
    }
  }

  return { path: out, rule }
}
