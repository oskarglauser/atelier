import type { Shape } from '../../types/document'

export interface MaskSegment {
  mask: Shape
  /** Siblings above the mask, up to (not including) the next mask child */
  content: Shape[]
}

/**
 * Split a container's children (array order, bottom→top) into the run below
 * the first mask and one segment per mask child. An invisible mask does not
 * clip — it is treated as ordinary content, so hiding a mask reveals the
 * shapes it was clipping.
 */
export function partitionMaskSegments(children: Shape[]): {
  leading: Shape[]
  segments: MaskSegment[]
} {
  const leading: Shape[] = []
  const segments: MaskSegment[] = []

  for (const child of children) {
    if (child.isMask && child.visible) {
      segments.push({ mask: child, content: [] })
    } else if (segments.length === 0) {
      leading.push(child)
    } else {
      segments[segments.length - 1].content.push(child)
    }
  }

  return { leading, segments }
}
