import type { GradientFill } from '../../types/document'

/**
 * Convert a GradientFill definition into Konva linear gradient props.
 * The angle is in degrees: 0° = top→bottom, 90° = left→right, etc.
 */
export function getGradientProps(
  gradient: GradientFill,
  width: number,
  height: number,
) {
  const rad = ((gradient.angle - 90) * Math.PI) / 180
  const cx = width / 2
  const cy = height / 2
  // Project to the bounding box edge so the gradient always covers the shape
  const diag = Math.sqrt(width * width + height * height) / 2
  const dx = Math.cos(rad) * diag
  const dy = Math.sin(rad) * diag

  const colorStops: (number | string)[] = []
  for (const stop of gradient.stops) {
    colorStops.push(stop.offset, stop.color)
  }

  return {
    fillLinearGradientStartPointX: cx - dx,
    fillLinearGradientStartPointY: cy - dy,
    fillLinearGradientEndPointX: cx + dx,
    fillLinearGradientEndPointY: cy + dy,
    fillLinearGradientColorStops: colorStops,
  }
}
