import opentype from 'opentype.js'
import type { TextShape } from '../types/document'
import { isTauri } from '../utils/isTauri'
import type * as Y from 'yjs'
import { addShape, deleteShapes, getAllShapes, reorderShape } from '../document/operations'

const fontCache = new Map<string, opentype.Font>()
const pendingFonts = new Map<string, Promise<opentype.Font | null>>()

interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob: () => Promise<Blob>
}

let cachedLocalFontList: LocalFontData[] | null = null

/** Try loading a local font via the Local Font Access API (Chrome/Edge) */
async function getLocalFont(family: string, weight: number, style: TextShape['fontStyle']): Promise<opentype.Font | null> {
  if (!('queryLocalFonts' in window)) return null

  try {
    if (!cachedLocalFontList) {
      cachedLocalFontList = await (window as unknown as { queryLocalFonts: () => Promise<LocalFontData[]> }).queryLocalFonts()
    }
    const fonts = cachedLocalFontList
    // Find matching family, prefer exact weight match
    const familyFonts = fonts.filter((f) => f.family === family)
    if (familyFonts.length === 0) return null

    // Try to find the right style and weight variant.
    const styledFonts = familyFonts.filter((f) =>
      style === 'italic'
        ? f.style.toLowerCase().includes('italic')
        : !f.style.toLowerCase().includes('italic')
    )
    const candidates = styledFonts.length > 0 ? styledFonts : familyFonts
    const weightName = weight <= 400 ? 'Regular' : weight >= 700 ? 'Bold' : 'Medium'
    const match = candidates.find((f) => f.style.includes(weightName)) || candidates[0]

    const blob = await match.blob()
    const buffer = await blob.arrayBuffer()
    const font = opentype.parse(buffer)
    return font
  } catch {
    return null
  }
}

/** Try loading a local font file via Tauri */
async function getTauriFont(family: string): Promise<opentype.Font | null> {
  if (!isTauri()) return null

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const fontBytes = await invoke<number[]>('read_font_file', { family })
    if (!fontBytes || fontBytes.length === 0) return null

    const buffer = new Uint8Array(fontBytes).buffer
    const font = opentype.parse(buffer)
    return font
  } catch {
    return null
  }
}

/**
 * Load font from Google Fonts API.
 *
 * Google Fonts serves modern browsers WOFF2. Decode that payload to sfnt before
 * handing it to opentype.js. The `text` query produces one small subset that
 * contains exactly the glyphs this outline operation needs.
 */
