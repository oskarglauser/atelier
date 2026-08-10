import { Shape as KonvaShape } from 'react-konva'
import type { ImageShape as ImageShapeType, ImageObjectFit } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useEffect, useState, useMemo, useCallback } from 'react'
import type Konva from 'konva'
import { rgbToCmyk, cmykToRgb, rgbToHsl, hslToRgb, cmykGamutFactor } from '../../utils/colorConvert'
import { rectHitFunc, NOOP } from '../utils/shapeHelpers'

interface Props {
  shape: ImageShapeType
  onSelect: (id: string, e: MouseEvent) => void
  cmykEmulation?: boolean
}

// LRU cache for CMYK-emulated canvases (max 20 entries)
const CMYK_CACHE_MAX = 20
const cmykCanvasCache = new Map<string, HTMLCanvasElement>()

function createCmykEmulatedCanvas(source: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = source.naturalWidth
  canvas.height = source.naturalHeight
  const ctx2d = canvas.getContext('2d')!
  ctx2d.drawImage(source, 0, 0)
  const imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const cmyk = rgbToCmyk(data[i], data[i + 1], data[i + 2])
    let [r2, g2, b2] = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k)
    const hsl = rgbToHsl(r2, g2, b2)
    const h = hsl[0]
    let s = hsl[1]
    const l = hsl[2]

    if (s > 0) {
      s *= cmykGamutFactor(h)
      s *= 0.85
      ;[r2, g2, b2] = hslToRgb(h, s, l)
    }

    if (l > 0.85) {
      const blend = Math.min(0.4, (l - 0.85) / 0.15 * 0.4)
      r2 = Math.round(r2 * (1 - blend) + 250 * blend)
      g2 = Math.round(g2 * (1 - blend) + 248 * blend)
      b2 = Math.round(b2 * (1 - blend) + 245 * blend)
    }

    data[i] = r2
    data[i + 1] = g2
    data[i + 2] = b2
  }

  ctx2d.putImageData(imageData, 0, 0)
  return canvas
}

export const ImageShapeComponent = memo(function ImageShapeComponent({ shape, onSelect, cmykEmulation }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!shape.src) return
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = shape.src
  }, [shape.src])

  // CMYK emulated canvas, derived from the loaded image (module-level LRU cache)
  const cmykCanvas = useMemo(() => {
    if (!cmykEmulation || !image) return null
    const cacheKey = shape.src + '::cmyk'
    const cached = cmykCanvasCache.get(cacheKey)
    if (cached) return cached
    const canvas = createCmykEmulatedCanvas(image)
    // Evict oldest if over limit
    if (cmykCanvasCache.size >= CMYK_CACHE_MAX) {
      const firstKey = cmykCanvasCache.keys().next().value!
      cmykCanvasCache.delete(firstKey)
    }
    cmykCanvasCache.set(cacheKey, canvas)
    return canvas
  }, [cmykEmulation, shape.src, image])

  // The drawable source: either the CMYK canvas or the original image
  const displaySource: CanvasImageSource | null = cmykEmulation && cmykCanvas ? cmykCanvas : image
  const naturalWidth = image?.naturalWidth ?? 0
  const naturalHeight = image?.naturalHeight ?? 0

  // Normalize legacy fit modes to new values
  const objectFit: ImageObjectFit = (() => {
    const raw = shape.objectFit
    if (raw === 'contain') return 'contain'
    if (raw === 'cover') return 'cover'
    if ((raw as string) === 'fit') return 'contain'
    return 'cover'
  })()

  const commonEvents = useMemo(() => ({
    onDragEnd: NOOP,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => onSelect(shape.id, e.evt),
    onMouseEnter: () => setHoveredId(shape.id),
    onMouseLeave: () => setHoveredId(null),
  }), [shape.id, onSelect, setHoveredId])

  const sceneFunc = useCallback((ctx: Konva.Context, konvaShape: Konva.Shape) => {
    if (!displaySource) return
    const w = konvaShape.width()
    const h = konvaShape.height()

    const scale = objectFit === 'contain'
      ? Math.min(w / naturalWidth, h / naturalHeight)
      : Math.max(w / naturalWidth, h / naturalHeight)
    const drawW = naturalWidth * scale
    const drawH = naturalHeight * scale
    const dx = (w - drawW) / 2
    const dy = (h - drawH) / 2

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    ctx.drawImage(displaySource, dx, dy, drawW, drawH)
    ctx.restore()

    if (shape.stroke) {
      ctx.strokeStyle = shape.stroke
      ctx.lineWidth = shape.strokeWidth || 1
      ctx.strokeRect(0, 0, w, h)
    }
  }, [displaySource, objectFit, naturalWidth, naturalHeight, shape.stroke, shape.strokeWidth])

  if (!displaySource) return null

  return (
    <KonvaShape
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      opacity={shape.opacity}
      visible={shape.visible}
      draggable={!shape.locked}
      sceneFunc={sceneFunc}
      hitFunc={rectHitFunc}
      {...commonEvents}
    />
  )
})
