import { useMemo } from 'react'
import type { Shape } from '../types/document'
import { useCanvasStore } from '../store/canvasStore'
import { hexToCmykEmulated } from '../utils/colorConvert'
import { RectangleShapeComponent } from './shapes/RectangleShape'
import { EllipseShapeComponent } from './shapes/EllipseShape'
import { LineShapeComponent } from './shapes/LineShape'
import { TextShapeComponent } from './shapes/TextShape'
import { PathShapeComponent } from './shapes/PathShape'
import { ImageShapeComponent } from './shapes/ImageShape'
import { FrameShapeComponent } from './shapes/FrameShape'
import { GroupShapeComponent } from './shapes/GroupShape'

function emulateCmykColor(hex: string | undefined): string {
  if (!hex || hex === 'none' || hex === '' || hex === 'transparent') return hex || ''
  return hexToCmykEmulated(hex)
}

interface Props {
  shape: Shape
  onSelect: (id: string, e: MouseEvent) => void
  allShapes?: Shape[]
}

export function ShapeRenderer({ shape: rawShape, onSelect, allShapes }: Props) {
  const globalColorMode = useCanvasStore((s) => s.colorMode)
  const colorMode = rawShape.colorMode ?? globalColorMode

  const shape = useMemo(() => {
    if (colorMode !== 'cmyk') return rawShape
    const emulated = {
      ...rawShape,
      fill: emulateCmykColor(rawShape.fill),
      stroke: emulateCmykColor(rawShape.stroke),
    }
    if (rawShape.type === 'frame' && 'backgroundColor' in rawShape) {
      (emulated as Record<string, unknown>).backgroundColor = emulateCmykColor((rawShape as { backgroundColor?: string }).backgroundColor)
    }
    // Emulate gradient stop colors for CMYK
    if (rawShape.gradient && rawShape.gradient.stops) {
      (emulated as Record<string, unknown>).gradient = {
        ...rawShape.gradient,
        stops: rawShape.gradient.stops.map((s) => ({
          ...s,
          color: emulateCmykColor(s.color),
        })),
      }
    }
    return emulated as Shape
  }, [rawShape, colorMode])

  switch (shape.type) {
    case 'rectangle':
      return <RectangleShapeComponent shape={shape} onSelect={onSelect} />
    case 'ellipse':
      return <EllipseShapeComponent shape={shape} onSelect={onSelect} />
    case 'line':
      return <LineShapeComponent shape={shape} onSelect={onSelect} />
    case 'text':
      return <TextShapeComponent shape={shape} onSelect={onSelect} />
    case 'path':
      return <PathShapeComponent shape={shape} onSelect={onSelect} />
    case 'image':
      return <ImageShapeComponent shape={shape} onSelect={onSelect} cmykEmulation={colorMode === 'cmyk'} />
    case 'frame': {
      const frameChildren = allShapes?.filter((s) => s.parentId === shape.id) || []
      return <FrameShapeComponent shape={shape} onSelect={onSelect} childShapes={frameChildren} renderChild={(child) => <ShapeRenderer key={child.id} shape={child} onSelect={onSelect} allShapes={allShapes} />} />
    }
    case 'group': {
      const groupChildren = allShapes?.filter((s) => s.parentId === shape.id) || []
      return <GroupShapeComponent shape={shape} onSelect={onSelect} childShapes={groupChildren} renderChild={(child) => <ShapeRenderer key={child.id} shape={child} onSelect={onSelect} allShapes={allShapes} />} />
    }
    default:
      return null
  }
}
