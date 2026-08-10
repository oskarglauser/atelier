const loadedFonts = new Set<string>()

export function loadGoogleFont(family: string, weights: number[] = [400, 700]) {
  if (loadedFonts.has(family)) return

  const weightStr = weights.join(';')
  const encoded = encodeURIComponent(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@${weightStr}&display=swap`
  document.head.appendChild(link)
  loadedFonts.add(family)
}

export function isFontLoaded(family: string): boolean {
  return loadedFonts.has(family)
}

interface FontData {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

const WEIGHT_KEYWORDS: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200,
  light: 300, regular: 400, normal: 400, medium: 500,
  semibold: 600, demibold: 600, bold: 700, extrabold: 800,
  ultrabold: 800, black: 900, heavy: 900,
}

function inferWeight(style: string): number {
  const lower = style.toLowerCase().replace(/[- ]/g, '')
  for (const [keyword, weight] of Object.entries(WEIGHT_KEYWORDS)) {
    if (lower.includes(keyword)) return weight
  }
  return 400
}

export async function detectSystemFonts(): Promise<import('../fonts/fontList').FontEntry[]> {
  // Tier 1: Tauri native enumeration (desktop app)
  const { detectFontsTauri, detectFontsCanvas } = await import('./fontDetection')
  const tauriFonts = await detectFontsTauri()
  if (tauriFonts.length > 0) return tauriFonts

  // Tier 2: queryLocalFonts (Chrome/Edge)
  if ('queryLocalFonts' in window) {
    try {
      const fonts = await (window as unknown as { queryLocalFonts: () => Promise<FontData[]> }).queryLocalFonts()
      const familyMap = new Map<string, { weights: Set<number>; hasItalic: boolean }>()

      for (const f of fonts) {
        let entry = familyMap.get(f.family)
        if (!entry) {
          entry = { weights: new Set(), hasItalic: false }
          familyMap.set(f.family, entry)
        }
        entry.weights.add(inferWeight(f.style))
        if (f.style.toLowerCase().includes('italic')) entry.hasItalic = true
      }

      const results = [...familyMap.entries()]
        .map(([family, data]) => ({
          family,
          category: 'sans-serif' as const,
          weights: [...data.weights].sort((a, b) => a - b),
          hasItalic: data.hasItalic,
          source: 'local' as const,
        }))
        .sort((a, b) => a.family.localeCompare(b.family))

      if (results.length > 0) return results
    } catch {
      // Fall through to canvas detection
    }
  }

  // Tier 3: Canvas detection (Safari/Firefox)
  return detectFontsCanvas()
}
