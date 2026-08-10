export interface FontEntry {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'mono' | 'script'
  weights: number[]
  hasItalic: boolean
  source: 'google' | 'system' | 'local'
}

export const googleFonts: FontEntry[] = [
  // Sans-serif
  { family: 'Inter', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Montserrat', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Poppins', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Raleway', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800], hasItalic: true, source: 'google' },
  { family: 'Lato', category: 'sans-serif', weights: [300, 400, 700, 900], hasItalic: true, source: 'google' },
  { family: 'Nunito', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Work Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 600, 700], hasItalic: true, source: 'google' },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800], hasItalic: true, source: 'google' },
  { family: 'Outfit', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: false, source: 'google' },
  { family: 'Sora', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800], hasItalic: false, source: 'google' },
  { family: 'Manrope', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800], hasItalic: false, source: 'google' },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700], hasItalic: false, source: 'google' },
  { family: 'Urbanist', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },

  // Serif
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700], hasItalic: true, source: 'google' },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700], hasItalic: true, source: 'google' },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900], hasItalic: true, source: 'google' },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], hasItalic: true, source: 'google' },
  { family: 'Source Serif 4', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },
  { family: 'DM Serif Display', category: 'serif', weights: [400], hasItalic: true, source: 'google' },
  { family: 'Fraunces', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'google' },

  // Display
  { family: 'Bebas Neue', category: 'display', weights: [400], hasItalic: false, source: 'google' },
  { family: 'Oswald', category: 'display', weights: [300, 400, 500, 600, 700], hasItalic: false, source: 'google' },
  { family: 'Anton', category: 'display', weights: [400], hasItalic: false, source: 'google' },
  { family: 'Archivo Black', category: 'display', weights: [400], hasItalic: false, source: 'google' },
  { family: 'Righteous', category: 'display', weights: [400], hasItalic: false, source: 'google' },
  { family: 'Permanent Marker', category: 'display', weights: [400], hasItalic: false, source: 'google' },

  // Mono
  { family: 'JetBrains Mono', category: 'mono', weights: [300, 400, 500, 600, 700, 800], hasItalic: true, source: 'google' },
  { family: 'Fira Code', category: 'mono', weights: [300, 400, 500, 600, 700], hasItalic: false, source: 'google' },
  { family: 'Space Mono', category: 'mono', weights: [400, 700], hasItalic: true, source: 'google' },
  { family: 'IBM Plex Mono', category: 'mono', weights: [300, 400, 500, 600, 700], hasItalic: true, source: 'google' },

  // Script / Handwritten
  { family: 'Pacifico', category: 'script', weights: [400], hasItalic: false, source: 'google' },
  { family: 'Dancing Script', category: 'script', weights: [400, 500, 600, 700], hasItalic: false, source: 'google' },
  { family: 'Caveat', category: 'script', weights: [400, 500, 600, 700], hasItalic: false, source: 'google' },
  { family: 'Sacramento', category: 'script', weights: [400], hasItalic: false, source: 'google' },
]

export const systemFonts: FontEntry[] = [
  { family: 'Helvetica Neue', category: 'sans-serif', weights: [300, 400, 500, 700], hasItalic: true, source: 'system' },
  { family: 'Helvetica', category: 'sans-serif', weights: [300, 400, 700], hasItalic: true, source: 'system' },
  { family: 'Arial', category: 'sans-serif', weights: [400, 700], hasItalic: true, source: 'system' },
  { family: 'SF Pro Display', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], hasItalic: true, source: 'system' },
  { family: 'SF Pro Text', category: 'sans-serif', weights: [300, 400, 500, 600, 700], hasItalic: true, source: 'system' },
  { family: 'Georgia', category: 'serif', weights: [400, 700], hasItalic: true, source: 'system' },
  { family: 'Times New Roman', category: 'serif', weights: [400, 700], hasItalic: true, source: 'system' },
  { family: 'Courier New', category: 'mono', weights: [400, 700], hasItalic: true, source: 'system' },
  { family: 'Monaco', category: 'mono', weights: [400], hasItalic: false, source: 'system' },
  { family: 'Menlo', category: 'mono', weights: [400, 700], hasItalic: true, source: 'system' },
]

export const allFonts: FontEntry[] = [...systemFonts, ...googleFonts]

export const categories = ['sans-serif', 'serif', 'display', 'mono', 'script'] as const
