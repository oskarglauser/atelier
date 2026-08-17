import { Text, Group, Rect } from 'react-konva'
import type { TextShape as TextShapeType } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useEffect, useMemo, useState } from 'react'
import { loadGoogleFont } from '../../fonts/fontLoader'
import { applyWrapStyle, makeKonvaMeasure } from '../../utils/textWrap'

interface Props {
  shape: TextShapeType
  onSelect: (id: string, e: MouseEvent) => void
}

function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase': return text.toUpperCase()
    case 'lowercase': return text.toLowerCase()
    case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase())
    default: return text
  }
}

const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

function measureCharWidths(text: string, fontFamily: string, fontSize: number, fontWeight: number, fontStyle: string, fontVariant: string): number[] {
  if (!measureCanvas) return text.split('').map(() => fontSize * 0.6)
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.split('').map(() => fontSize * 0.6)
  const style = fontStyle === 'italic' ? 'italic ' : ''
  ctx.font = `${style}${fontVariant} ${fontWeight} ${fontSize}px ${fontFamily}`
  return text.split('').map((char) => ctx.measureText(char).width)
}

export const TextShapeComponent = memo(function TextShapeComponent({ shape, onSelect }: Props) {
  const setHoveredId = useUIStore((s) => s.setHoveredId)
  const setEditingTextId = useUIStore((s) => s.setEditingTextId)
  const editingTextId = useUIStore((s) => s.editingTextId)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)

  const isEditing = editingTextId === shape.id

  useEffect(() => {
    loadGoogleFont(shape.fontFamily)
  }, [shape.fontFamily])

  const kerning = useMemo(() => shape.kerning || [], [shape.kerning])
  const hasKerning = kerning.length > 0 && kerning.some((k) => k !== 0)
  // Wrap styles pre-break text for Konva's line layout; the kerning branch is
  // a custom single-baseline layout with no concept of lines, so it renders
  // raw (transformed) text and ignores wrap entirely.
  const needsMeasurement = shape.textWrap !== 'auto' || hasKerning

  // Measurement runs against whatever font is loaded at render time; a web
  // font arriving later changes every width, so re-measure on load. Gated —
  // plain auto-wrap shapes never measure and skip the subscription.
  const [fontEpoch, setFontEpoch] = useState(0)
  useEffect(() => {
    if (!needsMeasurement) return
    const fonts = document.fonts
    if (!fonts?.addEventListener) return
    const onDone = () => setFontEpoch((e) => e + 1)
    fonts.addEventListener('loadingdone', onDone)
    return () => fonts.removeEventListener('loadingdone', onDone)
  }, [needsMeasurement])

  const fontStyleStr = [
    shape.fontStyle === 'italic' ? 'italic' : '',
    shape.fontWeight !== 400 ? String(shape.fontWeight) : '',
  ].filter(Boolean).join(' ') || 'normal'

  const displayText = useMemo(() => {
    const transformed = applyTextTransform(shape.text, shape.textTransform || 'none')
    if (shape.textWrap === 'auto' || hasKerning) return transformed
    // Balance/pretty pre-break the text; measurement mirrors Konva's, so the
    // explicit newlines are exactly where Konva would be free not to re-wrap.
    const measure = makeKonvaMeasure({
      fontFamily: shape.fontFamily,
      fontSize: shape.fontSize,
      fontStyle: fontStyleStr,
      fontVariant: shape.fontVariant,
      letterSpacing: shape.letterSpacing || 0,
    })
    return applyWrapStyle(transformed, shape.textWrap, shape.width, measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontEpoch forces re-measure after web fonts load
  }, [shape.text, shape.textTransform, shape.textWrap, hasKerning, shape.fontFamily, shape.fontSize, fontStyleStr, shape.fontVariant, shape.letterSpacing, shape.width, fontEpoch])

  const charPositions = useMemo(() => {
    if (!hasKerning) return []
    const chars = displayText.split('')
    const widths = measureCharWidths(displayText, shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.fontVariant)
    const baseSpacing = shape.letterSpacing || 0
    const positions: number[] = []
    let x = 0
    for (let i = 0; i < chars.length; i++) {
      positions.push(x)
      x += widths[i] + baseSpacing + (kerning[i] || 0)
    }
    // Apply text alignment offset
    const totalWidth = x
    if (shape.textAlign === 'center') {
      const offset = (shape.width - totalWidth) / 2
      return positions.map((p) => p + offset)
    }
    if (shape.textAlign === 'right') {
      const offset = shape.width - totalWidth
      return positions.map((p) => p + offset)
    }
    return positions
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontEpoch forces re-measure after web fonts load
  }, [hasKerning, displayText, shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.fontVariant, shape.letterSpacing, kerning, shape.textAlign, shape.width, fontEpoch])

  const commonHandlers = {
    onMouseDown: (e: { evt: MouseEvent }) => onSelect(shape.id, e.evt),
    onDblClick: () => { setSelectedIds(new Set([shape.id])); setEditingTextId(shape.id) },
    onDblTap: () => { setSelectedIds(new Set([shape.id])); setEditingTextId(shape.id) },
    onMouseEnter: () => setHoveredId(shape.id),
    onMouseLeave: () => setHoveredId(null),
  }

  if (hasKerning) {
    const chars = displayText.split('')

    return (
      <Group
        id={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation}
        opacity={isEditing ? 0 : shape.opacity}
        visible={shape.visible}
        draggable={!shape.locked && !isEditing}
        onDragEnd={() => {}}
        {...commonHandlers}
      >
        <Rect width={shape.width} height={shape.height} fill="transparent" listening={true} />
        {chars.map((char, i) => (
          <Text
            key={i}
            x={charPositions[i] || 0}
            y={0}
            text={char}
            fontSize={shape.fontSize}
            fontFamily={shape.fontFamily}
            fontStyle={fontStyleStr}
            fontVariant={shape.fontVariant}
            lineHeight={shape.lineHeight}
            textDecoration={shape.textDecoration === 'none' ? '' : (shape.textDecoration || '')}
            fill={shape.fill || '#ffffff'}
            stroke={shape.stroke || ''}
            strokeWidth={shape.strokeWidth || 0}
            listening={false}
          />
        ))}
      </Group>
    )
  }

  return (
    <Text
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      text={displayText}
      fontSize={shape.fontSize}
      fontFamily={shape.fontFamily}
      fontStyle={fontStyleStr}
      fontVariant={shape.fontVariant}
      align={shape.textAlign}
      verticalAlign={shape.verticalAlign || 'top'}
      lineHeight={shape.lineHeight}
      letterSpacing={shape.letterSpacing || 0}
      textDecoration={shape.textDecoration === 'none' ? '' : (shape.textDecoration || '')}
      fill={shape.fill || '#ffffff'}
      stroke={shape.stroke || ''}
      strokeWidth={shape.strokeWidth || 0}
      rotation={shape.rotation}
      opacity={isEditing ? 0 : shape.opacity}
      visible={shape.visible}
      draggable={!shape.locked && !isEditing}
      onDragEnd={() => {}}
      {...commonHandlers}
    />
  )
})
