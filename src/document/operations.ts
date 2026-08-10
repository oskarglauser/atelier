import * as Y from 'yjs'
import type { Shape, ShapeType } from '../types/document'
import { createShapeData } from './schema'
import { getShapesArray } from './createDoc'

/** Keys whose values are object arrays stored as JSON strings in Yjs */
const OBJECT_ARRAY_KEYS = new Set(['rulers', 'exports'])

function setYMapValue(map: Y.Map<unknown>, key: string, value: unknown) {
  if (Array.isArray(value)) {
    if (OBJECT_ARRAY_KEYS.has(key)) {
      map.set(key, JSON.stringify(value))
    } else {
      const arr = new Y.Array()
      arr.push(value)
      map.set(key, arr)
    }
  } else {
    map.set(key, value)
  }
}

function shapeToYMap(shape: Shape): Y.Map<unknown> {
  const map = new Y.Map()
  for (const [key, value] of Object.entries(shape)) {
    setYMapValue(map, key, value)
  }
  return map
}

export function yMapToShape(map: Y.Map<unknown>): Shape {
  const obj: Record<string, unknown> = {}
  map.forEach((value, key) => {
    if (value instanceof Y.Array) {
      obj[key] = value.toArray()
    } else if (OBJECT_ARRAY_KEYS.has(key) && typeof value === 'string') {
      try {
        obj[key] = JSON.parse(value)
      } catch {
        obj[key] = value
      }
    } else {
      obj[key] = value
    }
  })
  return obj as unknown as Shape
}

export function addShape(doc: Y.Doc, pageId: string, type: ShapeType, overrides: Partial<Shape> = {}, _origin = 'local'): Shape {
  const shapes = getShapesArray(doc, pageId)
  const shape = createShapeData(type, overrides)
  doc.transact(() => {
    shapes.push([shapeToYMap(shape)])
  }, _origin)
  return shape
}

export function updateShape(doc: Y.Doc, pageId: string, id: string, updates: Partial<Shape>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (map.get('id') === id) {
        for (const [key, value] of Object.entries(updates)) {
          setYMapValue(map, key, value)
        }
        break
      }
    }
  }, _origin)
}

export function deleteShapes(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  // Expand ids to include children of any groups/frames being deleted (single pass)
  const parentToChildren = new Map<string, string[]>()
  for (let i = 0; i < shapes.length; i++) {
    const map = shapes.get(i) as Y.Map<unknown>
    const parentId = map.get('parentId') as string | null
    if (parentId) {
      let children = parentToChildren.get(parentId)
      if (!children) { children = []; parentToChildren.set(parentId, children) }
      children.push(map.get('id') as string)
    }
  }
  const allIds = new Set(ids)
  const queue = [...ids]
  while (queue.length > 0) {
    const children = parentToChildren.get(queue.pop()!)
    if (children) {
      for (const childId of children) {
        if (!allIds.has(childId)) { allIds.add(childId); queue.push(childId) }
      }
    }
  }
  doc.transact(() => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (allIds.has(map.get('id') as string)) {
        shapes.delete(i, 1)
      }
    }
  }, _origin)
}

export function reorderShape(doc: Y.Doc, pageId: string, id: string, newIndex: number, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    let oldIndex = -1
    let shapeData: Shape | null = null
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (map.get('id') === id) {
        oldIndex = i
        shapeData = yMapToShape(map)
        break
      }
    }
    if (oldIndex === -1 || !shapeData) return
    shapes.delete(oldIndex, 1)
    const adjustedIndex = newIndex > oldIndex ? newIndex - 1 : newIndex
    shapes.insert(Math.min(adjustedIndex, shapes.length), [shapeToYMap(shapeData)])
  }, _origin)
}

export function duplicateShapes(doc: Y.Doc, pageId: string, ids: Set<string>, offset = 10, _origin = 'local'): string[] {
  const shapes = getShapesArray(doc, pageId)
  const newIds: string[] = []
  doc.transact(() => {
    const toInsert: { index: number; map: Y.Map<unknown> }[] = []
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        const original = yMapToShape(map)
        const duplicate = createShapeData(original.type, {
          ...original,
          x: original.x + offset,
          y: original.y + offset,
        } as Partial<Shape>)
        newIds.push(duplicate.id)
        toInsert.push({ index: i, map: shapeToYMap(duplicate) })
      }
    }
    // Insert in reverse order so indices stay valid
    for (let j = toInsert.length - 1; j >= 0; j--) {
      shapes.insert(toInsert[j].index + 1, [toInsert[j].map])
    }
  }, _origin)
  return newIds
}

export function getAllShapes(doc: Y.Doc, pageId: string): Shape[] {
  const shapes = getShapesArray(doc, pageId)
  const result: Shape[] = []
  for (let i = 0; i < shapes.length; i++) {
    result.push(yMapToShape(shapes.get(i) as Y.Map<unknown>))
  }
  return result
}

// --- Group / Ungroup ---

export function groupShapes(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local'): string {
  const allShapes = getAllShapes(doc, pageId)
  const selected = allShapes.filter((s) => ids.has(s.id))
  if (selected.length < 2) return ''

  const minX = Math.min(...selected.map((s) => s.x))
  const minY = Math.min(...selected.map((s) => s.y))
  const maxX = Math.max(...selected.map((s) => s.x + s.width))
  const maxY = Math.max(...selected.map((s) => s.y + s.height))

  const group = createShapeData('group', {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    fill: '',
    stroke: '',
    strokeWidth: 0,
  })

  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    // Set parentId on children
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        map.set('parentId', group.id)
      }
    }
    // Add group shape
    shapes.push([shapeToYMap(group)])
  }, _origin)

  return group.id
}

export function ungroupShapes(doc: Y.Doc, pageId: string, groupIds: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    // Remove parentId from children
    for (let i = 0; i < shapes.length; i++) {
      const map = shapes.get(i) as Y.Map<unknown>
      const parentId = map.get('parentId') as string | null
      if (parentId && groupIds.has(parentId)) {
        map.set('parentId', null)
      }
    }
    // Delete group shapes
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (groupIds.has(map.get('id') as string) && map.get('type') === 'group') {
        shapes.delete(i, 1)
      }
    }
  }, _origin)
}

// --- Bring to front / Send to back ---

export function bringToFront(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    const toMove: Shape[] = []
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        toMove.push(yMapToShape(map))
        shapes.delete(i, 1)
      }
    }
    toMove.reverse().forEach((s) => shapes.push([shapeToYMap(s)]))
  }, _origin)
}

export function sendToBack(doc: Y.Doc, pageId: string, ids: Set<string>, _origin = 'local') {
  const shapes = getShapesArray(doc, pageId)
  doc.transact(() => {
    const toMove: Shape[] = []
    for (let i = shapes.length - 1; i >= 0; i--) {
      const map = shapes.get(i) as Y.Map<unknown>
      if (ids.has(map.get('id') as string)) {
        toMove.push(yMapToShape(map))
        shapes.delete(i, 1)
      }
    }
    toMove.forEach((s) => shapes.insert(0, [shapeToYMap(s)]))
  }, _origin)
}
