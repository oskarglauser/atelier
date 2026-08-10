import type { Shape, PathShape, RectangleShape } from '../types/document'

type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude'

let paperScope: paper.PaperScope | null = null

async function getPaperScope(): Promise<paper.PaperScope> {
  if (paperScope) return paperScope
  const paperModule = await import('paper')
  const paper = paperModule.default || paperModule
  paperScope = new paper.PaperScope()
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  paperScope.setup(canvas)
  return paperScope
}

export async function performBooleanOp(
  shapes: Shape[],
  op: BooleanOp
): Promise<{ pathData: string; x: number; y: number; width: number; height: number } | null> {
  if (shapes.length < 2) return null

  const scope = await getPaperScope()

  try {
    // Activate this scope so all operations use it
    scope.activate()

    const paths = shapes
      .map((s) => shapeToPaperPath(scope, s))
      .filter((p): p is paper.PathItem => p !== null)

    if (paths.length < 2) return null

    let result: paper.PathItem = paths[0]
    for (let i = 1; i < paths.length; i++) {
      const prev = result
      switch (op) {
        case 'union':
          result = result.unite(paths[i])
          break
        case 'subtract':
          result = result.subtract(paths[i])
          break
        case 'intersect':
          result = result.intersect(paths[i])
          break
        case 'exclude':
          result = result.exclude(paths[i])
          break
      }
      if (prev !== result) prev.remove()
    }

    const pathData = result.pathData
    const bounds = result.bounds

    if (!pathData || bounds.width === 0 || bounds.height === 0) {
      result.remove()
      paths.forEach((p) => p.remove())
      return null
    }

    // Normalize path data relative to bounds origin
    result.translate(new scope.Point(-bounds.x, -bounds.y))
    const normalizedPathData = result.pathData

    // Cleanup
    result.remove()
    paths.forEach((p) => p.remove())

    return {
      pathData: normalizedPathData,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
  } catch (e) {
    console.error('Boolean operation failed:', e)
    return null
  }
}

function shapeToPaperPath(scope: paper.PaperScope, shape: Shape): paper.PathItem | null {
  try {
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
  } catch (e) {
    console.error('Failed to convert shape to paper path:', shape.type, e)
    return null
  }
}
