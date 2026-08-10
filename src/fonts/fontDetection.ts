import type { FontEntry } from './fontList'
import { macFontCandidates } from './macFontCandidates'
import { isTauri } from '../utils/isTauri'

/**
 * Detect system fonts via Tauri native command.
 * Returns empty array if not running in Tauri.
 */
export async function detectFontsTauri(): Promise<FontEntry[]> {
  if (!isTauri()) return []

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const fonts = await invoke<{ family: string; weights: number[]; has_italic: boolean }[]>('list_system_fonts')

    return fonts.map((f) => ({
      family: f.family,
      category: 'sans-serif' as const, // Can't reliably determine category from system fonts
      weights: f.weights,
      hasItalic: f.has_italic,
      source: 'local' as const,
    }))
  } catch {
    return []
  }
}

/**
 * Canvas-based font detection fallback.
 * Tests each candidate font against baseline measurements to determine if it's installed.
 */
export function detectFontsCanvas(): FontEntry[] {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return []

  const testString = 'mmmmmmmmmmlli'
  const fontSize = '72px'
  const baselines = ['monospace', 'sans-serif', 'serif'] as const

  // Measure baseline widths
  const baselineWidths = baselines.map((font) => {
    ctx.font = `${fontSize} ${font}`
    return ctx.measureText(testString).width
  })

  const detected: FontEntry[] = []

  for (const candidate of macFontCandidates) {
    let isInstalled = false

    for (let i = 0; i < baselines.length; i++) {
      ctx.font = `${fontSize} '${candidate.family}', ${baselines[i]}`
      const width = ctx.measureText(testString).width
      if (width !== baselineWidths[i]) {
        isInstalled = true
        break
      }
    }

    if (isInstalled) {
      detected.push(candidate)
    }
  }

  return detected
}
