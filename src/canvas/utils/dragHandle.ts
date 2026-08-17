import Konva from 'konva'

/**
 * Whether `node` or any ancestor below the stage is draggable.
 *
 * The hit node is often not the draggable one — a frame's background Rect sits
 * inside the draggable Group — so testing the target alone misjudges whether a
 * pointerdown can start a shape drag. Locked shapes still hit-test (only
 * `draggable` is cleared), so they correctly report false here.
 */
export function hasDraggableAncestor(node: Konva.Node | null | undefined): boolean {
  const stage = node?.getStage() ?? null
  for (let n: Konva.Node | null = node ?? null; n && n !== stage; n = n.getParent()) {
    if (n.draggable()) return true
  }
  return false
}

/**
 * Arm a Konva drag on `node` from a pointerdown that landed on a *different*
 * node — a frame's title label is a sibling of the frame Group, not a child,
 * so it never triggers the Group's own drag binding.
 *
 * Registers the drag in the 'ready' state instead of calling startDrag().
 * startDrag() fires 'dragstart' immediately and bypasses dragDistance, so a
 * plain click would open a full gesture and SelectionOverlay's dragend would
 * commit a zero-delta Yjs transaction — an empty undo step on every click.
 * In 'ready' state Konva applies its own threshold in DD._drag and only fires
 * 'dragstart' once the pointer actually moves, so clicks and double-clicks
 * (rename) stay inert.
 *
 * Konva binds DD._drag / DD._endDragBefore on window, so once armed the whole
 * gesture — threshold, dragstart/move/end, pointer leaving the canvas, and
 * cleanup — is handled natively. Mirrors the guards in Node._listenDrag.
 *
 * @returns whether a drag was armed
 */
export function armDragFromHandle(
  node: Konva.Node | null | undefined,
  e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>
): boolean {
  if (!node || !node.draggable() || !node.getStage()) return false

  // Left/middle only, matching Konva.dragButtons
  const button = (e.evt as MouseEvent).button
  if (button !== undefined && !Konva.dragButtons.includes(button)) return false

  if (node.isDragging()) return false

  // A descendant already mid-gesture owns the drag
  let hasDraggingChild = false
  Konva.DD._dragElements.forEach((elem) => {
    if (node.isAncestorOf(elem.node)) hasDraggingChild = true
  })
  if (hasDraggingChild) return false

  node._createDragElement(e)
  return true
}
