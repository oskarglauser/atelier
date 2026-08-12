import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** Footer with action buttons — if not provided, no footer is rendered */
  footer?: React.ReactNode
  /** Max width class, default 'max-w-sm' */
  maxWidth?: string
}

export function Dialog({ open, onClose, title, children, footer, maxWidth = 'max-w-sm' }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleKeyDown])

  // Focus trap: focus the dialog when it opens
  useEffect(() => {
    if (open && dialogRef.current) {
      dialogRef.current.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`relative ${maxWidth} w-full mx-4 bg-bg-secondary rounded-2xl shadow-2xl border border-border-light/70 outline-none animate-in fade-in zoom-in-95 duration-150`}
      >
        {title && (
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <h2 className="text-[15px] font-semibold text-text">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="w-6 h-6 flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="px-5 py-4">
          {children}
        </div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Pre-styled cancel button for dialog footers */
export function DialogCancel({ onClick, children = 'Cancel' }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-text-secondary bg-bg-tertiary hover:bg-bg-hover transition-colors"
    >
      {children}
    </button>
  )
}

/** Pre-styled primary action button for dialog footers */
export function DialogAction({ onClick, children, variant = 'primary', disabled }: {
  onClick: () => void
  children: React.ReactNode
  variant?: 'primary' | 'danger'
  disabled?: boolean
}) {
  const base = 'px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-50'
  const variants = {
    primary: 'bg-accent text-white hover:bg-accent/90',
    danger: 'bg-red-500 text-white hover:bg-red-600',
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]}`}>
      {children}
    </button>
  )
}
