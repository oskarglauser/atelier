export interface CMYK {
  c: number
  m: number
  y: number
  k: number
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  const r1 = r / 255
  const g1 = g / 255
  const b1 = b / 255
  const k = 1 - Math.max(r1, g1, b1)
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 }
  return {
    c: Math.round(((1 - r1 - k) / (1 - k)) * 100),
    m: Math.round(((1 - g1 - k) / (1 - k)) * 100),
    y: Math.round(((1 - b1 - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  }
}

export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const c1 = c / 100
  const m1 = m / 100
  const y1 = y / 100
  const k1 = k / 100
  return [
    Math.round(255 * (1 - c1) * (1 - k1)),
    Math.round(255 * (1 - m1) * (1 - k1)),
    Math.round(255 * (1 - y1) * (1 - k1)),
  ]
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const r1 = r / 255
  const g1 = g / 255
  const b1 = b / 255
  const max = Math.max(r1, g1, b1)
  const min = Math.min(r1, g1, b1)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r1) h = ((g1 - b1) / d + (g1 < b1 ? 6 : 0)) * 60
  else if (max === g1) h = ((b1 - r1) / d + 2) * 60
  else h = ((r1 - g1) / d + 4) * 60
  return [h, s, l]
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hNorm = h / 360
  return [
    Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hNorm) * 255),
    Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  ]
}

export function cmykGamutFactor(hueDeg: number): number {
  const h = (hueDeg / 180) * Math.PI
  // Blue-cyan (~210°): biggest CMYK weakness, −0.30
  const blue = 0.30 * Math.max(0, Math.cos(h - (210 / 180) * Math.PI))
  // Purple (~280°): poor reproduction, −0.22
  const purple = 0.22 * Math.max(0, Math.cos(h - (280 / 180) * Math.PI))
  // Green (~140°): moderate weakness, −0.15
  const green = 0.15 * Math.max(0, Math.cos(h - (140 / 180) * Math.PI))
  const reduction = blue + purple + green
  return Math.max(0.55, 1.0 - reduction)
}

/** Convert a hex color to its CMYK-emulated RGB equivalent (soft-proof simulation) */
export function hexToCmykEmulated(hex: string): string {
  if (!hex || hex === 'none' || hex === '') return hex

  // 1. Parse hex → RGB
  const [r, g, b] = hexToRgb(hex)

  // 2. Round-trip through CMYK (quantization clamp)
  const cmyk = rgbToCmyk(r, g, b)
  const [r2, g2, b2] = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k)

  // 3. Convert to HSL
  const hsl = rgbToHsl(r2, g2, b2)
  const h = hsl[0]
  let s = hsl[1]
  const l = hsl[2]

  // 4. Apply hue-dependent saturation reduction
  s *= cmykGamutFactor(h)

  // 5. Global saturation reduction
  s *= 0.85

  // 6. Convert back to RGB
  let [r3, g3, b3] = hslToRgb(h, s, l)

  // 7. Paper-white blend for very light colors
  if (l > 0.85) {
    const paperWhite = [250, 248, 245]
    const blend = Math.min(0.4, (l - 0.85) / (1.0 - 0.85) * 0.4)
    r3 = Math.round(r3 * (1 - blend) + paperWhite[0] * blend)
    g3 = Math.round(g3 * (1 - blend) + paperWhite[1] * blend)
    b3 = Math.round(b3 * (1 - blend) + paperWhite[2] * blend)
  }

  return rgbToHex(r3, g3, b3)
}

export function hexToCmyk(hex: string): CMYK {
  const [r, g, b] = hexToRgb(hex)
  return rgbToCmyk(r, g, b)
}

export function cmykToHex(cmyk: CMYK): string {
  const [r, g, b] = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k)
  return rgbToHex(r, g, b)
}

/** Format CMYK for SVG/CSS export */
export function hexToCmykString(hex: string): string {
  const cmyk = hexToCmyk(hex)
  return `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`
}
