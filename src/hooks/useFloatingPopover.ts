import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

interface FloatingPopoverOptions<A extends HTMLElement, P extends HTMLElement> {
  open: boolean
  anchorRef: RefObject<A | null>
  popoverRef: RefObject<P | null>
  width: number
  estimatedHeight: number
  align?: 'start' | 'end'
  gap?: number
  viewportPadding?: number
}

interface FloatingStyle extends CSSProperties {
  top: number
  left: number
  width: number
  maxHeight: number
}

const hiddenStyle: FloatingStyle = {
  top: 0,
  left: 0,
  width: 0,
  maxHeight: 0,
  visibility: 'hidden',
}

/**
 * Positions a portaled popover within the viewport. It opens below its anchor
 * when possible, flips above when space is tighter, and shifts inward at the
 * left and right edges.
 */
export function useFloatingPopover<A extends HTMLElement, P extends HTMLElement>({
  open,
  anchorRef,
  popoverRef,
  width,
  estimatedHeight,
  align = 'start',
  gap = 6,
  viewportPadding = 8,
}: FloatingPopoverOptions<A, P>): FloatingStyle {
  const [style, setStyle] = useState<FloatingStyle>(hiddenStyle)

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const anchorRect = anchor.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const safeWidth = Math.min(width, viewportWidth - viewportPadding * 2)
    const measuredHeight = popoverRef.current?.getBoundingClientRect().height || estimatedHeight

    let left = align === 'end' ? anchorRect.right - safeWidth : anchorRect.left
    left = Math.min(
      Math.max(viewportPadding, left),
      Math.max(viewportPadding, viewportWidth - safeWidth - viewportPadding),
    )

    const spaceBelow = Math.max(0, viewportHeight - anchorRect.bottom - gap - viewportPadding)
    const spaceAbove = Math.max(0, anchorRect.top - gap - viewportPadding)
    const openBelow = spaceBelow >= measuredHeight || spaceBelow >= spaceAbove
    const maxHeight = Math.max(0, openBelow ? spaceBelow : spaceAbove)
    const visibleHeight = Math.min(measuredHeight, maxHeight)
    const top = openBelow
      ? anchorRect.bottom + gap
      : Math.max(viewportPadding, anchorRect.top - gap - visibleHeight)

    const next: FloatingStyle = {
      position: 'fixed',
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(safeWidth),
      maxHeight: Math.floor(maxHeight),
      visibility: 'visible',
    }
    setStyle((current) => (
      current.top === next.top &&
      current.left === next.left &&
      current.width === next.width &&
      current.maxHeight === next.maxHeight &&
      current.visibility === next.visibility
        ? current
        : next
    ))
  }, [align, anchorRef, estimatedHeight, gap, popoverRef, viewportPadding, width])

  useLayoutEffect(() => {
    if (!open) return

    const animationFrame = requestAnimationFrame(updatePosition)
    const observer = new ResizeObserver(updatePosition)
    if (anchorRef.current) observer.observe(anchorRef.current)
    if (popoverRef.current) observer.observe(popoverRef.current)

    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open, popoverRef, updatePosition])

  return style
}
