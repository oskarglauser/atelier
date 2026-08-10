import { jsPDF, ShadingPattern } from 'jspdf'
import type { Shape, TextShape, GradientFill } from '../types/document'
import { getShapesBounds } from './math'
import { hexToRgb, hexToCmyk } from './colorConvert'
import { useCanvasStore } from '../store/canvasStore'
import { textToOutlines } from '../operations/textToOutlines'
import { scaleMap, type ExportScale } from './exportShape'
import { getGradientProps } from '../canvas/utils/gradientProps'
import { drawGradientNoiseFill } from '../canvas/utils/gradientFill'

// Convert px (at 72 DPI) to mm for jsPDF
const PX_TO_MM = 25.4 / 72

// jsPDF internal.write exists at runtime but isn't in type defs
function pdfWrite(doc: jsPDF, content: string) {
  (doc as unknown as { internal: { write: (s: string) => void } }).internal.write(content)
}

function pxToMm(v: number, sc: number) {
  return v * sc * PX_TO_MM
}

function setCmykColor(doc: jsPDF, hex: string, operator: 'k' | 'K') {
  const cmyk = hexToCmyk(hex)
  const cv = (cmyk.c / 100).toFixed(3)
  const mv = (cmyk.m / 100).toFixed(3)
  const yv = (cmyk.y / 100).toFixed(3)
  const kv = (cmyk.k / 100).toFixed(3)
  pdfWrite(doc, `${cv} ${mv} ${yv} ${kv} ${operator}`)
}

function setPdfColor(doc: jsPDF, hex: string | undefined, colorMode: 'rgb' | 'cmyk', kind: 'fill' | 'stroke'): boolean {
  if (!hex || hex === 'none' || hex === '') return false
  if (colorMode === 'cmyk') {
    setCmykColor(doc, hex, kind === 'fill' ? 'k' : 'K')
  } else {
    const [r, g, b] = hexToRgb(hex)
    if (kind === 'fill') doc.setFillColor(r, g, b)
    else doc.setDrawColor(r, g, b)
  }
  return true
}

/** Returns the PDF draw style for jsPDF rect/roundedRect, or null if nothing to draw */
function drawStyle(hasFill: boolean, hasStroke: boolean, sw: number): 'FD' | 'F' | 'S' | null {
  if (hasFill && hasStroke && sw > 0) return 'FD'
  if (hasFill) return 'F'
  if (hasStroke && sw > 0) return 'S'
  return null
}

/** Writes the raw PDF fill/stroke operator for path-based shapes */
function writeFillStroke(doc: jsPDF, hasFill: boolean, hasStroke: boolean, sw: number) {
  if (hasFill && hasStroke && sw > 0) pdfWrite(doc, 'B')
  else if (hasFill) pdfWrite(doc, 'f')
  else if (hasStroke && sw > 0) pdfWrite(doc, 'S')
}

