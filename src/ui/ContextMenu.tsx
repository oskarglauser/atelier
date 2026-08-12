import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  shortcut?: string
  action?: () => void
  children?: MenuEntry[]
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
  const [submenu, setSubmenu] = useState<{ index: number; left: number; top: number } | null>(null)

  const showSubmenu = (index: number, button: HTMLButtonElement, children: MenuEntry[]) => {
    const rect = button.getBoundingClientRect()
    const width = 210
    const estimatedHeight = children.reduce(
      (height, child) => height + ('divider' in child ? 9 : 32),
      12,
    )
    const left = rect.right + width + 4 > window.innerWidth
      ? rect.left - width - 4
      : rect.right + 4
    const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - estimatedHeight - 8))
    setSubmenu({ index, left, top })
  }

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('[data-context-submenu]')) return
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
    const nextLeft = Math.max(8, Math.min(x, vw - rect.width - 8))
    const nextTop = Math.max(8, Math.min(y, vh - rect.height - 8))
    ref.current.style.left = `${nextLeft}px`
    ref.current.style.top = `${nextTop}px`
  }, [x, y])

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[200] max-h-[calc(100vh-16px)] min-w-[190px] overflow-y-auto rounded-xl border border-border-light/70 bg-bg-secondary/95 py-1.5 shadow-2xl backdrop-blur-xl"
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
            role="menuitem"
            disabled={item.disabled}
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? submenu?.index === i : undefined}
            onMouseEnter={(event) => {
              if (!item.children) {
                setSubmenu(null)
                return
              }
              showSubmenu(i, event.currentTarget, item.children)
            }}
            onFocus={(event) => {
              if (item.children) showSubmenu(i, event.currentTarget, item.children)
              else setSubmenu(null)
            }}
            onClick={(event) => {
              if (item.children) {
                showSubmenu(i, event.currentTarget, item.children)
                return
              }
              item.action?.()
              onClose()
            }}
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
            {item.children && <ChevronRight size={13} strokeWidth={1.5} className="ml-2 text-text-dim" />}
          </button>
        )
      })}
      {submenu && createPortal((() => {
        const parent = items[submenu.index]
        if ('divider' in parent || !parent.children) return null
        return (
          <div
            role="menu"
            data-context-submenu
            className="fixed z-[201] max-h-[calc(100vh-16px)] w-[210px] overflow-y-auto rounded-xl border border-border-light/70 bg-bg-secondary/95 py-1.5 shadow-2xl backdrop-blur-xl"
            style={{ left: submenu.left, top: submenu.top }}
          >
            {parent.children.map((child, childIndex) => {
              if ('divider' in child) {
                return <div key={childIndex} className="my-1 h-px bg-border" />
              }
              const ChildIcon = child.icon
              return (
                <button
                  key={childIndex}
                  role="menuitem"
                  disabled={child.disabled}
                  onClick={() => {
                    child.action?.()
                    onClose()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-bg-hover disabled:pointer-events-none disabled:opacity-30"
                >
                  {ChildIcon && <ChildIcon size={14} strokeWidth={1.5} className="opacity-60" />}
                  <span className="flex-1 text-left">{child.label}</span>
                  {child.shortcut && <span className="ml-4 text-[11px] text-text-dim">{child.shortcut}</span>}
                </button>
              )
            })}
          </div>
        )
      })(), document.body)}
    </div>
  )
}
