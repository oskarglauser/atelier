import { Rect } from 'react-konva'
import { memo } from 'react'

interface Props {
  box: { x: number; y: number; width: number; height: number } | null
}

export const SelectionBox = memo(function SelectionBox({ box }: Props) {
  if (!box) return null
  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.width}
      height={box.height}
      fill="rgba(74, 158, 255, 0.1)"
      stroke="#4a9eff"
      strokeWidth={1}
      listening={false}
    />
  )
})
