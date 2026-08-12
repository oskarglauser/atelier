import { useState, useRef, useEffect, useCallback } from 'react'
import { useViewportStore } from '../store/viewportStore'
import { useShapes } from '../hooks/useShapes'
import { getShapesBounds } from '../utils/math'
import { Minus, Plus, ChevronDown } from 'lucide-react'

const ZOOM_PRESETS = [
  { label: '25%', value: 0.25 },
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
  { label: '150%', value: 1.5 },
  { label: '200%', value: 2 },
  { label: '400%', value: 4 },
]

export function ZoomControls() {
  const { zoom, zoomIn, zoomOut, zoomToFit, setZoom, stageWidth, stageHeight } = useViewportStore()
  const shapes = useShapes()
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleZoomToFit = useCallback(() => {
    if (shapes.length === 0) {
      zoomToFit()
      return
    }
    zoomToFit(getShapesBounds(shapes))
  }, [shapes, zoomToFit])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showDropdown])

  const zoomTo100 = () => {
    setZoom(1, stageWidth / 2, stageHeight / 2)
  }

  const handlePreset = (value: number) => {
    setZoom(value, stageWidth / 2, stageHeight / 2)
    setShowDropdown(false)
  }

  return (
    <div className="absolute bottom-4 right-3 flex items-center bg-bg-secondary/90 backdrop-blur-xl border border-border-light/70 rounded-xl z-10 shadow-[0_10px_32px_rgba(0,0,0,0.16)]" ref={dropdownRef}>
      <button
        onClick={zoomOut}
        className="w-8 h-8 flex items-center justify-center text-text-dim hover:text-text transition-colors"
        title="Zoom out"
      >
        <Minus size={14} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="h-8 text-text-secondary hover:text-text text-[13px] tabular-nums min-w-[52px] text-center transition-colors flex items-center justify-center gap-0.5"
      >
        {Math.round(zoom * 100)}%
        <ChevronDown size={10} strokeWidth={1.5} className="text-text-dim" />
      </button>
      <button
        onClick={zoomIn}
        className="w-8 h-8 flex items-center justify-center text-text-dim hover:text-text transition-colors"
        title="Zoom in"
      >
        <Plus size={14} strokeWidth={1.5} />
      </button>

      {showDropdown && (
        <div className="absolute bottom-full right-0 mb-1 bg-bg-secondary border border-border rounded-lg shadow-xl py-1 min-w-[140px] z-50">
          <button
            onClick={() => { handleZoomToFit(); setShowDropdown(false) }}
            className="w-full px-3 py-1.5 text-[13px] text-text hover:bg-bg-hover text-left transition-colors"
          >
            Zoom to Fit
          </button>
          <button
            onClick={() => { zoomTo100(); setShowDropdown(false) }}
            className="w-full px-3 py-1.5 text-[13px] text-text hover:bg-bg-hover text-left transition-colors"
          >
            Zoom to 100%
          </button>
          <div className="h-px bg-border my-1" />
          {ZOOM_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePreset(preset.value)}
              className={`w-full px-3 py-1.5 text-[13px] text-left transition-colors ${
                Math.round(zoom * 100) === Math.round(preset.value * 100)
                  ? 'bg-accent/15 text-text'
                  : 'text-text-secondary hover:bg-bg-hover hover:text-text'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
