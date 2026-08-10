import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  shortcut?: string
  action: () => void
  danger?: boolean
  disabled?: boolean
}

export interface MenuDivider {
  divider: true
}

export type MenuEntry = MenuItem | MenuDivider

interface Props {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) ref.current.style.left = `${x - rect.width}px`
    if (rect.bottom > vh) ref.current.style.top = `${y - rect.height}px`
  }, [x, y])

  return (
    <div
      ref={ref}
      className="fixed bg-bg-secondary border border-border rounded-lg shadow-2xl py-1 min-w-[180px] z-[200]"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => {
        if ('divider' in item) {
          return <div key={i} className="h-px bg-border my-1" />
        }
        const Icon = item.icon
        return (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => { item.action(); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors disabled:opacity-30 disabled:pointer-events-none ${
              item.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-text hover:bg-bg-hover'
            }`}
          >
            {Icon && <Icon size={14} strokeWidth={1.5} className="opacity-60" />}
            <span className="flex-1 text-left">{item.label}</span>
            {item.shortcut && (
              <span className="text-[11px] text-text-dim ml-4">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
