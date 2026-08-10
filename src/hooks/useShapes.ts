import { useState, useEffect } from 'react'
import type { Shape } from '../types/document'
import { useDocument } from './useDocument'
import { getAllShapes } from '../document/operations'

export function useShapes(): Shape[] {
  const { doc, activePageId } = useDocument()
  const [shapes, setShapes] = useState<Shape[]>([])

  useEffect(() => {
    const update = () => setShapes(getAllShapes(doc, activePageId))
    update()

    const shapesArray = doc.getArray(`page:${activePageId}:shapes`)
    shapesArray.observeDeep(update)
    return () => shapesArray.unobserveDeep(update)
  }, [doc, activePageId])

  return shapes
}