async function getGoogleFont(
  family: string,
  weight: number,
  style: TextShape['fontStyle'],
  text: string,
): Promise<opentype.Font | null> {
  try {
    const encoded = encodeURIComponent(family)
    const variant = style === 'italic' ? `:ital,wght@1,${weight}` : `:wght@${weight}`
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}${variant}&text=${encodeURIComponent(text)}&display=swap`
    const cssRes = await fetch(cssUrl)
    if (!cssRes.ok) throw new Error(`Google Fonts CSS request failed (${cssRes.status})`)
    const css = await cssRes.text()

    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/['"]/g, ''))
    const sourceUrl = urls.at(-1)
    if (!sourceUrl) throw new Error(`Google Fonts returned no source for "${family}"`)

    const fontRes = await fetch(sourceUrl)
    if (!fontRes.ok) throw new Error(`Google Fonts file request failed (${fontRes.status})`)
    const buffer = await fontRes.arrayBuffer()
    const signature = new DataView(buffer).getUint32(0, false)
    if (signature === 0x774f4632) { // wOF2
      const { woff2Decode } = await import('woff-lib/woff2/decode')
      const decoded = await woff2Decode(buffer)
      return opentype.parse(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength))
    }
    return opentype.parse(buffer)
  } catch (error) {
    console.warn(`Failed to load Google Font "${family}" for outlines`, error)
    return null
  }
}

function glyphSignature(text: string): string {
  return [...new Set(Array.from(text))].sort().join('')
}

async function getFont(
  family: string,
  weight: number,
  style: TextShape['fontStyle'],
  text: string,
): Promise<opentype.Font | null> {
  const key = `${family}:${weight}:${style}:${glyphSignature(text)}`
  if (fontCache.has(key)) return fontCache.get(key)!
  if (pendingFonts.has(key)) return pendingFonts.get(key)!

  const request = (async () => {
    // Try local font sources first, then Google Fonts.
    const font =
      await getTauriFont(family) ||
      await getLocalFont(family, weight, style) ||
      await getGoogleFont(family, weight, style, text)

    if (font) fontCache.set(key, font)
    else console.warn('Failed to load font for outlines:', family, weight, style)
    return font
  })()

  pendingFonts.set(key, request)
  try {
    return await request
  } finally {
    pendingFonts.delete(key)
  }
}

export async function textToOutlines(shape: TextShape): Promise<{ pathData: string; width: number; height: number } | null> {
  const text = applyTransform(shape.text, shape.textTransform)
  if (!text.trim()) return null

  const font = await getFont(shape.fontFamily, shape.fontWeight, shape.fontStyle, text)
  if (!font) return null

  const fontSize = shape.fontSize
  const scale = fontSize / font.unitsPerEm
  const ascender = font.ascender * scale

  const path = font.getPath(text, 0, ascender, fontSize)

  if (path.commands.length === 0) return null

  const bbox = path.getBoundingBox()
  const offsetX = bbox.x1
  const offsetY = bbox.y1

  const commands = path.commands.map((cmd) => {
    switch (cmd.type) {
      case 'M': return `M ${(cmd.x! - offsetX).toFixed(2)} ${(cmd.y! - offsetY).toFixed(2)}`
      case 'L': return `L ${(cmd.x! - offsetX).toFixed(2)} ${(cmd.y! - offsetY).toFixed(2)}`
      case 'C': return `C ${(cmd.x1! - offsetX).toFixed(2)} ${(cmd.y1! - offsetY).toFixed(2)} ${(cmd.x2! - offsetX).toFixed(2)} ${(cmd.y2! - offsetY).toFixed(2)} ${(cmd.x! - offsetX).toFixed(2)} ${(cmd.y! - offsetY).toFixed(2)}`
      case 'Q': return `Q ${(cmd.x1! - offsetX).toFixed(2)} ${(cmd.y1! - offsetY).toFixed(2)} ${(cmd.x! - offsetX).toFixed(2)} ${(cmd.y! - offsetY).toFixed(2)}`
      case 'Z': return 'Z'
      default: return ''
    }
  }).join(' ')

  return {
    pathData: commands,
    width: bbox.x2 - bbox.x1,
    height: bbox.y2 - bbox.y1,
  }
}

export async function outlineSelectedText(
  doc: Y.Doc,
  pageId: string,
  selectedIds: Set<string>,
): Promise<string[]> {
  const selected = getAllShapes(doc, pageId).filter(
    (shape): shape is TextShape => selectedIds.has(shape.id) && shape.type === 'text',
  )
  const conversions = (
    await Promise.all(selected.map(async (source) => ({ source, result: await textToOutlines(source) })))
  ).filter((conversion) => conversion.result !== null)
  if (conversions.length === 0) return []

  const sourceIds = new Set(conversions.map(({ source }) => source.id))
  const outlineIds: string[] = []
  doc.transact(() => {
    for (const { source, result } of conversions) {
      if (!result) continue
      const outline = addShape(doc, pageId, 'path', {
        x: source.x,
        y: source.y,
        ...result,
        rotation: source.rotation,
        opacity: source.opacity,
        visible: source.visible,
        locked: source.locked,
        lockProportions: source.lockProportions,
        colorMode: source.colorMode,
        closed: true,
        fill: source.fill,
        stroke: source.stroke,
        strokeWidth: source.strokeWidth,
        parentId: source.parentId ?? null,
      })
      const live = getAllShapes(doc, pageId)
      const sourceIndex = live.findIndex((shape) => shape.id === source.id)
      if (sourceIndex >= 0) reorderShape(doc, pageId, outline.id, sourceIndex)
      outlineIds.push(outline.id)
    }
    deleteShapes(doc, pageId, sourceIds)
  }, 'local')
  return outlineIds
}

function applyTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase': return text.toUpperCase()
    case 'lowercase': return text.toLowerCase()
    case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase())
    default: return text
  }
}
