import type { FrameRuler, ExportConfig } from '../types/document'
import { generateId } from './id'

export interface ArtboardPreset {
  name: string
  width: number
  height: number
  colorMode?: 'rgb' | 'cmyk'
  exports?: ExportConfig[]
  rulers?: FrameRuler[]
}

export interface ArtboardCategory {
  label: string
  colorMode?: 'rgb' | 'cmyk'
  presets: ArtboardPreset[]
}

// All sizes in pixels at 72 DPI (1 inch = 72px, 1mm = 2.835px)
const MM = 2.835
const IN = 72

/** Creates 4 rulers (left, right, top, bottom) inset by the given amount. Used for both margins and bleed. */
export function insetRulers(width: number, height: number, inset: number): FrameRuler[] {
  return [
    { id: generateId(), axis: 'x', position: inset },
    { id: generateId(), axis: 'x', position: width - inset },
    { id: generateId(), axis: 'y', position: inset },
    { id: generateId(), axis: 'y', position: height - inset },
  ]
}

function ex(format: ExportConfig['format'], scale: ExportConfig['scale'] = '1x', suffix?: string): ExportConfig {
  return { id: generateId(), format, scale, suffix }
}

const a3W = Math.round(297 * MM), a3H = Math.round(420 * MM)
const a4W = Math.round(210 * MM), a4H = Math.round(297 * MM)
const a5W = Math.round(148 * MM), a5H = Math.round(210 * MM)
const a6W = Math.round(105 * MM), a6H = Math.round(148 * MM)
const letterW = Math.round(8.5 * IN), letterH = Math.round(11 * IN)
const legalW = Math.round(8.5 * IN), legalH = Math.round(14 * IN)
const tabloidW = Math.round(11 * IN), tabloidH = Math.round(17 * IN)

const mmMargin20 = Math.round(20 * MM) // ~57px
const inMargin1 = IN // 72px
const bleed125 = Math.round(0.125 * IN) // ~9px

const printExports = () => [ex('pdf')]

