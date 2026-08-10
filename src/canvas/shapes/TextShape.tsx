import { Text, Group, Rect } from 'react-konva'
import type { TextShape as TextShapeType } from '../../types/document'
import { useUIStore } from '../../store/uiStore'
import { memo, useEffect, useMemo } from 'react'
import { loadGoogleFont } from '../../fonts/fontLoader'

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

function measureCharWidths(text: string, fontFamily: string, fontSize: number, fontWeight: number, fontStyle: string): number[] {
  if (!measureCanvas) return text.split('').map(() => fontSize * 0.6)
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.split('').map(() => fontSize * 0.6)
  const style = fontStyle === 'italic' ? 'italic ' : ''
  ctx.font = `${style}${fontWeight} ${fontSize}px ${fontFamily}`
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

  const displayText = useMemo(
    () => applyTextTransform(shape.text, shape.textTransform || 'none'),
    [shape.text, shape.textTransform]
  )

  const fontStyleStr = [
    shape.fontStyle === 'italic' ? 'italic' : '',
    shape.fontWeight !== 400 ? String(shape.fontWeight) : '',
  ].filter(Boolean).join(' ') || 'normal'

  const kerning = useMemo(() => shape.kerning || [], [shape.kerning])
  const hasKerning = kerning.length > 0 && kerning.some((k) => k !== 0)

  const charPositions = useMemo(() => {
    if (!hasKerning) return []
    const chars = displayText.split('')
    const widths = measureCharWidths(displayText, shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle)
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
  }, [hasKerning, displayText, shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.letterSpacing, kerning, shape.textAlign, shape.width])

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
