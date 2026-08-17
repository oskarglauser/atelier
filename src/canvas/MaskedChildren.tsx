import { Fragment, useMemo, useCallback, type ReactNode } from 'react'
import { Group } from 'react-konva'
import type Konva from 'konva'
import type { Shape } from '../types/document'
import { partitionMaskSegments, type MaskSegment } from './utils/maskSegments'
import { maskShapeToPath2D } from './utils/maskClip'

interface Props {
  childShapes: Shape[]
  renderChild: (child: Shape) => ReactNode
}

/**
 * Renders a container's children honoring mask segments: children below the
 * first mask draw normally; each mask child draws at opacity 0 (invisible but
 * still hit-testable, so it stays clickable); the run above it draws inside a
 * Group clipped to the mask's geometry. Konva applies clipFunc to the hit
 * canvas too, so masked-out regions are not clickable — for free.
 */
export function MaskedChildren({ childShapes, renderChild }: Props) {
  const { leading, segments } = useMemo(() => partitionMaskSegments(childShapes), [childShapes])

  if (segments.length === 0) return <>{childShapes.map((child) => renderChild(child))}</>

  return (
    <>
      {leading.map((child) => renderChild(child))}
      {segments.map((segment) => (
        <Fragment key={segment.mask.id}>
          <Group opacity={0}>{renderChild(segment.mask)}</Group>
          <ClippedSegment segment={segment} renderChild={renderChild} />
        </Fragment>
      ))}
    </>
  )
}

function ClippedSegment({ segment, renderChild }: { segment: MaskSegment; renderChild: (c: Shape) => ReactNode }) {
  const { mask } = segment
  // clipFunc runs in this Group's local space, which equals page space (the
  // Group sits at 0,0 inside the container's -x,-y wrapper). Returning
  // [path, rule] passes both through Konva into native ctx.clip().
  const clipFunc = useCallback(
    (_ctx: Konva.Context) => {
      const { path, rule } = maskShapeToPath2D(mask)
      return [path, rule] as unknown as void
    },
    [mask]
  )
  return <Group clipFunc={clipFunc}>{segment.content.map((child) => renderChild(child))}</Group>
}
