import type { Shape, ShapeType } from '../types/document'
import { generateId } from '../utils/id'
import { DEFAULT_FILL, DEFAULT_STROKE, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT, DEFAULT_TEXT } from '../utils/constants'

const baseDefaults = {
  name: '',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  lockProportions: false,
  fill: DEFAULT_FILL,
  stroke: DEFAULT_STROKE,
  strokeWidth: DEFAULT_STROKE_WIDTH,
  parentId: null,
  // Placeholder — addShape assigns the real value from the sibling group,
  // since only the document knows what else is on the page.
  order: 0,
}

const typeDefaults: Record<ShapeType, Partial<Shape>> = {
  rectangle: { cornerRadius: [0, 0, 0, 0] },
  ellipse: {},
  line: { points: [0, 0, 100, 0], fill: '', stroke: '#000000', strokeWidth: 2, startCap: 'none', endCap: 'none' },
  path: { pathData: '', closed: false, fill: '', stroke: '#000000', strokeWidth: 2 },
  text: {
    text: DEFAULT_TEXT,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: DEFAULT_FONT_WEIGHT,
    fontStyle: 'normal' as const,
    textAlign: 'left' as const,
    verticalAlign: 'top' as const,
    lineHeight: 1.3,
    letterSpacing: -0.5,
    textDecoration: 'none' as const,
    textTransform: 'none' as const,
    paragraphSpacing: 0,
    kerning: [],
    fill: '#000000',
    width: 300,
    height: 36,
  },
  image: { src: '', objectFit: 'cover' },
  frame: { clipContent: true, backgroundColor: '#ffffff', width: 400, height: 300, rulers: [], exports: [] },
  group: {},
}

export function typeLabel(type: ShapeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1)
}

/**
 * Next free "Rectangle N" style name for a type, derived from the shapes that
 * already exist. Previously a module-global counter, which meant every peer
 * (and every browser tab) independently produced "Rectangle 1".
 */
export function nextShapeName(type: ShapeType, existing: { type: string; name?: string }[]): string {
  const label = typeLabel(type)
  const pattern = new RegExp(`^${label} (\\d+)$`)
  let max = 0
  for (const s of existing) {
    if (s.type !== type) continue
    const m = pattern.exec(s.name ?? '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${label} ${max + 1}`
}

export function createShapeData(type: ShapeType, overrides: Partial<Shape> = {}): Shape {
  return {
    ...baseDefaults,
    ...typeDefaults[type],
    name: typeLabel(type),
    ...overrides,
    // id and type come after the spread so callers that pass a whole existing
    // shape as overrides (paste, duplicate) can never reuse an existing id
    id: generateId(),
    type,
  } as Shape
}