export const artboardPresets: ArtboardCategory[] = [
  {
    label: 'Paper',
    colorMode: 'cmyk',
    presets: [
      { name: 'A3', width: a3W, height: a3H, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(a3W, a3H, mmMargin20) },
      { name: 'A4', width: a4W, height: a4H, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(a4W, a4H, mmMargin20) },
      { name: 'A5', width: a5W, height: a5H, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(a5W, a5H, mmMargin20) },
      { name: 'A6', width: a6W, height: a6H, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(a6W, a6H, mmMargin20) },
      { name: 'US Letter', width: letterW, height: letterH, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(letterW, letterH, inMargin1) },
      { name: 'US Legal', width: legalW, height: legalH, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(legalW, legalH, inMargin1) },
      { name: 'Tabloid', width: tabloidW, height: tabloidH, colorMode: 'cmyk', exports: printExports(), rulers: insetRulers(tabloidW, tabloidH, inMargin1) },
    ],
  },
  {
    label: 'Business',
    colorMode: 'cmyk',
    presets: (() => {
      const bcW = Math.round(3.5 * IN), bcH = Math.round(2 * IN)
      const bcEuW = Math.round(85 * MM), bcEuH = Math.round(55 * MM)
      const lhW = Math.round(8.5 * IN), lhH = Math.round(11 * IN)
      const e10W = Math.round(9.5 * IN), e10H = Math.round(4.125 * IN)
      const edlW = Math.round(220 * MM), edlH = Math.round(110 * MM)
      return [
        { name: 'Business Card', width: bcW, height: bcH, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(bcW, bcH, bleed125) },
        { name: 'Business Card (EU)', width: bcEuW, height: bcEuH, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(bcEuW, bcEuH, Math.round(3 * MM)) },
        { name: 'Letterhead', width: lhW, height: lhH, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(lhW, lhH, inMargin1) },
        { name: 'Envelope #10', width: e10W, height: e10H, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(e10W, e10H, Math.round(0.5 * IN)) },
        { name: 'Envelope DL', width: edlW, height: edlH, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(edlW, edlH, Math.round(15 * MM)) },
      ]
    })(),
  },
  {
    label: 'Poster',
    colorMode: 'cmyk',
    presets: (() => {
      const p18W = Math.round(18 * IN), p18H = Math.round(24 * IN)
      const p24W = Math.round(24 * IN), p24H = Math.round(36 * IN)
      const pa2W = Math.round(420 * MM), pa2H = Math.round(594 * MM)
      const pa1W = Math.round(594 * MM), pa1H = Math.round(841 * MM)
      return [
        { name: 'Poster 18×24', width: p18W, height: p18H, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(p18W, p18H, inMargin1) },
        { name: 'Poster 24×36', width: p24W, height: p24H, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(p24W, p24H, inMargin1) },
        { name: 'Poster A2', width: pa2W, height: pa2H, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(pa2W, pa2H, mmMargin20) },
        { name: 'Poster A1', width: pa1W, height: pa1H, colorMode: 'cmyk' as const, exports: printExports(), rulers: insetRulers(pa1W, pa1H, mmMargin20) },
      ]
    })(),
  },
  {
    label: 'Screen',
    presets: [
      { name: 'Desktop HD', width: 1920, height: 1080, exports: [ex('png', '1x')] },
      { name: 'Desktop 4K', width: 3840, height: 2160, exports: [ex('png', '1x')] },
      { name: 'MacBook Pro 14"', width: 1512, height: 982, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'MacBook Pro 16"', width: 1728, height: 1117, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'iPad Pro 12.9"', width: 1024, height: 1366, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'iPad Pro 11"', width: 834, height: 1194, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'iPhone 15 Pro', width: 393, height: 852, exports: [ex('png', '1x'), ex('png', '2x'), ex('png', '3x')] },
      { name: 'iPhone 15 Pro Max', width: 430, height: 932, exports: [ex('png', '1x'), ex('png', '2x'), ex('png', '3x')] },
    ],
  },
  {
    label: 'Social',
    presets: [
      { name: 'Instagram Post', width: 1080, height: 1080, exports: [ex('png', '1x'), ex('jpg', '1x')], rulers: insetRulers(1080, 1080, 60) },
      { name: 'Instagram Story', width: 1080, height: 1920, exports: [ex('png', '1x'), ex('jpg', '1x')], rulers: [
        // Top safe zone (status bar + username overlay)
        { id: generateId(), axis: 'y', position: 250 },
        // Bottom safe zone (swipe up / CTA area)
        { id: generateId(), axis: 'y', position: 1670 },
        // Left/right content margins
        { id: generateId(), axis: 'x', position: 60 },
        { id: generateId(), axis: 'x', position: 1020 },
      ]},
      { name: 'Facebook Post', width: 1200, height: 630, exports: [ex('png', '1x'), ex('jpg', '1x')] },
      { name: 'Facebook Cover', width: 820, height: 312, exports: [ex('png', '1x'), ex('jpg', '1x')], rulers: [
        // Profile photo overlap safe zone (left side)
        { id: generateId(), axis: 'x', position: 200 },
        // Top/bottom margins
        { id: generateId(), axis: 'y', position: 40 },
        { id: generateId(), axis: 'y', position: 272 },
      ]},
      { name: 'X / Twitter Post', width: 1200, height: 675, exports: [ex('png', '1x'), ex('jpg', '1x')] },
      { name: 'LinkedIn Post', width: 1200, height: 627, exports: [ex('png', '1x'), ex('jpg', '1x')] },
      { name: 'YouTube Thumbnail', width: 1280, height: 720, exports: [ex('png', '1x'), ex('jpg', '1x')], rulers: [
        // Bottom-right timestamp overlay safe zone
        { id: generateId(), axis: 'x', position: 1100 },
        { id: generateId(), axis: 'y', position: 640 },
        // Content margins
        { id: generateId(), axis: 'x', position: 60 },
        { id: generateId(), axis: 'y', position: 60 },
      ]},
    ],
  },
  {
    label: 'Icons',
    presets: [
      { name: 'App Icon iOS', width: 1024, height: 1024, exports: [ex('png', '1x'), ex('png', '2x'), ex('svg', '1x')] },
      { name: 'App Icon Android', width: 512, height: 512, exports: [ex('png', '1x'), ex('png', '2x'), ex('svg', '1x')] },
      { name: 'Favicon', width: 64, height: 64, exports: [ex('png', '1x'), ex('png', '2x'), ex('svg', '1x')] },
      { name: 'Logo', width: 500, height: 500, exports: [ex('png', '1x'), ex('png', '2x'), ex('svg', '1x')] },
      { name: 'Logo Wide', width: 800, height: 400, exports: [ex('png', '1x'), ex('png', '2x'), ex('svg', '1x')] },
    ],
  },
  {
    label: 'Social Icons',
    presets: [
      { name: 'Instagram Profile', width: 320, height: 320, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'Facebook Profile', width: 170, height: 170, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'X/Twitter Profile', width: 400, height: 400, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'YouTube Profile', width: 800, height: 800, exports: [ex('png', '1x'), ex('png', '2x')] },
      { name: 'LinkedIn Profile', width: 400, height: 400, exports: [ex('png', '1x'), ex('png', '2x')] },
    ],
  },
]
