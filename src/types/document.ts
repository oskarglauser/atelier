export type ShapeType = 'rectangle' | 'ellipse' | 'line' | 'path' | 'text' | 'image' | 'frame' | 'group'

export interface GradientColorStop {
  offset: number  // 0–1
  color: string    // hex
}

export interface GradientFill {
  type: 'linear'
  angle: number          // degrees, 0 = top-to-bottom, 90 = left-to-right
  stops: GradientColorStop[]
  noise: number          // 0–1, amount of noise overlay
}

export interface ShapeBase {
  id: string
  type: ShapeType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  lockProportions: boolean
  colorMode?: 'rgb' | 'cmyk'
  fill: string
  fillType?: 'solid' | 'gradient'
  gradient?: GradientFill
  stroke: string
  strokeWidth: number
  parentId: string | null
}

export interface RectangleShape extends ShapeBase {
  type: 'rectangle'
  cornerRadius: [number, number, number, number]
}

export interface EllipseShape extends ShapeBase {
  type: 'ellipse'
}

export type LineCap = 'none' | 'arrow' | 'circle' | 'square'

export interface LineShape extends ShapeBase {
  type: 'line'
  points: number[]
  scaleX?: number
  scaleY?: number
  startCap: LineCap
  endCap: LineCap
}

export interface PathShape extends ShapeBase {
  type: 'path'
  pathData: string
  closed: boolean
  scaleX?: number
  scaleY?: number
}

export interface TextShape extends ShapeBase {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'middle' | 'bottom'
  lineHeight: number
  letterSpacing: number
  textDecoration: 'none' | 'underline' | 'line-through'
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  paragraphSpacing: number
  kerning: number[]
}

export type ImageObjectFit = 'cover' | 'contain'

export interface ImageShape extends ShapeBase {
  type: 'image'
  src: string
  objectFit: ImageObjectFit
}

export interface FrameRuler {
  id: string
  axis: 'x' | 'y'       // x = vertical line, y = horizontal line
  position: number       // offset from frame origin in px
}

export interface ExportConfig {
  id: string
  format: 'png' | 'svg' | 'jpg' | 'eps' | 'pdf'
  scale: '0.5x' | '1x' | '2x' | '3x' | '4x'
  suffix?: string
}

export interface FrameShape extends ShapeBase {
  type: 'frame'
  clipContent: boolean
  backgroundColor: string
  rulers: FrameRuler[]
  exports: ExportConfig[]
}

export interface GroupShape extends ShapeBase {
  type: 'group'
}

export type Shape = RectangleShape | EllipseShape | LineShape | PathShape | TextShape | ImageShape | FrameShape | GroupShape

export interface Page {
  id: string
  name: string
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  teamId: string | null
  createdBy: string | null
  thumbnail: string | null
}
