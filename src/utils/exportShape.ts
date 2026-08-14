import type Konva from 'konva'
import type { Shape, TextShape, PathShape, GradientFill } from '../types/document'
import { getShapesBounds } from './math'
import { hexToCmykString, hexToRgb, hexToCmyk } from './colorConvert'
import { useCanvasStore } from '../store/canvasStore'
import { textToOutlines } from '../operations/textToOutlines'
import { getGradientProps } from '../canvas/utils/gradientProps'

export type ExportFormat = 'png' | 'svg' | 'jpg' | 'eps' | 'pdf'
export type ExportScale = '0.5x' | '1x' | '2x' | '3x' | '4x'

export const scaleMap: Record<ExportScale, number> = {
  '0.5x': 0.5,
  '1x': 1,
  '2x': 2,
  '3x': 3,
  '4x': 4,
}

/** Given selected shapes and all shapes, include children of any selected frames */
function gatherFrameChildren(selected: Shape[], allShapes: Shape[]): Shape[] {
  const selectedIds = new Set(selected.map((s) => s.id))
  const frameIds = new Set(selected.filter((s) => s.type === 'frame').map((s) => s.id))
  if (frameIds.size === 0) return selected

  const children = allShapes.filter((s) => s.parentId && frameIds.has(s.parentId) && !selectedIds.has(s.id))
  return [...selected, ...children]
}

export async function exportShapes(
  stage: Konva.Stage,
  shapes: Shape[],
  format: ExportFormat,
  scale: ExportScale,
  includeFrame: boolean,
  zoom: number,
  offsetX: number,
  offsetY: number,
  allShapes?: Shape[],
): Promise<void> {
  if (shapes.length === 0) return

  // Gather children of any selected frames
  const exportShapesList = gatherFrameChildren(shapes, allShapes || [])
  const ids = new Set(exportShapesList.map((s) => s.id))

  if (format === 'svg') {
    await downloadSvg(exportShapesList, scale)
    return
  }

  if (format === 'eps') {
    await downloadEps(exportShapesList, scale)
    return
  }

  if (format === 'pdf') {
    // jsPDF is heavy and PDF export is rare — load on demand
    const { downloadPdf } = await import('./exportPdf')
    await downloadPdf(exportShapesList, scale)
    return
  }

  // Hide rulers during raster export (set state directly to avoid persisting to localStorage)
  const { showRulers } = useCanvasStore.getState()
  if (showRulers) useCanvasStore.setState({ showRulers: false })

  // Wait for React to re-render (unmount FrameRulers)
  await new Promise((r) => requestAnimationFrame(r))

  const shapesLayer = stage.findOne('.shapes-layer') as Konva.Layer | undefined
  if (!shapesLayer) {
    if (showRulers) useCanvasStore.setState({ showRulers: true })
    return
  }

  const hiddenNodes: Konva.Node[] = []
  shapesLayer.children?.forEach((node) => {
    if (!ids.has(node.id())) {
      node.hide()
      hiddenNodes.push(node)
    }
  })

  if (!includeFrame) {
    // Hide frame backgrounds for selected frame shapes
    shapes.forEach((s) => {
      if (s.type === 'frame') {
        const node = stage.findOne(`#${s.id}`)
        if (node) { node.hide(); hiddenNodes.push(node) }
      }
    })
  }

  const overlayLayer = stage.findOne('.overlay-layer') as Konva.Layer | undefined
  overlayLayer?.hide()
  const gridLayer = stage.findOne('.grid-layer') as Konva.Layer | undefined
  gridLayer?.hide()

  const { minX, minY, maxX, maxY } = getShapesBounds(shapes)
  const pixelRatio = scaleMap[scale]

  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
  const dataUrl = stage.toDataURL({
    x: minX * zoom + offsetX,
    y: minY * zoom + offsetY,
    width: (maxX - minX) * zoom,
    height: (maxY - minY) * zoom,
    pixelRatio,
    mimeType,
    quality: format === 'jpg' ? 0.92 : undefined,
  })

  hiddenNodes.forEach((n) => n.show())
  overlayLayer?.show()
  gridLayer?.show()
  if (showRulers) useCanvasStore.setState({ showRulers: true })

  // Download file
  const ext = format === 'jpg' ? 'jpg' : 'png'
  const name = shapes.length === 1 ? (shapes[0].name || 'export') : 'export'
  downloadDataUrl(dataUrl, `${name}@${scale}.${ext}`)
}

