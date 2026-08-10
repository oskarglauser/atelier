import opentype from 'opentype.js'
import type { TextShape } from '../types/document'
import { isTauri } from '../utils/isTauri'

const fontCache = new Map<string, opentype.Font>()

interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
  blob: () => Promise<Blob>
}

let cachedLocalFontList: LocalFontData[] | null = null

/** Try loading a local font via the Local Font Access API (Chrome/Edge) */
async function getLocalFont(family: string, weight: number): Promise<opentype.Font | null> {
  if (!('queryLocalFonts' in window)) return null

  try {
    if (!cachedLocalFontList) {
      cachedLocalFontList = await (window as unknown as { queryLocalFonts: () => Promise<LocalFontData[]> }).queryLocalFonts()
    }
    const fonts = cachedLocalFontList
    // Find matching family, prefer exact weight match
    const familyFonts = fonts.filter((f) => f.family === family)
    if (familyFonts.length === 0) return null

    // Try to find the right weight variant (Regular for 400, Bold for 700, etc.)
    const weightName = weight <= 400 ? 'Regular' : weight >= 700 ? 'Bold' : 'Medium'
    const match = familyFonts.find((f) => f.style.includes(weightName)) || familyFonts[0]

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
 * Note: opentype.js parses ttf/otf/woff but not woff2, and the css2 API decides
 * the format from the browser's User-Agent (which fetch() cannot override), so
 * modern browsers are usually offered woff2 only. When no parseable source is
 * available we fail gracefully. TODO: add a WOFF2 decoder (or fetch static TTFs,
 * e.g. from Fontsource) for full Google Fonts outline support.
 */
async function getGoogleFont(family: string, weight: number): Promise<opentype.Font | null> {
  try {
    const encoded = encodeURIComponent(family)
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weight}&display=swap`
    const cssRes = await fetch(cssUrl)
    const css = await cssRes.text()

    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/['"]/g, ''))
    const parseable = urls.find((u) => /\.(ttf|otf|woff)(\?|$)/i.test(u))
    if (!parseable) {
      console.warn(`No opentype.js-parseable source (ttf/otf/woff) offered for "${family}" — cannot build outlines`)
      return null
    }

    const fontRes = await fetch(parseable)
    const buffer = await fontRes.arrayBuffer()
    return opentype.parse(buffer)
  } catch {
    return null
  }
}

async function getFont(family: string, weight: number): Promise<opentype.Font | null> {
  const key = `${family}:${weight}`
  if (fontCache.has(key)) return fontCache.get(key)!

  // Try local font sources first, then Google Fonts
  const font =
    await getTauriFont(family) ||
    await getLocalFont(family, weight) ||
    await getGoogleFont(family, weight)

  if (font) {
    fontCache.set(key, font)
  } else {
    console.warn('Failed to load font for outlines:', family, weight)
  }
  return font
}

export async function textToOutlines(shape: TextShape): Promise<{ pathData: string; width: number; height: number } | null> {
  const font = await getFont(shape.fontFamily, shape.fontWeight)
  if (!font) return null

  const text = applyTransform(shape.text, shape.textTransform)
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

function applyTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase': return text.toUpperCase()
    case 'lowercase': return text.toLowerCase()
    case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase())
    default: return text
  }
}
