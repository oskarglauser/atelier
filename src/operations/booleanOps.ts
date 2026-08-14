import type { Shape } from '../types/document'
import { getPaperScope, shapeToPaperPath, boundsNormalize } from './paperScope'

type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude'

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

    const normalized = boundsNormalize(scope, result)

    // Cleanup
    result.remove()
    paths.forEach((p) => p.remove())

    return normalized
  } catch (e) {
    console.error('Boolean operation failed:', e)
    return null
  }
}
