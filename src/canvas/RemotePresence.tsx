import { Group, Rect, Path, Text, Label, Tag } from 'react-konva'
import { useViewportStore } from '../store/viewportStore'
import { useShapes } from '../hooks/useShapes'
import { useRemotePeers } from '../collab/usePresence'

/** Standard arrow pointer, drawn from its tip at (0,0). */
const CURSOR_PATH = 'M0 0 L0 14.5 L3.6 11.2 L6.1 16.4 L8.5 15.2 L6 10.2 L10.8 10.2 Z'

/**
 * Other people's cursors and selections, drawn in the overlay layer.
 *
 * Everything here lives inside the zoomed stage, so sizes are divided by zoom
 * to stay a constant on-screen size — same compensation the other overlays use.
 * Nothing listens for pointer events: presence must never be selectable or
 * block a click on the artwork underneath.
 */
export function RemotePresence() {
  const peers = useRemotePeers()
  const zoom = useViewportStore((s) => s.zoom)
  const shapes = useShapes()

  if (peers.length === 0) return null

  return (
    <>
      {peers.map((peer) => {
        const selected = peer.selectedIds
          .map((id) => shapes.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => Boolean(s))

        return (
          <Group key={peer.clientId} listening={false}>
            {selected.map((shape) => (
              <Rect
                key={shape.id}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rotation={shape.rotation}
                stroke={peer.user.color}
                strokeWidth={1.5 / zoom}
                listening={false}
              />
            ))}

            {peer.cursor && (
              <Group x={peer.cursor.x} y={peer.cursor.y} listening={false}>
                <Path
                  data={CURSOR_PATH}
                  fill={peer.user.color}
                  stroke="#ffffff"
                  strokeWidth={1 / zoom}
                  scaleX={1 / zoom}
                  scaleY={1 / zoom}
                  listening={false}
                />
                <Label x={12 / zoom} y={16 / zoom} listening={false}>
                  <Tag fill={peer.user.color} cornerRadius={3 / zoom} listening={false} />
                  <Text
                    text={peer.user.name}
                    fontSize={11 / zoom}
                    padding={4 / zoom}
                    fill="#ffffff"
                    listening={false}
                  />
                </Label>
              </Group>
            )}
          </Group>
        )
      })}
    </>
  )
}
