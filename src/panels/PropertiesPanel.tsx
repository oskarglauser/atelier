import { useShapes } from '../hooks/useShapes'
import { useUIStore } from '../store/uiStore'
import { useDocument } from '../hooks/useDocument'
import { updateShape, addShape } from '../document/operations'
import type { Shape, TextShape, LineShape, LineCap, FrameShape, FrameRuler, ExportConfig, ImageShape } from '../types/document'
import { useCallback, useMemo, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { useViewportStore } from '../store/viewportStore'
import { ColorPicker } from '../ui/ColorPicker'
import { GradientPicker } from '../ui/GradientPicker'
import { Switch } from '../ui/Switch'
import { FontPicker } from '../ui/FontPicker'
import { allFonts } from '../fonts/fontList'
import { getStageRef } from '../store/stageRef'
import { exportShapes, type ExportFormat, type ExportScale } from '../utils/exportShape'
import { artboardPresets, insetRulers, type ArtboardPreset } from '../utils/artboardPresets'
import { generateId } from '../utils/id'
import { DEFAULT_GRADIENT } from '../utils/constants'
import {
  AlignLeft, AlignCenter, AlignRight,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  Italic, Underline, Strikethrough,
  CaseSensitive, CaseUpper, CaseLower,
  Baseline, ALargeSmall, MoveVertical, WholeWord, WrapText,
  Download, Trash2, Plus, Ruler, Link, Unlink,
} from 'lucide-react'

function NumberField({ label, icon, value, onChange, step = 1, min }: { label: string; icon?: React.ReactNode; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="w-6 text-text-dim text-[11px] font-medium shrink-0 flex items-center justify-center" title={label}>
        {icon || label}
      </label>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none w-full transition-colors"
      />
    </div>
  )
}

function ToggleButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
        active ? 'bg-accent text-white' : 'text-text-dim hover:text-text hover:bg-bg-hover'
      }`}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3 border-b border-border">
      <div className="text-text-dim text-[11px] font-semibold uppercase tracking-widest mb-2.5">{title}</div>
      {children}
    </div>
  )
}

const CAP_OPTIONS: { value: LineCap; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
]

function CapPicker({ label, value, onChange }: { label: string; value: LineCap; onChange: (v: LineCap) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="w-10 text-text-dim text-[11px] font-medium shrink-0">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LineCap)}
        className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors"
      >
        {CAP_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

const WEIGHT_OPTIONS = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'Extra Light' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'Semi Bold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'Extra Bold' },
  { value: 900, label: 'Black' },
]

function CanvasSettingsPanel() {
  const { backgroundColor, setBackgroundColor, showGrid, setShowGrid, gridSize, setGridSize, snapToGrid, setSnapToGrid, snapToRulers, setSnapToRulers, showRulers, setShowRulers, colorMode, setColorMode } = useCanvasStore()

  return (
    <div className="w-60 bg-bg-secondary border-l border-border flex flex-col shrink-0 overflow-y-auto">
      <div className="h-9 flex items-center px-3.5 text-text-dim text-[11px] font-semibold uppercase tracking-widest">
        Canvas
      </div>

      <Section title="Background">
        <ColorPicker value={backgroundColor} onChange={setBackgroundColor} />
      </Section>

      <Section title="Color Mode">
        <div className="flex gap-1">
          <button
            onClick={() => setColorMode('rgb')}
            className={`flex-1 py-1 rounded-md text-[12px] font-medium transition-colors ${
              colorMode === 'rgb' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-dim hover:text-text'
            }`}
          >
            RGB
          </button>
          <button
            onClick={() => setColorMode('cmyk')}
            className={`flex-1 py-1 rounded-md text-[12px] font-medium transition-colors ${
              colorMode === 'cmyk' ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-dim hover:text-text'
            }`}
          >
            CMYK
          </button>
        </div>
      </Section>

      <Section title="Grid">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">Show dots</span>
            <Switch checked={showGrid} onChange={setShowGrid} ariaLabel="Show grid dots" />
          </div>
          <NumberField label="Size" value={gridSize} onChange={setGridSize} min={5} step={5} />
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">Snap to grid</span>
            <Switch checked={snapToGrid} onChange={setSnapToGrid} ariaLabel="Snap to grid" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">Snap to rulers</span>
            <Switch checked={snapToRulers} onChange={setSnapToRulers} ariaLabel="Snap to rulers" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">Show rulers</span>
            <Switch checked={showRulers} onChange={setShowRulers} ariaLabel="Show rulers" />
          </div>
        </div>
      </Section>
    </div>
  )
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'eps', label: 'EPS' },
  { value: 'pdf', label: 'PDF' },
]

const SCALE_OPTIONS: { value: ExportScale; label: string }[] = [
  { value: '0.5x', label: '0.5x' },
  { value: '1x', label: '1x' },
  { value: '2x', label: '2x' },
  { value: '3x', label: '3x' },
  { value: '4x', label: '4x' },
]

function ExportSection({ shapes, allShapes, update }: { shapes: Shape[]; allShapes: Shape[]; update?: (key: string, value: unknown) => void }) {
  const frameShape = shapes.find((s) => s.type === 'frame') as FrameShape | undefined
  const frameExports = frameShape?.exports || []

  // Local exports list: seeded from frame exports if available, otherwise one default row
  const [localExports, setLocalExports] = useState<ExportConfig[]>(() => {
    if (frameExports.length > 0) return frameExports
    const { lastExportFormat, lastExportScale } = useCanvasStore.getState()
    return [{ id: generateId(), format: lastExportFormat as ExportConfig['format'], scale: lastExportScale as ExportConfig['scale'] }]
  })
  const [includeFrame, setIncludeFrame] = useState(true)
  const [exporting, setExporting] = useState(false)

  const hasFrame = shapes.some((s) => s.type === 'frame')

  const syncToFrame = (exports: ExportConfig[]) => {
    if (frameShape && update) {
      update('exports' as keyof Shape, exports)
    }
  }

  const addExportRow = () => {
    const { lastExportFormat, lastExportScale } = useCanvasStore.getState()
    const newRow: ExportConfig = { id: generateId(), format: lastExportFormat as ExportConfig['format'], scale: lastExportScale as ExportConfig['scale'] }
    const next = [...localExports, newRow]
    setLocalExports(next)
    syncToFrame(next)
  }

  const removeExportRow = (id: string) => {
    const next = localExports.filter((e) => e.id !== id)
    setLocalExports(next)
    syncToFrame(next)
  }

  const updateExportRow = (id: string, field: 'format' | 'scale', value: string) => {
    const next = localExports.map((e) => e.id === id ? { ...e, [field]: value } : e)
    setLocalExports(next)
    syncToFrame(next)
    // Persist last-used format/scale for new export rows
    const updated = next.find((e) => e.id === id)
    if (updated) useCanvasStore.getState().setLastExport(updated.format, updated.scale)
  }

  const handleExportAll = async () => {
    const stage = getStageRef()
    if (!stage) return
    setExporting(true)
    try {
      const { zoom, offsetX, offsetY } = useViewportStore.getState()
      for (const exp of localExports) {
        await exportShapes(stage, shapes, exp.format as ExportFormat, exp.scale as ExportScale, includeFrame, zoom, offsetX, offsetY, allShapes)
      }
    } finally {
      setExporting(false)
    }
  }

  const handleExportSingle = async (exp: ExportConfig) => {
    const stage = getStageRef()
    if (!stage) return
    setExporting(true)
    try {
      const { zoom, offsetX, offsetY } = useViewportStore.getState()
      await exportShapes(stage, shapes, exp.format as ExportFormat, exp.scale as ExportScale, includeFrame, zoom, offsetX, offsetY, allShapes)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Section title="Export">
      <div className="flex flex-col gap-1.5">
        {localExports.map((exp) => {
          const isVector = exp.format === 'svg' || exp.format === 'eps' || exp.format === 'pdf'
          return (
            <div key={exp.id} className="flex items-center gap-1">
              <select
                value={exp.format}
                onChange={(e) => updateExportRow(exp.id, 'format', e.target.value)}
                className="w-[52px] bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-1.5 py-1 text-[12px] text-text outline-none transition-colors cursor-pointer"
              >
                {FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {!isVector ? (
                <select
                  value={exp.scale}
                  onChange={(e) => updateExportRow(exp.id, 'scale', e.target.value)}
                  className="w-[46px] bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-1 py-1 text-[12px] text-text outline-none transition-colors cursor-pointer"
                >
                  {SCALE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <span className="w-[46px] text-[12px] text-text-dim text-center">-</span>
              )}
              <button
                onClick={() => handleExportSingle(exp)}
                disabled={exporting}
                className="flex-1 flex items-center justify-center py-1 bg-bg-tertiary text-text-dim hover:text-text rounded-md text-[11px] transition-colors disabled:opacity-50"
              >
                <Download size={11} />
              </button>
              {localExports.length > 1 && (
                <button
                  onClick={() => removeExportRow(exp.id)}
                  className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-red-500 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )
        })}

        <button
          onClick={addExportRow}
          className="flex items-center justify-center gap-1 w-full py-1 bg-bg-tertiary text-text-dim hover:text-text rounded-md text-[11px] font-medium transition-colors"
        >
          <Plus size={10} /> Add Export
        </button>

        {hasFrame && (
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-text-secondary">Include frame</span>
            <Switch checked={includeFrame} onChange={setIncludeFrame} ariaLabel="Include frame in export" />
          </div>
        )}

        {localExports.length > 1 && (
          <button
            onClick={handleExportAll}
            disabled={exporting}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-accent text-white rounded-md text-[13px] font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <Download size={13} strokeWidth={2} />
            {exporting ? 'Exporting...' : `Export All (${localExports.length})`}
          </button>
        )}
      </div>
    </Section>
  )
}

function ArtboardPresetsPanel({ onSelect }: { onSelect: (preset: ArtboardPreset) => void }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return artboardPresets
    const q = search.toLowerCase()
    return artboardPresets
      .map((cat) => ({
        ...cat,
        presets: cat.presets.filter((p) => p.name.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.presets.length > 0)
  }, [search])

  return (
    <div className="w-60 bg-bg-secondary border-l border-border flex flex-col shrink-0 overflow-y-auto">
      <div className="h-9 flex items-center px-3.5 text-text-dim text-[11px] font-semibold uppercase tracking-widest">
        Frame Presets
      </div>
      <div className="px-3.5 pb-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search presets..."
          className="w-full bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors placeholder:text-text-dim"
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((category) => (
          <div key={category.label} className="px-3.5 py-2 border-b border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-text-dim text-[11px] font-semibold uppercase tracking-widest">{category.label}</span>
              {category.colorMode && (
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                  category.colorMode === 'cmyk' ? 'bg-amber-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'
                }`}>
                  {category.colorMode.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              {category.presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => onSelect(preset)}
                  className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[13px] text-text-secondary hover:bg-bg-hover hover:text-text transition-colors text-left"
                >
                  <span>{preset.name}</span>
                  <span className="text-[11px] text-text-dim tabular-nums">{preset.width}×{preset.height}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const shapes = useShapes()
  const { selectedIds } = useUIStore()
  const { doc, activePageId } = useDocument()
  const isOpen = useUIStore((s) => s.isRightPanelOpen)
  const activeTool = useUIStore((s) => s.activeTool)
  const globalColorMode = useCanvasStore((s) => s.colorMode)

  const selected = shapes.filter((s) => selectedIds.has(s.id))
  const first = selected.length > 0 ? selected[0] : null
  const textShape = first?.type === 'text' ? first as TextShape : null

  const update = useCallback((key: string, value: unknown) => {
    selectedIds.forEach((id) => {
      updateShape(doc, activePageId, id, { [key]: value } as Partial<Shape>)
    })
  }, [doc, activePageId, selectedIds])

  const fontEntry = textShape
    ? allFonts.find((f) => f.family === textShape.fontFamily) || null
    : null

  const availableWeights = useMemo(() => {
    if (!fontEntry) return WEIGHT_OPTIONS
    return WEIGHT_OPTIONS.filter((w) => fontEntry.weights.includes(w.value))
  }, [fontEntry])

  const fontHasItalic = fontEntry?.hasItalic ?? true

  const handlePresetSelect = useCallback((preset: ArtboardPreset) => {
    const { zoom, offsetX, offsetY } = useViewportStore.getState()
    const centerX = (window.innerWidth / 2 - offsetX) / zoom
    const centerY = (window.innerHeight / 2 - offsetY) / zoom
    const overrides: Partial<Shape> = {
      x: centerX - preset.width / 2,
      y: centerY - preset.height / 2,
      width: preset.width,
      height: preset.height,
      name: preset.name,
    }
    if (preset.colorMode) {
      overrides.colorMode = preset.colorMode
    }
    if (preset.exports && preset.exports.length > 0) {
      (overrides as Record<string, unknown>).exports = preset.exports
    }
    if (preset.rulers && preset.rulers.length > 0) {
      (overrides as Record<string, unknown>).rulers = preset.rulers
    }
    const shape = addShape(doc, activePageId, 'frame', overrides)
    useUIStore.getState().setSelectedIds(new Set([shape.id]))
    useUIStore.getState().setActiveTool('select')
  }, [doc, activePageId])

  if (!isOpen) return null

  if (!first) {
    if (activeTool === 'frame') {
      return <ArtboardPresetsPanel onSelect={handlePresetSelect} />
    }
    return <CanvasSettingsPanel />
  }

  const isText = first.type === 'text'
  const effectiveColorMode = first.colorMode ?? globalColorMode

  return (
    <div className="w-60 bg-bg-secondary border-l border-border flex flex-col shrink-0 overflow-y-auto">
      <div className="h-9 flex items-center px-3.5 text-text-dim text-[11px] font-semibold uppercase tracking-widest">
        Design
      </div>

      <Section title="Position">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField label="X" value={first.x} onChange={(v) => update('x', v)} />
          <NumberField label="Y" value={first.y} onChange={(v) => update('y', v)} />
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <div className="flex-1">
            <NumberField label="W" value={first.width} onChange={(v) => {
              if (first.lockProportions && first.height && first.width) {
                selectedIds.forEach((id) => {
                  const shape = shapes.find((s) => s.id === id)
                  if (!shape) return
                  const ratio = shape.height / shape.width
                  updateShape(doc, activePageId, id, { width: v, height: Math.round(v * ratio * 100) / 100 })
                })
              } else {
                update('width', v)
              }
            }} />
          </div>
          <button
            onClick={() => update('lockProportions', !first.lockProportions)}
            title={first.lockProportions ? 'Unlock proportions' : 'Lock proportions'}
            className={`w-6 h-6 flex items-center justify-center rounded-md transition-all shrink-0 ${
              first.lockProportions ? 'text-accent' : 'text-text-dim hover:text-text'
            }`}
          >
            {first.lockProportions ? <Link size={12} /> : <Unlink size={12} />}
          </button>
          <div className="flex-1">
            <NumberField label="H" value={first.height} onChange={(v) => {
              if (first.lockProportions && first.width && first.height) {
                selectedIds.forEach((id) => {
                  const shape = shapes.find((s) => s.id === id)
                  if (!shape) return
                  const ratio = shape.width / shape.height
                  updateShape(doc, activePageId, id, { height: v, width: Math.round(v * ratio * 100) / 100 })
                })
              } else {
                update('height', v)
              }
            }} />
          </div>
        </div>
        <div className="mt-1.5 w-1/2">
          <NumberField label="°" value={first.rotation} onChange={(v) => update('rotation', v)} />
        </div>
      </Section>

      <Section title="Color Mode">
        <div className="flex gap-1">
          {(['auto', 'rgb', 'cmyk'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => update('colorMode', mode === 'auto' ? undefined : mode)}
              className={`flex-1 py-1 rounded-md text-[12px] font-medium transition-colors ${
                (mode === 'auto' && !first.colorMode) || first.colorMode === mode
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-dim hover:text-text'
              }`}
            >
              {mode === 'auto' ? `Auto (${globalColorMode.toUpperCase()})` : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fill">
        <div className="flex gap-1 mb-2">
          {(['solid', 'gradient'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === 'gradient' && !first.gradient) {
                  // Batch fillType + gradient into one transaction
                  doc.transact(() => {
                    selectedIds.forEach((id) => {
                      updateShape(doc, activePageId, id, {
                        fillType: 'gradient',
                        gradient: {
                          ...DEFAULT_GRADIENT,
                          stops: [
                            { offset: 0, color: first.fill || '#000000' },
                            { offset: 1, color: '#ffffff' },
                          ],
                        },
                      } as Partial<Shape>)
                    })
                  })
                } else {
                  update('fillType', mode)
                }
              }}
              className={`flex-1 py-1 rounded-md text-[12px] font-medium transition-colors capitalize ${
                (first.fillType || 'solid') === mode
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-dim hover:text-text'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {(first.fillType || 'solid') === 'solid' ? (
          <ColorPicker
            value={first.type === 'frame' ? ((first as FrameShape).backgroundColor || '#ffffff') : first.fill}
            onChange={(v) => update(first.type === 'frame' ? 'backgroundColor' : 'fill', v)}
            colorMode={effectiveColorMode}
          />
        ) : (
          <GradientPicker
            value={first.gradient || DEFAULT_GRADIENT}
            onChange={(g) => update('gradient', g)}
          />
        )}
      </Section>

      <Section title="Stroke">
        <ColorPicker value={first.stroke} onChange={(v) => update('stroke', v)} colorMode={effectiveColorMode} />
        <div className="mt-1.5 w-1/2">
          <NumberField label="W" value={first.strokeWidth} onChange={(v) => update('strokeWidth', v)} step={0.5} />
        </div>
      </Section>

      {first.type === 'line' && (
        <Section title="Line Ends">
          <div className="flex flex-col gap-1.5">
            <CapPicker label="Start" value={(first as LineShape).startCap || 'none'} onChange={(v) => update('startCap', v)} />
            <CapPicker label="End" value={(first as LineShape).endCap || 'none'} onChange={(v) => update('endCap', v)} />
          </div>
        </Section>
      )}

      <Section title="Opacity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={first.opacity}
            onChange={(e) => update('opacity', parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-[13px] text-text-secondary w-9 text-right tabular-nums">{Math.round(first.opacity * 100)}%</span>
        </div>
      </Section>

      {isText && textShape && (
        <>
          <Section title="Font">
            <FontPicker
              value={textShape.fontFamily}
              onChange={(v) => update('fontFamily' as keyof Shape, v)}
            />
            <div className="mt-2">
              <div className="flex items-center gap-1.5">
                <label className="w-6 text-text-dim shrink-0 flex items-center justify-center" title="Weight"><Baseline size={14} /></label>
                <select
                  value={textShape.fontWeight}
                  onChange={(e) => update('fontWeight' as keyof Shape, parseInt(e.target.value))}
                  className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors cursor-pointer"
                >
                  {availableWeights.map((w) => (
                    <option key={w.value} value={w.value}>{w.label} ({w.value})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <NumberField label="Font size" icon={<ALargeSmall size={14} />} value={textShape.fontSize} onChange={(v) => update('fontSize' as keyof Shape, v)} min={1} />
              <NumberField label="Line height" icon={<MoveVertical size={14} />} value={textShape.lineHeight} onChange={(v) => update('lineHeight' as keyof Shape, v)} step={0.1} min={0.5} />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <NumberField label="Letter spacing" icon={<WholeWord size={14} />} value={textShape.letterSpacing || 0} onChange={(v) => update('letterSpacing' as keyof Shape, v)} step={0.5} />
              <NumberField label="Paragraph spacing" icon={<WrapText size={14} />} value={textShape.paragraphSpacing || 0} onChange={(v) => update('paragraphSpacing' as keyof Shape, v)} step={1} />
            </div>
          </Section>

          <Section title="Style">
            <div className="flex items-center gap-0.5">
              {fontHasItalic && (
                <ToggleButton
                  active={textShape.fontStyle === 'italic'}
                  onClick={() => update('fontStyle' as keyof Shape, textShape.fontStyle === 'italic' ? 'normal' : 'italic')}
                  title="Italic"
                >
                  <Italic size={14} strokeWidth={2} />
                </ToggleButton>
              )}
              <ToggleButton
                active={textShape.textDecoration === 'underline'}
                onClick={() => update('textDecoration' as keyof Shape, textShape.textDecoration === 'underline' ? 'none' : 'underline')}
                title="Underline"
              >
                <Underline size={14} strokeWidth={2} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textDecoration === 'line-through'}
                onClick={() => update('textDecoration' as keyof Shape, textShape.textDecoration === 'line-through' ? 'none' : 'line-through')}
                title="Strikethrough"
              >
                <Strikethrough size={14} strokeWidth={2} />
              </ToggleButton>
            </div>
          </Section>

          <Section title="Alignment">
            <div className="flex items-center gap-0.5 mb-2">
              <ToggleButton
                active={textShape.textAlign === 'left'}
                onClick={() => update('textAlign' as keyof Shape, 'left')}
                title="Align left"
              >
                <AlignLeft size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textAlign === 'center'}
                onClick={() => update('textAlign' as keyof Shape, 'center')}
                title="Align center"
              >
                <AlignCenter size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textAlign === 'right'}
                onClick={() => update('textAlign' as keyof Shape, 'right')}
                title="Align right"
              >
                <AlignRight size={14} strokeWidth={1.5} />
              </ToggleButton>
              <div className="w-px h-5 bg-border mx-1" />
              <ToggleButton
                active={(textShape.verticalAlign || 'top') === 'top'}
                onClick={() => update('verticalAlign' as keyof Shape, 'top')}
                title="Align top"
              >
                <AlignVerticalJustifyStart size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={(textShape.verticalAlign || 'top') === 'middle'}
                onClick={() => update('verticalAlign' as keyof Shape, 'middle')}
                title="Align middle"
              >
                <AlignVerticalJustifyCenter size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={(textShape.verticalAlign || 'top') === 'bottom'}
                onClick={() => update('verticalAlign' as keyof Shape, 'bottom')}
                title="Align bottom"
              >
                <AlignVerticalJustifyEnd size={14} strokeWidth={1.5} />
              </ToggleButton>
            </div>
          </Section>

          <Section title="Transform">
            <div className="flex items-center gap-0.5">
              <ToggleButton
                active={!textShape.textTransform || textShape.textTransform === 'none'}
                onClick={() => update('textTransform' as keyof Shape, 'none')}
                title="None"
              >
                <CaseSensitive size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textTransform === 'uppercase'}
                onClick={() => update('textTransform' as keyof Shape, 'uppercase')}
                title="Uppercase"
              >
                <CaseUpper size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textTransform === 'lowercase'}
                onClick={() => update('textTransform' as keyof Shape, 'lowercase')}
                title="Lowercase"
              >
                <CaseLower size={14} strokeWidth={1.5} />
              </ToggleButton>
              <ToggleButton
                active={textShape.textTransform === 'capitalize'}
                onClick={() => update('textTransform' as keyof Shape, 'capitalize')}
                title="Capitalize"
              >
                <span className="text-[11px] font-semibold">Aa</span>
              </ToggleButton>
            </div>
          </Section>

        </>
      )}

      {first.type === 'rectangle' && (
        <Section title="Corners">
          <div className="w-1/2">
            <NumberField
              label="R"
              value={(first as { cornerRadius: number[] }).cornerRadius[0]}
              onChange={(v) => update('cornerRadius' as keyof Shape, [v, v, v, v])}
            />
          </div>
        </Section>
      )}

      {first.type === 'image' && (
        <Section title="Image Fit">
          <div className="flex gap-1">
            {(['cover', 'contain'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => update('objectFit', mode)}
                className={`flex-1 py-1 rounded-md text-[12px] font-medium transition-colors capitalize ${
                  ((first as ImageShape).objectFit || 'cover') === mode
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-dim hover:text-text'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </Section>
      )}

      {first.type === 'frame' && (
        <Section title="Frame">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-text-secondary">Clip content</span>
            <Switch checked={(first as FrameShape).clipContent} onChange={(v) => update('clipContent', v)} ariaLabel="Clip frame content" />
          </div>
        </Section>
      )}

      {first.type === 'frame' && <FrameRulersSection shape={first as FrameShape} update={update} />}

      <ExportSection shapes={selected} allShapes={shapes} update={update} />
    </div>
  )
}

function FrameRulersSection({ shape, update }: { shape: FrameShape; update: (key: string, value: unknown) => void }) {
  const rulers = shape.rulers || []
  const [marginInput, setMarginInput] = useState('')
  const [showMarginInput, setShowMarginInput] = useState(false)

  const addRuler = (axis: 'x' | 'y', position: number) => {
    const newRuler: FrameRuler = { id: generateId(), axis, position: Math.round(position) }
    update('rulers' as keyof Shape, [...rulers, newRuler])
  }

  const removeRuler = (id: string) => {
    update('rulers' as keyof Shape, rulers.filter((r) => r.id !== id))
  }

  const updateRulerPosition = (id: string, position: number) => {
    update('rulers' as keyof Shape, rulers.map((r) => r.id === id ? { ...r, position } : r))
  }

  const addMargins = () => {
    const inset = parseFloat(marginInput)
    if (isNaN(inset) || inset <= 0) return
    const newRulers = insetRulers(shape.width, shape.height, Math.round(inset))
    update('rulers' as keyof Shape, [...rulers, ...newRulers])
    setShowMarginInput(false)
    setMarginInput('')
  }

  return (
    <Section title="Rulers">
      <div className="flex flex-col gap-1.5">
        {rulers.map((ruler) => (
          <div key={ruler.id} className="flex items-center gap-1.5">
            <span className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${
              ruler.axis === 'x' ? 'bg-blue-500/15 text-blue-500' : 'bg-green-500/15 text-green-500'
            }`}>
              {ruler.axis === 'x' ? 'V' : 'H'}
            </span>
            <input
              type="number"
              value={Math.round(ruler.position)}
              onChange={(e) => updateRulerPosition(ruler.id, parseFloat(e.target.value) || 0)}
              className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors"
            />
            <span className="text-[11px] text-text-dim">px</span>
            <button
              onClick={() => removeRuler(ruler.id)}
              className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-red-500 transition-colors"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}

        <div className="flex gap-1 mt-1">
          <button
            onClick={() => addRuler('x', shape.width / 2)}
            className="flex-1 flex items-center justify-center gap-1 py-1 bg-bg-tertiary text-text-dim hover:text-text rounded-md text-[11px] font-medium transition-colors"
          >
            <Plus size={10} /> Vertical
          </button>
          <button
            onClick={() => addRuler('y', shape.height / 2)}
            className="flex-1 flex items-center justify-center gap-1 py-1 bg-bg-tertiary text-text-dim hover:text-text rounded-md text-[11px] font-medium transition-colors"
          >
            <Plus size={10} /> Horizontal
          </button>
        </div>

        {showMarginInput ? (
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="number"
              value={marginInput}
              onChange={(e) => setMarginInput(e.target.value)}
              placeholder="Inset (px)"
              className="flex-1 bg-bg-tertiary border border-transparent focus:border-accent rounded-md px-2 py-1 text-[13px] text-text outline-none transition-colors placeholder:text-text-dim"
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') addMargins() }}
              autoFocus
            />
            <button
              onClick={addMargins}
              className="px-2 py-1 bg-accent text-white rounded-md text-[11px] font-medium"
            >
              Add
            </button>
            <button
              onClick={() => { setShowMarginInput(false); setMarginInput('') }}
              className="px-2 py-1 bg-bg-tertiary text-text-dim rounded-md text-[11px] font-medium"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => setShowMarginInput(true)}
              className="flex-1 flex items-center justify-center gap-1 py-1 bg-bg-tertiary text-text-dim hover:text-text rounded-md text-[11px] font-medium transition-colors"
            >
              <Ruler size={10} /> Add Margins
            </button>
            {rulers.length > 0 && (
              <button
                onClick={() => update('rulers' as keyof Shape, [])}
                className="px-2 py-1 bg-bg-tertiary text-text-dim hover:text-red-500 rounded-md text-[11px] font-medium transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