export function exportColor(hex: string | undefined, shapeColorMode?: 'rgb' | 'cmyk'): string {
  if (!hex || hex === 'none' || hex === '') return 'none'
  const isCmyk = (shapeColorMode ?? useCanvasStore.getState().colorMode) === 'cmyk'
  return isCmyk ? hexToCmykString(hex) : hex
}

function svgGradientDef(id: string, gradient: GradientFill, width: number, height: number): string {
  const gp = getGradientProps(gradient, width, height)
  const x1 = (gp.fillLinearGradientStartPointX / width * 100).toFixed(2)
  const y1 = (gp.fillLinearGradientStartPointY / height * 100).toFixed(2)
  const x2 = (gp.fillLinearGradientEndPointX / width * 100).toFixed(2)
  const y2 = (gp.fillLinearGradientEndPointY / height * 100).toFixed(2)
  const stops = gradient.stops.map((s) =>
    `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.color}" />`
  ).join('')
  return `<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient>`
}

export async function shapesToSvgString(shapes: Shape[], scaleFactor = 1): Promise<string> {
  const { minX, minY, maxX, maxY } = getShapesBounds(shapes)
  const w = maxX - minX
  const h = maxY - minY

  const globalColorMode = useCanvasStore.getState().colorMode
  const defs: string[] = []
  const elements: string[] = []
  // Mask shapes don't paint; they open a clipPath around the siblings that
  // follow them (until the parent changes or another mask starts). Relies on
  // siblings being contiguous in document order, which they are.
  let openMaskParent: string | null | false = false
  for (let si = 0; si < shapes.length; si++) {
    const shape = shapes[si]
    const x = shape.x - minX
    const y = shape.y - minY

    if (shape.isMask && shape.visible !== false) {
      if (openMaskParent !== false) elements.push('</g>')
      const clipId = `mask-${si}`
      defs.push(`<clipPath id="${clipId}">${maskGeometrySvg(shape, x, y)}</clipPath>`)
      elements.push(`<g clip-path="url(#${clipId})">`)
      openMaskParent = shape.parentId ?? null
      continue
    }
    if (openMaskParent !== false && (shape.parentId ?? null) !== openMaskParent) {
      elements.push('</g>')
      openMaskParent = false
    }

    const effectiveMode = shape.colorMode ?? globalColorMode
    const stroke = exportColor(shape.stroke, effectiveMode)
    const sw = shape.strokeWidth || 0

    const isGradient = shape.fillType === 'gradient' && shape.gradient
    let fill: string
    if (isGradient) {
      const gradId = `grad-${si}`
      defs.push(svgGradientDef(gradId, shape.gradient!, shape.width, shape.height))
      fill = `url(#${gradId})`
    } else {
      fill = exportColor(shape.fill, effectiveMode)
    }

    switch (shape.type) {
      case 'rectangle': {
        const r = (shape as { cornerRadius?: number[] }).cornerRadius
        const rx = r ? r[0] : 0
        elements.push(`<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`)
        break
      }
      case 'ellipse':
        elements.push(`<ellipse cx="${x + shape.width / 2}" cy="${y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`)
        break
      case 'path': {
        const p = shape as PathShape
        const fr = p.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : ''
        elements.push(`<path d="${p.pathData || ''}"${fr} fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="translate(${x},${y})" />`)
        break
      }
      case 'text': {
        const ts = shape as TextShape
        const outlined = await textToOutlines(ts)
        if (outlined) {
          elements.push(`<path d="${outlined.pathData}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" transform="translate(${x},${y})" />`)
        } else {
          elements.push(`<text x="${x}" y="${y + ts.fontSize}" font-family="${ts.fontFamily}" font-size="${ts.fontSize}" font-weight="${ts.fontWeight}" fill="${fill}">${ts.text}</text>`)
        }
        break
      }
      case 'line': {
        const pts = (shape as { points?: number[] }).points || []
        elements.push(`<line x1="${x + (pts[0] || 0)}" y1="${y + (pts[1] || 0)}" x2="${x + (pts[2] || 0)}" y2="${y + (pts[3] || 0)}" stroke="${stroke}" stroke-width="${sw}" />`)
        break
      }
      default:
        elements.push(`<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`)
    }
  }

  if (openMaskParent !== false) elements.push('</g>')

  const defsBlock = defs.length > 0 ? `\n  <defs>\n    ${defs.join('\n    ')}\n  </defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scaleFactor}" height="${h * scaleFactor}" viewBox="0 0 ${w} ${h}">${defsBlock}\n  ${elements.join('\n  ')}\n</svg>`
}

