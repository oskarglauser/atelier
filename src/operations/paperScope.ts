import type { Shape, PathShape, RectangleShape, LineShape } from '../types/document'

let paperScope: paper.PaperScope | null = null

/**
 * Lazily set up the DEFAULT Paper scope (the module's own instance), not a
 * private `new PaperScope()`. paperjs-offset constructs items against its own
 * `import paper from 'paper'` binding and reads `paper.project` from it, so a
 * private scope would leave that binding's project undefined. One shared,
 * initialized default scope serves both libraries.
 */
export async function getPaperScope(): Promise<paper.PaperScope> {
  if (paperScope) return paperScope
  const paperModule = await import('paper')
  const paper = (paperModule.default || paperModule) as paper.PaperScope
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  paper.setup(canvas)
  paperScope = paper
  return paperScope
}

/**
 * Translate the item so pathData is in shape-local coordinates (origin 0,0)
 * with the page position carried in x/y — the storage convention for
 * PathShape everywhere in the app.
 */
export function boundsNormalize(
  scope: paper.PaperScope,
  item: paper.PathItem
): { pathData: string; x: number; y: number; width: number; height: number } | null {
  const bounds = item.bounds
  if (!item.pathData || bounds.width === 0 || bounds.height === 0) return null
  item.translate(new scope.Point(-bounds.x, -bounds.y))
  return {
    pathData: item.pathData,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

export function shapeToPaperPath(scope: paper.PaperScope, shape: Shape): paper.PathItem | null {
  try {
    const item = shapeToPaperPathUnrotated(scope, shape)
    if (!item) return null
    // Bake rotation into the geometry. Konva rotates nodes about their origin
    // (x, y) — shapes set no offset — so pivot there, not at the center.
    if (shape.rotation) {
      item.rotate(shape.rotation, new scope.Point(shape.x, shape.y))
    }
    return item
  } catch (e) {
    console.error('Failed to convert shape to paper path:', shape.type, e)
    return null
  }
}

function shapeToPaperPathUnrotated(scope: paper.PaperScope, shape: Shape): paper.PathItem | null {
  switch (shape.type) {
    case 'rectangle': {
      const r = shape as RectangleShape
      if (r.cornerRadius && r.cornerRadius[0] > 0) {
        return new scope.Path.Rectangle(
          new scope.Rectangle(r.x, r.y, r.width, r.height),
          new scope.Size(r.cornerRadius[0], r.cornerRadius[0])
        )
      }
      return new scope.Path.Rectangle(
        new scope.Point(r.x, r.y),
        new scope.Size(r.width, r.height)
      )
    }
    case 'ellipse': {
      return new scope.Path.Ellipse(
        new scope.Rectangle(shape.x, shape.y, shape.width, shape.height)
      )
    }
    case 'line': {
      const l = shape as LineShape
      const pts = l.points
      if (!pts || pts.length < 4) return null
      const sx = l.scaleX ?? 1
      const sy = l.scaleY ?? 1
      const segments: paper.Point[] = []
      for (let i = 0; i + 1 < pts.length; i += 2) {
        segments.push(new scope.Point(l.x + pts[i] * sx, l.y + pts[i + 1] * sy))
      }
      const path = new scope.Path(segments)
      path.closed = false
      return path
    }
    case 'path': {
      const p = shape as PathShape
      if (!p.pathData) return null
      const path = scope.project.importSVG(
        `<svg><path d="${p.pathData}"/></svg>`
      ) as paper.Group
      const child = path.firstChild as paper.PathItem
      if (!child) { path.remove(); return null }
      child.remove()
      path.remove()
      // Offset by shape position
      child.translate(new scope.Point(p.x, p.y))
      if (p.scaleX != null || p.scaleY != null) {
        child.scale(p.scaleX ?? 1, p.scaleY ?? 1, new scope.Point(p.x, p.y))
      }
      return child
    }
    default:
      // Fallback: treat any shape as its bounding rectangle
      return new scope.Path.Rectangle(
        new scope.Point(shape.x, shape.y),
        new scope.Size(shape.width, shape.height)
      )
  }
}