function svgPathToPdf(d: string, offsetX: number, offsetY: number, scale: number): string {
  const commands: string[] = []
  const tokens = d.match(/[MmLlCcZzHhVvSsQqTtAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
  if (!tokens) return ''

  const s = (v: number) => pxToMm(v, scale).toFixed(3)

  let cx = 0, cy = 0
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i]
    if (cmd === 'M') {
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${s(cx)} ${s(cy)} m`)
    } else if (cmd === 'm') {
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${s(cx + offsetX)} ${s(cy + offsetY)} m`)
    } else if (cmd === 'L') {
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${s(cx)} ${s(cy)} l`)
    } else if (cmd === 'l') {
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${s(cx + offsetX)} ${s(cy + offsetY)} l`)
    } else if (cmd === 'C') {
      const x1 = parseFloat(tokens[++i]) + offsetX
      const y1 = parseFloat(tokens[++i]) + offsetY
      const x2 = parseFloat(tokens[++i]) + offsetX
      const y2 = parseFloat(tokens[++i]) + offsetY
      cx = parseFloat(tokens[++i]) + offsetX
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${s(x1)} ${s(y1)} ${s(x2)} ${s(y2)} ${s(cx)} ${s(cy)} c`)
    } else if (cmd === 'c') {
      const x1 = cx + parseFloat(tokens[++i])
      const y1 = cy + parseFloat(tokens[++i])
      const x2 = cx + parseFloat(tokens[++i])
      const y2 = cy + parseFloat(tokens[++i])
      cx += parseFloat(tokens[++i])
      cy += parseFloat(tokens[++i])
      commands.push(`${s(x1 + offsetX)} ${s(y1 + offsetY)} ${s(x2 + offsetX)} ${s(y2 + offsetY)} ${s(cx + offsetX)} ${s(cy + offsetY)} c`)
    } else if (cmd === 'H') {
      cx = parseFloat(tokens[++i]) + offsetX
      commands.push(`${s(cx)} ${s(cy)} l`)
    } else if (cmd === 'h') {
      cx += parseFloat(tokens[++i])
      commands.push(`${s(cx + offsetX)} ${s(cy + offsetY)} l`)
    } else if (cmd === 'V') {
      cy = parseFloat(tokens[++i]) + offsetY
      commands.push(`${s(cx)} ${s(cy)} l`)
    } else if (cmd === 'v') {
      cy += parseFloat(tokens[++i])
      commands.push(`${s(cx + offsetX)} ${s(cy + offsetY)} l`)
    } else if (cmd === 'Z' || cmd === 'z') {
      commands.push('h')
    } else {
      i++
      continue
    }
    i++
  }
  return commands.join('\n')
}

function drawEllipse(doc: jsPDF, cx: number, cy: number, rx: number, ry: number, scale: number) {
  const kappa = 0.5522847498
  const m = (v: number) => pxToMm(v, scale).toFixed(3)

  const ox = rx * kappa
  const oy = ry * kappa
  pdfWrite(doc,
    `${m(cx - rx)} ${m(cy)} m\n` +
    `${m(cx - rx)} ${m(cy - oy)} ${m(cx - ox)} ${m(cy - ry)} ${m(cx)} ${m(cy - ry)} c\n` +
    `${m(cx + ox)} ${m(cy - ry)} ${m(cx + rx)} ${m(cy - oy)} ${m(cx + rx)} ${m(cy)} c\n` +
    `${m(cx + rx)} ${m(cy + oy)} ${m(cx + ox)} ${m(cy + ry)} ${m(cx)} ${m(cy + ry)} c\n` +
    `${m(cx - ox)} ${m(cy + ry)} ${m(cx - rx)} ${m(cy + oy)} ${m(cx - rx)} ${m(cy)} c\n` +
    'h'
  )
}

/** Render a gradient-filled shape (with noise) to an offscreen canvas */
function renderGradientToCanvas(
  shape: Shape,
  sc: number,
  drawPath: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): HTMLCanvasElement {
  const w = shape.width
  const h = shape.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * sc)
  canvas.height = Math.ceil(h * sc)
  const ctx = canvas.getContext('2d')!
  ctx.scale(sc, sc)
  drawGradientNoiseFill(ctx, w, h, shape.gradient!, (c) => drawPath(c, w, h),
    shape.stroke && shape.strokeWidth ? { color: shape.stroke, width: shape.strokeWidth } : undefined)
  return canvas
}

let gradientCounter = 0

/**
 * Draw a vector linear gradient in the PDF using jsPDF's ShadingPattern API.
 * Uses the advanced API to register a shading pattern, draw a clip path, and fill.
 */
function drawPdfVectorGradient(
  doc: jsPDF,
  gradient: GradientFill,
  shapeX: number,
  shapeY: number,
  shapeW: number,
  shapeH: number,
  sc: number,
  drawPath: (adv: jsPDF) => void,
) {
  const gp = getGradientProps(gradient, shapeW, shapeH)
  const x0 = pxToMm(shapeX + gp.fillLinearGradientStartPointX, sc)
  const y0 = pxToMm(shapeY + gp.fillLinearGradientStartPointY, sc)
  const x1 = pxToMm(shapeX + gp.fillLinearGradientEndPointX, sc)
  const y1 = pxToMm(shapeY + gp.fillLinearGradientEndPointY, sc)

  const colors = gradient.stops.map((s) => {
    const [r, g, b] = hexToRgb(s.color)
    return { offset: s.offset, color: [r, g, b] }
  })

  const key = `grad_${gradientCounter++}`
  const pattern = new ShadingPattern('axial', [x0, y0, x1, y1], colors)

  doc.advancedAPI((adv) => {
    adv.addShadingPattern(key, pattern)
    drawPath(adv)
    adv.fill({ key })
  })
}

export async function downloadPdf(shapes: Shape[], scale: ExportScale) {
  gradientCounter = 0
  const { minX, minY, maxX, maxY } = getShapesBounds(shapes)
  const w = maxX - minX
  const h = maxY - minY
  const sc = scaleMap[scale]
  const pageW = pxToMm(w, sc)
  const pageH = pxToMm(h, sc)

  const globalColorMode = useCanvasStore.getState().colorMode

  const doc = new jsPDF({
    orientation: pageW > pageH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pageW, pageH],
  })

  const s = (v: number) => pxToMm(v, sc).toFixed(3)

  for (const shape of shapes) {
    const x = shape.x - minX
    const y = shape.y - minY
    const colorMode = shape.colorMode ?? globalColorMode
    const hasFill = setPdfColor(doc, shape.fill, colorMode, 'fill')
    const hasStroke = setPdfColor(doc, shape.stroke, colorMode, 'stroke')
    const sw = shape.strokeWidth || 0

    if (hasStroke && sw > 0) {
      doc.setLineWidth(pxToMm(sw, sc))
    }

    switch (shape.type) {
      case 'rectangle': {
        const r = (shape as { cornerRadius?: number[] }).cornerRadius
        const rx = r ? r[0] : 0
        if (shape.fillType === 'gradient' && shape.gradient) {
          if (shape.gradient.noise > 0) {
            // Noise requires rasterization
            const gradCanvas = renderGradientToCanvas(shape, sc, (ctx, w, h) => {
              ctx.beginPath()
              if (rx > 0) {
                ctx.roundRect(0, 0, w, h, rx)
              } else {
                ctx.rect(0, 0, w, h)
              }
            })
            doc.addImage(gradCanvas, 'PNG', pxToMm(x, sc), pxToMm(y, sc), pxToMm(shape.width, sc), pxToMm(shape.height, sc))
          } else {
            // Vector gradient
            const xM = pxToMm(x, sc), yM = pxToMm(y, sc)
            const wM = pxToMm(shape.width, sc), hM = pxToMm(shape.height, sc)
            drawPdfVectorGradient(doc, shape.gradient, x, y, shape.width, shape.height, sc, (adv) => {
              if (rx > 0) {
                adv.roundedRect(xM, yM, wM, hM, pxToMm(rx, sc), pxToMm(rx, sc))
              } else {
                adv.rect(xM, yM, wM, hM)
              }
            })
          }
          // Draw stroke separately if needed
          if (hasStroke && sw > 0) {
            const xM = pxToMm(x, sc), yM = pxToMm(y, sc)
            const wM = pxToMm(shape.width, sc), hM = pxToMm(shape.height, sc)
            if (rx > 0) {
              doc.roundedRect(xM, yM, wM, hM, pxToMm(rx, sc), pxToMm(rx, sc), 'S')
            } else {
              doc.rect(xM, yM, wM, hM, 'S')
            }
          }
        } else {
          const style = drawStyle(hasFill, hasStroke, sw)
          if (style) {
            const xM = pxToMm(x, sc), yM = pxToMm(y, sc)
            const wM = pxToMm(shape.width, sc), hM = pxToMm(shape.height, sc)
            if (rx > 0) {
              doc.roundedRect(xM, yM, wM, hM, pxToMm(rx, sc), pxToMm(rx, sc), style)
            } else {
              doc.rect(xM, yM, wM, hM, style)
            }
          }
        }
        break
      }
      case 'ellipse': {
        if (shape.fillType === 'gradient' && shape.gradient) {
          if (shape.gradient.noise > 0) {
            const gradCanvas = renderGradientToCanvas(shape, sc, (ctx, w, h) => {
              ctx.beginPath()
              ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
            })
            doc.addImage(gradCanvas, 'PNG', pxToMm(x, sc), pxToMm(y, sc), pxToMm(shape.width, sc), pxToMm(shape.height, sc))
          } else {
            drawPdfVectorGradient(doc, shape.gradient, x, y, shape.width, shape.height, sc, () => {
              drawEllipse(doc, x + shape.width / 2, y + shape.height / 2, shape.width / 2, shape.height / 2, sc)
            })
          }
          if (hasStroke && sw > 0) {
            drawEllipse(doc, x + shape.width / 2, y + shape.height / 2, shape.width / 2, shape.height / 2, sc)
            pdfWrite(doc, 'S')
          }
        } else {
          drawEllipse(doc, x + shape.width / 2, y + shape.height / 2, shape.width / 2, shape.height / 2, sc)
          writeFillStroke(doc, hasFill, hasStroke, sw)
        }
        break
      }
      case 'text': {
        const ts = shape as TextShape
        const outlined = await textToOutlines(ts)
        if (outlined) {
          const pdfPath = svgPathToPdf(outlined.pathData, x, y, sc)
          if (pdfPath) {
            pdfWrite(doc, pdfPath)
            writeFillStroke(doc, hasFill, hasStroke, sw)
          }
        }
        break
      }
      case 'line': {
        const pts = (shape as { points?: number[] }).points || []
        if (pts.length >= 4 && hasStroke && sw > 0) {
          pdfWrite(doc,
            `${s(x + (pts[0] || 0))} ${s(y + (pts[1] || 0))} m\n` +
            `${s(x + (pts[2] || 0))} ${s(y + (pts[3] || 0))} l\nS`
          )
        }
        break
      }
      case 'path': {
        const pd = (shape as { pathData?: string }).pathData || ''
        const pdfPath = svgPathToPdf(pd, x, y, sc)
        if (pdfPath) {
          pdfWrite(doc, pdfPath)
          writeFillStroke(doc, hasFill, hasStroke, sw)
        }
        break
      }
      case 'frame': {
        if (shape.fillType === 'gradient' && shape.gradient) {
          const xM = pxToMm(x, sc), yM = pxToMm(y, sc)
          const wM = pxToMm(shape.width, sc), hM = pxToMm(shape.height, sc)
          if (shape.gradient.noise > 0) {
            const gradCanvas = renderGradientToCanvas(shape, sc, (ctx, w, h) => {
              ctx.beginPath()
              ctx.rect(0, 0, w, h)
            })
            doc.addImage(gradCanvas, 'PNG', xM, yM, wM, hM)
          } else {
            drawPdfVectorGradient(doc, shape.gradient, x, y, shape.width, shape.height, sc, (adv) => {
              adv.rect(xM, yM, wM, hM)
            })
          }
        } else {
          const bgHex = (shape as { backgroundColor?: string }).backgroundColor || '#ffffff'
          setPdfColor(doc, bgHex, colorMode, 'fill')
          doc.rect(pxToMm(x, sc), pxToMm(y, sc), pxToMm(shape.width, sc), pxToMm(shape.height, sc), 'F')
        }
        break
      }
      default: {
        const style = drawStyle(hasFill, hasStroke, sw)
        if (style) {
          doc.rect(pxToMm(x, sc), pxToMm(y, sc), pxToMm(shape.width, sc), pxToMm(shape.height, sc), style)
        }
        break
      }
    }
  }

  const name = shapes.length === 1 ? (shapes[0].name || 'export') : 'export'
  doc.save(`${name}@${scale}.pdf`)
}
