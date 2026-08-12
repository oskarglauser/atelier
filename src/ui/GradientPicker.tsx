import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { Plus, Trash2 } from 'lucide-react'
import type { GradientFill, GradientColorStop } from '../types/document'
import { useFloatingPopover } from '../hooks/useFloatingPopover'

interface Props {
  value: GradientFill
  onChange: (gradient: GradientFill) => void
}

function AngleWheel({ angle, onChange }: { angle: number; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handlePointer = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const deg = Math.round(Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90)
    onChange(((deg % 360) + 360) % 360)
  }, [onChange])

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (dragging.current) handlePointer(e) }
    const onUp = () => { dragging.current = false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [handlePointer])

  const rad = ((angle - 90) * Math.PI) / 180
  const r = 13
  const nx = 16 + Math.cos(rad) * r
  const ny = 16 + Math.sin(rad) * r

  return (
    <div
      ref={ref}
      className="w-8 h-8 rounded-full border border-border bg-bg-tertiary relative cursor-pointer shrink-0"
      onPointerDown={(e) => { dragging.current = true; handlePointer(e) }}
    >
      <div
        className="absolute w-2 h-2 rounded-full bg-accent"
        style={{ left: nx - 4, top: ny - 4 }}
      />
    </div>
  )
}

function StopBar({ stops, selectedIndex, onSelect, onChange }: {
  stops: GradientColorStop[]
  selectedIndex: number
  onSelect: (i: number) => void
  onChange: (stops: GradientColorStop[]) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const draggingIdx = useRef<number | null>(null)
  const stopsRef = useRef(stops)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    stopsRef.current = stops
    onChangeRef.current = onChange
  }, [stops, onChange])

  const cssGradient = stops.length >= 2
    ? `linear-gradient(90deg, ${[...stops].sort((a, b) => a.offset - b.offset).map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
    : stops[0]?.color || '#000'

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingIdx.current === null || !barRef.current) return
      const rect = barRef.current.getBoundingClientRect()
      const offset = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const newStops = [...stopsRef.current]
      newStops[draggingIdx.current] = { ...newStops[draggingIdx.current], offset: Math.round(offset * 100) / 100 }
      onChangeRef.current(newStops)
    }
    const onUp = () => { draggingIdx.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [])

  return (
    <div
      ref={barRef}
      className="relative h-5 rounded-md border border-border cursor-pointer"
      style={{ background: cssGradient }}
      onDoubleClick={(e) => {
        if (!barRef.current) return
        const rect = barRef.current.getBoundingClientRect()
        const offset = Math.round(((e.clientX - rect.left) / rect.width) * 100) / 100
        // Sample color at offset by interpolating between nearest stops
        const sorted = [...stops].sort((a, b) => a.offset - b.offset)
        let color = sorted[0]?.color || '#000000'
        for (let i = 0; i < sorted.length - 1; i++) {
          if (offset >= sorted[i].offset && offset <= sorted[i + 1].offset) {
            color = sorted[i].color // Use left stop color as default
            break
          }
        }
        const newStops = [...stops, { offset, color }]
        onChange(newStops)
        onSelect(newStops.length - 1)
      }}
    >
      {stops.map((stop, i) => (
        <div
          key={i}
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 cursor-grab ${
            i === selectedIndex ? 'border-accent shadow-sm' : 'border-white'
          }`}
          style={{
            left: `calc(${stop.offset * 100}% - 6px)`,
            backgroundColor: stop.color,
            boxShadow: '0 0 2px rgba(0,0,0,0.4)',
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onSelect(i)
            draggingIdx.current = i
          }}
        />
      ))}
    </div>
  )
}

export function GradientPicker({ value, onChange }: Props) {
  const [selectedStop, setSelectedStop] = useState(0)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const floatingStyle = useFloatingPopover({
    open: isPickerOpen,
    anchorRef: swatchRef,
    popoverRef,
    width: 226,
    estimatedHeight: 186,
    align: 'end',
  })

  const stops = value.stops || [
    { offset: 0, color: '#000000' },
    { offset: 1, color: '#ffffff' },
  ]

  const activeStop = stops[selectedStop] || stops[0]

  const updateStops = (newStops: GradientColorStop[]) => {
    onChange({ ...value, stops: newStops })
  }

  const updateStopColor = (color: string) => {
    const newStops = [...stops]
    newStops[selectedStop] = { ...newStops[selectedStop], color }
    onChange({ ...value, stops: newStops })
  }

  const addStop = () => {
    const newStops = [...stops, { offset: 0.5, color: '#888888' }]
    onChange({ ...value, stops: newStops })
    setSelectedStop(newStops.length - 1)
  }

  const removeStop = () => {
    if (stops.length <= 2) return
    const newStops = stops.filter((_, i) => i !== selectedStop)
    onChange({ ...value, stops: newStops })
    setSelectedStop(Math.max(0, selectedStop - 1))
  }

  const openPicker = () => setIsPickerOpen(true)

  useEffect(() => {
    if (!isPickerOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        swatchRef.current && !swatchRef.current.contains(e.target as Node)
      ) {
        setIsPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isPickerOpen])

  return (
    <div className="flex flex-col gap-2">
      {/* Gradient bar with draggable stops */}
      <StopBar
        stops={stops}
        selectedIndex={selectedStop}
        onSelect={setSelectedStop}
        onChange={updateStops}
      />

      {/* Angle + selected stop color */}
      <div className="flex items-center gap-1.5">
        <AngleWheel angle={value.angle} onChange={(a) => onChange({ ...value, angle: a })} />
        <button
          ref={swatchRef}
          onClick={openPicker}
          aria-label="Edit gradient stop color"
          aria-expanded={isPickerOpen}
          aria-haspopup="dialog"
          className="w-7 h-7 rounded-md border border-border cursor-pointer shrink-0"
          style={{ backgroundColor: activeStop?.color || '#000' }}
        />
        <HexColorInput
          color={activeStop?.color || '#000000'}
          onChange={updateStopColor}
          prefixed
          className="flex-1 min-w-0 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[12px] text-text outline-none font-mono"
        />
        <button
          onClick={addStop}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
          title="Add stop"
        >
          <Plus size={12} />
        </button>
        {stops.length > 2 && (
          <button
            onClick={removeStop}
            className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
            title="Remove stop"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Angle number input */}
      <div className="flex items-center gap-1.5">
        <label className="text-[11px] text-text-dim font-medium w-10">Angle</label>
        <input
          type="number"
          min={0}
          max={360}
          value={value.angle}
          onChange={(e) => onChange({ ...value, angle: (parseInt(e.target.value) || 0) % 360 })}
          className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[12px] text-text outline-none font-mono"
        />
        <label className="text-[11px] text-text-dim font-medium w-10">Noise</label>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value.noise * 100)}
          onChange={(e) => onChange({ ...value, noise: parseInt(e.target.value) / 100 })}
          className="flex-1 accent-accent"
        />
      </div>

      {/* Color picker popover */}
      {isPickerOpen && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Gradient stop color picker"
          className="fixed overflow-y-auto p-3 bg-bg-secondary border border-border rounded-lg shadow-xl z-[200]"
          style={floatingStyle}
        >
          <HexColorPicker
            color={activeStop?.color || '#000000'}
            onChange={updateStopColor}
            style={{ width: 200, height: 160 }}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
