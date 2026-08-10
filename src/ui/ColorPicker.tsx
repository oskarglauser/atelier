import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { X } from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { hexToCmyk, cmykToHex, hexToCmykEmulated, type CMYK } from '../utils/colorConvert'

interface Props {
  value: string
  onChange: (color: string) => void
  label?: string
  colorMode?: 'rgb' | 'cmyk'
}

export function ColorPicker({ value, onChange, label, colorMode: colorModeProp }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const popoverHeight = 240
    const popoverWidth = 232
    const spaceAbove = rect.top
    const top = spaceAbove > popoverHeight
      ? rect.top - popoverHeight - 8
      : rect.bottom + 8
    const left = Math.max(8, rect.right - popoverWidth)
    setPopoverPos({ top, left })
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleToggle = () => {
    if (!isOpen) updatePosition()
    setIsOpen(!isOpen)
  }

  const globalColorMode = useCanvasStore((s) => s.colorMode)
  const colorMode = colorModeProp ?? globalColorMode
  const isCmyk = colorMode === 'cmyk'
  const hasColor = value && value !== 'none' && value !== ''
  const displayColor = hasColor ? value : '#000000'
  const safeHex = displayColor.startsWith('#') ? displayColor : `#${displayColor}`
  const cmyk = hasColor ? hexToCmyk(safeHex) : { c: 0, m: 0, y: 0, k: 0 }
  // In CMYK mode, show the CMYK-emulated color visually
  const visualHex = isCmyk && hasColor ? hexToCmykEmulated(safeHex) : safeHex

  // In CMYK mode, clamp picked colors to CMYK gamut (round-trip)
  const handleColorChange = (hex: string) => {
    if (isCmyk && hex) {
      onChange(hexToCmykEmulated(hex))
    } else {
      onChange(hex)
    }
  }

  const handleCmykChange = (field: keyof CMYK, v: number) => {
    const updated = { ...cmyk, [field]: Math.max(0, Math.min(100, v)) }
    onChange(cmykToHex(updated))
  }

  return (
    <div className="flex items-center gap-1.5">
      {label && <label className="w-6 text-text-dim text-[11px] font-medium">{label}</label>}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 relative">
        <button
          ref={btnRef}
          onClick={handleToggle}
          className="w-7 h-7 rounded-md border border-border cursor-pointer shrink-0 transition-shadow hover:shadow-sm relative overflow-hidden"
          style={{ backgroundColor: hasColor ? visualHex : 'transparent' }}
        >
          {!hasColor && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-px bg-red-500 rotate-45 absolute" />
            </div>
          )}
        </button>
        {hasColor ? (
          colorMode === 'cmyk' ? (
            <span className="flex-1 min-w-0 bg-bg-tertiary rounded-md px-2 py-1 text-[12px] text-text font-mono truncate cursor-pointer" onClick={handleToggle}>
              {cmyk.c}/{cmyk.m}/{cmyk.y}/{cmyk.k}
            </span>
          ) : (
            <HexColorInput
              color={safeHex}
              onChange={handleColorChange}
              prefixed
              className="flex-1 min-w-0 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors font-mono"
              placeholder="#000000"
            />
          )
        ) : (
          <button
            onClick={handleToggle}
            className="flex-1 min-w-0 bg-bg-tertiary border border-transparent rounded-md px-2 py-1 text-[13px] text-text-dim text-left"
          >
            No fill
          </button>
        )}
        {isOpen && createPortal(
          <div
            ref={popoverRef}
            className="fixed p-3 bg-bg-secondary border border-border rounded-lg shadow-xl z-50"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <HexColorPicker color={safeHex} onChange={handleColorChange} style={{ width: 200, height: 160 }} />
            <div className="mt-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-md border border-border" style={{ backgroundColor: visualHex }} />
              <HexColorInput
                color={safeHex}
                onChange={handleColorChange}
                prefixed
                className="flex-1 bg-bg-tertiary border border-border focus:border-accent rounded-md px-2 py-1.5 text-[13px] text-text outline-none font-mono"
              />
              <button
                onClick={() => { onChange(''); setIsOpen(false) }}
                className="w-8 h-8 flex items-center justify-center rounded-md border border-border text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
                title="Remove color"
              >
                <X size={14} />
              </button>
            </div>
            {colorMode === 'cmyk' && (
              <div className="mt-2 grid grid-cols-4 gap-1">
                {(['c', 'm', 'y', 'k'] as const).map((ch) => (
                  <div key={ch} className="flex flex-col items-center gap-0.5">
                    <label className="text-[10px] text-text-dim font-medium uppercase">{ch}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={cmyk[ch]}
                      onChange={(e) => handleCmykChange(ch, parseInt(e.target.value) || 0)}
                      className="w-full bg-bg-tertiary border border-border focus:border-accent rounded px-1.5 py-1 text-[12px] text-text outline-none font-mono text-center"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
      </div>
    </div>
  )
}
