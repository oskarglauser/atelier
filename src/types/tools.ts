import type Konva from 'konva'

export type ToolType = 'select' | 'frame' | 'rectangle' | 'ellipse' | 'line' | 'pen' | 'freehand' | 'text' | 'image'

export interface ToolHandlers {
  onPointerDown?: (e: Konva.KonvaEventObject<PointerEvent>) => void
  onPointerMove?: (e: Konva.KonvaEventObject<PointerEvent>) => void
  onPointerUp?: (e: Konva.KonvaEventObject<PointerEvent>) => void
  onDoubleClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void
  cursor: string
}
