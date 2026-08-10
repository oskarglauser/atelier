export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 10
export const ZOOM_STEP = 0.1
export const GRID_SIZE = 10
export const NUDGE_AMOUNT = 1
export const NUDGE_AMOUNT_SHIFT = 10

export const DEFAULT_FILL = '#d9d9d9'
export const DEFAULT_STROKE = ''
export const DEFAULT_STROKE_WIDTH = 0
export const DEFAULT_FONT_FAMILY = 'Inter'
export const DEFAULT_FONT_SIZE = 24
export const DEFAULT_FONT_WEIGHT = 400
export const DEFAULT_TEXT = ''

export const SHAPE_MIN_SIZE = 1

export const DEFAULT_GRADIENT = {
  type: 'linear' as const,
  angle: 180,
  stops: [
    { offset: 0, color: '#000000' },
    { offset: 1, color: '#ffffff' },
  ],
  noise: 0,
}
