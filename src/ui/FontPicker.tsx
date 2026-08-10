import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { googleFonts, systemFonts, categories, type FontEntry } from '../fonts/fontList'
import { loadGoogleFont, detectSystemFonts } from '../fonts/fontLoader'

let cachedLocalFonts: FontEntry[] | null = null

interface Props {
  value: string
  onChange: (family: string) => void
}

const ROW_HEIGHT = 30
const VISIBLE_ROWS = 8
const OVERSCAN = 4

export function FontPicker({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [localFonts, setLocalFonts] = useState<FontEntry[]>(cachedLocalFonts || [])
  const [scrollTop, setScrollTop] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cachedLocalFonts) return
    detectSystemFonts().then((fonts) => {
      cachedLocalFonts = fonts
      setLocalFonts(fonts)
    })
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick)
      setTimeout(() => searchRef.current?.focus(), 0)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const filtered = useMemo(() => {
    const knownFamilies = new Set([...systemFonts, ...googleFonts].map((f) => f.family))
    const uniqueLocal = localFonts.filter((f) => !knownFamilies.has(f.family))
    const all = [...systemFonts, ...uniqueLocal, ...googleFonts]
    let result = all
    if (activeCategory) result = result.filter((f) => f.category === activeCategory)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((f) => f.family.toLowerCase().includes(q))
    }
    return result
  }, [search, activeCategory, localFonts])

  // Compute visible window for virtualized list
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + VISIBLE_ROWS * ROW_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
  const visibleFonts = useMemo(() => filtered.slice(startIndex, endIndex), [filtered, startIndex, endIndex])

  // Load Google Font CSS only for fonts visible in the viewport
  useEffect(() => {
    for (const font of visibleFonts) {
      if (font.source === 'google') {
        loadGoogleFont(font.family, [400])
      }
    }
  }, [visibleFonts])

  const scrollTopRef = useRef(0)
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const quantized = Math.floor(e.currentTarget.scrollTop / ROW_HEIGHT) * ROW_HEIGHT
    if (quantized !== scrollTopRef.current) {
      scrollTopRef.current = quantized
      setScrollTop(quantized)
    }
  }, [])

  const handleSelect = (font: FontEntry) => {
    if (font.source === 'google') {
      loadGoogleFont(font.family, font.weights)
    }
    onChange(font.family)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          if (!isOpen) setScrollTop(0)
          setIsOpen(!isOpen)
        }}
        className="w-full flex items-center gap-1.5 bg-bg-tertiary border border-transparent hover:border-border rounded-md px-2 py-1.5 text-[13px] text-text transition-colors"
      >
        <span className="flex-1 text-left truncate">{value || 'Select font'}</span>
        <ChevronDown size={12} className="text-text-dim shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden" style={{ width: 240 }}>
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1.5 bg-bg-tertiary rounded-md px-2 py-1">
              <Search size={12} className="text-text-dim shrink-0" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fonts..."
                className="flex-1 bg-transparent outline-none text-[13px] text-text placeholder:text-text-dim"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="flex gap-0.5 px-2 py-1.5 border-b border-border overflow-x-auto">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 ${
                !activeCategory ? 'bg-accent text-white' : 'text-text-dim hover:text-text'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors shrink-0 capitalize ${
                  activeCategory === cat ? 'bg-accent text-white' : 'text-text-dim hover:text-text'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div
            ref={listRef}
            onScroll={handleScroll}
            className="overflow-y-auto"
            style={{ height: Math.min(filtered.length, VISIBLE_ROWS) * ROW_HEIGHT }}
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-text-dim text-xs text-center">No fonts found</div>
            ) : (
              <div style={{ height: filtered.length * ROW_HEIGHT, position: 'relative' }}>
                {visibleFonts.map((font, i) => (
                  <button
                    key={font.family}
                    onClick={() => handleSelect(font)}
                    className={`w-full flex items-center justify-between px-3 text-[13px] transition-colors absolute left-0 right-0 ${
                      font.family === value
                        ? 'bg-accent/15 text-text'
                        : 'text-text-secondary hover:bg-bg-hover hover:text-text'
                    }`}
                    style={{
                      height: ROW_HEIGHT,
                      top: (startIndex + i) * ROW_HEIGHT,
                    }}
                  >
                    <span style={{ fontFamily: font.family }}>{font.family}</span>
                    <span className="text-[10px] text-text-dim uppercase">{font.source === 'google' ? 'g' : 'sys'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
