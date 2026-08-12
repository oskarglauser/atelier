import { useUIStore } from '../store/uiStore'
import type { ToolType } from '../types/tools'
import {
  MousePointer2, Frame, Square, Circle, Minus, PenTool, Brush, Type, Image,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const tools: Array<{ type: ToolType; label: string; shortcut: string; Icon: LucideIcon }> = [
  { type: 'select', label: 'Select', shortcut: 'V', Icon: MousePointer2 },
  { type: 'frame', label: 'Frame', shortcut: 'F', Icon: Frame },
  { type: 'rectangle', label: 'Rectangle', shortcut: 'R', Icon: Square },
  { type: 'ellipse', label: 'Ellipse', shortcut: 'O', Icon: Circle },
  { type: 'line', label: 'Line', shortcut: 'L', Icon: Minus },
  { type: 'pen', label: 'Pen', shortcut: 'P', Icon: PenTool },
  { type: 'freehand', label: 'Draw', shortcut: 'B', Icon: Brush },
  { type: 'text', label: 'Text', shortcut: 'T', Icon: Type },
  { type: 'image', label: 'Image', shortcut: 'I', Icon: Image },
]

export function Toolbar() {
  const { activeTool, setActiveTool } = useUIStore()

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 bg-bg-secondary/90 backdrop-blur-xl border border-border-light/70 rounded-xl px-1 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      {tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => setActiveTool(tool.type)}
          aria-label={`${tool.label} tool`}
          aria-pressed={activeTool === tool.type}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            activeTool === tool.type
              ? 'bg-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text hover:bg-bg-hover'
          }`}
          title={`${tool.label} (${tool.shortcut})`}
        >
          <tool.Icon size={16} strokeWidth={activeTool === tool.type ? 2 : 1.5} />
        </button>
      ))}
    </div>
  )
}