/** Bare geometry element for a clipPath def (no paint attributes). */
function maskGeometrySvg(shape: Shape, x: number, y: number): string {
  switch (shape.type) {
    case 'ellipse':
      return `<ellipse cx="${x + shape.width / 2}" cy="${y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" />`
    case 'path': {
      const p = shape as PathShape
      const rule = p.fillRule === 'evenodd' ? ' clip-rule="evenodd"' : ''
      return `<path d="${p.pathData || ''}"${rule} transform="translate(${x},${y})" />`
    }
    case 'rectangle': {
      const r = (shape as { cornerRadius?: number[] }).cornerRadius
      return `<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" rx="${r ? r[0] : 0}" />`
    }
    default:
      return `<rect x="${x}" y="${y}" width="${shape.width}" height="${shape.height}" />`
  }
}

async function downloadSvg(shapes: Shape[], scale: ExportScale) {
  const svg = await shapesToSvgString(shapes, scaleMap[scale])
  const name = shapes.length === 1 ? (shapes[0].name || 'export') : 'export'
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, `${name}@${scale}.svg`)
  URL.revokeObjectURL(url)
}

async function downloadEps(shapes: Shape[], scale: ExportScale) {
  const { minX, minY, maxX, maxY } = getShapesBounds(shapes)
  const w = maxX - minX
  const h = maxY - minY
  const s = scaleMap[scale]
  const sw = w * s
  const sh = h * s

  const globalColorMode = useCanvasStore.getState().colorMode

  const psColor = (hex: string | undefined, shapeColorMode?: 'rgb' | 'cmyk'): string => {
    if (!hex || hex === 'none' || hex === '') return ''
    if ((shapeColorMode ?? globalColorMode) === 'cmyk') {
      const cmyk = hexToCmyk(hex)
      return `${(cmyk.c / 100).toFixed(3)} ${(cmyk.m / 100).toFixed(3)} ${(cmyk.y / 100).toFixed(3)} ${(cmyk.k / 100).toFixed(3)} setcmykcolor`
    }
    const [r, g, b] = hexToRgb(hex)
    return `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)} setrgbcolor`
  }

  // EPS uses bottom-left origin, so flip y
  const flipY = (y: number) => h - y

  const lines: string[] = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%BoundingBox: 0 0 ${Math.round(sw)} ${Math.round(sh)}`,
    `%%HiResBoundingBox: 0 0 ${sw} ${sh}`,
    '%%Pages: 1',
    '%%EndComments',
    `${s} ${s} scale`,
  ]

  for (const shape of shapes) {
    // Mask shapes don't paint (EPS clipping is a stretch goal; SVG has it)
    if (shape.isMask && shape.visible !== false) continue
    const x = shape.x - minX
    const y = shape.y - minY
    const shapeMode = shape.colorMode ?? globalColorMode
    const fill = psColor(shape.fill, shapeMode)
    const stroke = psColor(shape.stroke, shapeMode)
    const strokeW = shape.strokeWidth || 0

    switch (shape.type) {
      case 'rectangle': {
        const r = (shape as { cornerRadius?: number[] }).cornerRadius
        const rx = r ? r[0] : 0
        if (rx > 0) {
          // Rounded rect approximation
          lines.push('newpath')
          lines.push(`${x + rx} ${flipY(y)} moveto`)
          lines.push(`${x + shape.width - rx} ${flipY(y)} lineto`)
          lines.push(`${x + shape.width} ${flipY(y)} ${x + shape.width} ${flipY(y + shape.height)} ${rx} arcto 4 {pop} repeat`)
          lines.push(`${x + shape.width} ${flipY(y + shape.height)} ${x} ${flipY(y + shape.height)} ${rx} arcto 4 {pop} repeat`)
          lines.push(`${x} ${flipY(y + shape.height)} ${x} ${flipY(y)} ${rx} arcto 4 {pop} repeat`)
          lines.push(`${x} ${flipY(y)} ${x + shape.width} ${flipY(y)} ${rx} arcto 4 {pop} repeat`)
          lines.push('closepath')
        } else {
          lines.push('newpath')
          lines.push(`${x} ${flipY(y + shape.height)} moveto`)
          lines.push(`${x + shape.width} ${flipY(y + shape.height)} lineto`)
          lines.push(`${x + shape.width} ${flipY(y)} lineto`)
          lines.push(`${x} ${flipY(y)} lineto`)
          lines.push('closepath')
        }
        if (fill) { lines.push('gsave', fill, 'fill', 'grestore') }
        if (stroke && strokeW > 0) { lines.push(`${strokeW} setlinewidth`, stroke, 'stroke') }
        break
      }
      case 'ellipse': {
        const cx = x + shape.width / 2
        const cy = flipY(y + shape.height / 2)
        const rx = shape.width / 2
        const ry = shape.height / 2
        lines.push('gsave')
        lines.push(`${cx} ${cy} translate`)
        lines.push(`${rx} ${ry} scale`)
        lines.push('newpath 0 0 1 0 360 arc closepath')
        lines.push('grestore') // restore scale for fill/stroke
        // Re-draw path at correct transform for fill/stroke
        lines.push('gsave')
        lines.push(`${cx} ${cy} translate ${rx} ${ry} scale`)
        lines.push('newpath 0 0 1 0 360 arc closepath')
        if (fill) { lines.push(fill, 'fill') }
        lines.push('grestore')
        if (stroke && strokeW > 0) {
          lines.push('gsave')
          lines.push(`${cx} ${cy} translate ${rx} ${ry} scale`)
          lines.push('newpath 0 0 1 0 360 arc closepath')
          lines.push('grestore')
          lines.push(`${strokeW} setlinewidth`, stroke, 'stroke')
        }
        break
      }
      case 'text': {
        const ts = shape as TextShape
        const outlined = await textToOutlines(ts)
        if (outlined) {
          // Convert SVG path to PostScript path
          const psPath = svgPathToPs(outlined.pathData, x, y, h)
          if (psPath) {
            lines.push('newpath', psPath, 'closepath')
            if (fill) { lines.push('gsave', fill, 'fill', 'grestore') }
            if (stroke && strokeW > 0) { lines.push(`${strokeW} setlinewidth`, stroke, 'stroke') }
          }
        }
        break
      }
      case 'line': {
        const pts = (shape as { points?: number[] }).points || []
        lines.push('newpath')
        lines.push(`${x + (pts[0] || 0)} ${flipY(y + (pts[1] || 0))} moveto`)
        lines.push(`${x + (pts[2] || 0)} ${flipY(y + (pts[3] || 0))} lineto`)
        if (stroke && strokeW > 0) { lines.push(`${strokeW} setlinewidth`, stroke, 'stroke') }
        break
      }
      case 'path': {
        const p = shape as PathShape
        const psPath = svgPathToPs(p.pathData || '', x, y, h)
        if (psPath) {
          const fillOp = p.fillRule === 'evenodd' ? 'eofill' : 'fill'
          lines.push('newpath', psPath, 'closepath')
          if (fill) { lines.push('gsave', fill, fillOp, 'grestore') }
          if (stroke && strokeW > 0) { lines.push(`${strokeW} setlinewidth`, stroke, 'stroke') }
        }
        break
      }
      default: {
        lines.push('newpath')
        lines.push(`${x} ${flipY(y + shape.height)} moveto`)
        lines.push(`${x + shape.width} ${flipY(y + shape.height)} lineto`)
        lines.push(`${x + shape.width} ${flipY(y)} lineto`)
        lines.push(`${x} ${flipY(y)} lineto`)
        lines.push('closepath')
        if (fill) { lines.push('gsave', fill, 'fill', 'grestore') }
        if (stroke && strokeW > 0) { lines.push(`${strokeW} setlinewidth`, stroke, 'stroke') }
        break
      }
    }
  }

  lines.push('showpage', '%%EOF')

  const name = shapes.length === 1 ? (shapes[0].name || 'export') : 'export'
  const blob = new Blob([lines.join('\n')], { type: 'application/postscript' })
  const url = URL.createObjectURL(blob)
  downloadDataUrl(url, `${name}@${scale}.eps`)
  URL.revokeObjectURL(url)
}

/** Convert a basic SVG path data string to PostScript path commands */
function svgPathToPs(d: string, offsetX: number, offsetY: number, totalHeight: number): string {
  const flipY = (y: number) => totalHeight - y
  const commands: string[] = []
  const tokens = d.match(/[MmLlCcZzHhVvSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return ''

  let cx = 0, cy = 0
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]
    if (cmd === 'M') {
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${cx} ${flipY(cy)} moveto`)
    } else if (cmd === 'm') {
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${cx + offsetX} ${flipY(cy + offsetY)} moveto`)
    } else if (cmd === 'L') {
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${cx} ${flipY(cy)} lineto`)
    } else if (cmd === 'l') {
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${cx + offsetX} ${flipY(cy + offsetY)} lineto`)
    } else if (cmd === 'C') {
      const x1 = parseFloat(tokens[++i]) + offsetX
      const y1 = parseFloat(tokens[++i]) + offsetY
      const x2 = parseFloat(tokens[++i]) + offsetX
      const y2 = parseFloat(tokens[++i]) + offsetY
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${x1} ${flipY(y1)} ${x2} ${flipY(y2)} ${cx} ${flipY(cy)} curveto`)
    } else if (cmd === 'c') {
      const x1 = cx + parseFloat(tokens[++i])
      const y1 = cy + parseFloat(tokens[++i])
      const x2 = cx + parseFloat(tokens[++i])
      const y2 = cy + parseFloat(tokens[++i])
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${x1 + offsetX} ${flipY(y1 + offsetY)} ${x2 + offsetX} ${flipY(y2 + offsetY)} ${cx + offsetX} ${flipY(cy + offsetY)} curveto`)
    } else if (cmd === 'Z' || cmd === 'z') {
      commands.push('closepath')
    } else if (cmd === 'H') {
      cx = parseFloat(tokens[++i]) + offsetX
      commands.push(`${cx} ${flipY(cy)} lineto`)
    } else if (cmd === 'h') {
      cx += parseFloat(tokens[++i])
      commands.push(`${cx + offsetX} ${flipY(cy + offsetY)} lineto`)
    } else if (cmd === 'V') {
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${cx} ${flipY(cy)} lineto`)
    } else if (cmd === 'v') {
      cy += parseFloat(tokens[++i])
      commands.push(`${cx + offsetX} ${flipY(cy + offsetY)} lineto`)
    } else {
      i++
      continue
    }
    i++
  }
  return commands.join('\n')
}

function downloadDataUrl(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
