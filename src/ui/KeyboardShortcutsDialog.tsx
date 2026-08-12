import { Dialog } from './Dialog'
import { useUIStore } from '../store/uiStore'

interface Shortcut {
  label: string
  keys: string[]
  note?: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

const groups: ShortcutGroup[] = [
  {
    title: 'Tools',
    shortcuts: [
      { label: 'Select', keys: ['V'] },
      { label: 'Frame', keys: ['F'] },
      { label: 'Rectangle', keys: ['R'] },
      { label: 'Ellipse', keys: ['O'], note: 'E also works' },
      { label: 'Line', keys: ['L'] },
      { label: 'Pen', keys: ['P'] },
      { label: 'Draw', keys: ['B'], note: 'D also works' },
      { label: 'Text', keys: ['T'] },
      { label: 'Image', keys: ['I'] },
      { label: 'Pan canvas', keys: ['Space', 'Drag'] },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { label: 'Undo', keys: ['Mod', 'Z'] },
      { label: 'Redo', keys: ['Mod', 'Shift', 'Z'] },
      { label: 'Copy', keys: ['Mod', 'C'] },
      { label: 'Cut', keys: ['Mod', 'X'] },
      { label: 'Paste', keys: ['Mod', 'V'] },
      { label: 'Duplicate', keys: ['Mod', 'D'] },
      { label: 'Select all', keys: ['Mod', 'A'] },
      { label: 'Delete selection', keys: ['Delete'] },
      { label: 'Deselect', keys: ['Esc'] },
    ],
  },
  {
    title: 'Arrange',
    shortcuts: [
      { label: 'Nudge', keys: ['Arrow keys'] },
      { label: 'Nudge 10 px', keys: ['Shift', 'Arrow keys'] },
      { label: 'Group', keys: ['Mod', 'G'] },
      { label: 'Ungroup', keys: ['Mod', 'Shift', 'G'] },
      { label: 'Bring to front', keys: ['Mod', 'Shift', ']'] },
      { label: 'Send to back', keys: ['Mod', 'Shift', '['] },
      { label: 'Lock or unlock', keys: ['Mod', 'Shift', 'L'] },
      { label: 'Hide or show', keys: ['Mod', 'Shift', 'H'] },
      { label: 'Outline text', keys: ['Mod', 'Shift', 'O'] },
    ],
  },
  {
    title: 'Type',
    shortcuts: [
      { label: 'Bold', keys: ['Mod', 'B'] },
      { label: 'Italic', keys: ['Mod', 'I'] },
      { label: 'Underline', keys: ['Mod', 'U'] },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { label: 'Zoom in', keys: ['+'] },
      { label: 'Zoom out', keys: ['−'] },
      { label: 'Fit all', keys: ['Shift', '1'] },
      { label: 'Zoom to selection', keys: ['Shift', '2'] },
      { label: 'Actual size', keys: ['Shift', '0'] },
      { label: 'Keyboard shortcuts', keys: ['?'] },
    ],
  },
]

function ShortcutKeys({ keys }: { keys: string[] }) {
  const modifier = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl'

  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="min-w-5 rounded-md border border-border-light bg-bg-tertiary px-1.5 py-0.5 text-center font-sans text-[10px] font-medium leading-4 text-text-secondary shadow-sm"
        >
          {key === 'Mod' ? modifier : key}
        </kbd>
      ))}
    </span>
  )
}

export function KeyboardShortcutsDialog() {
  const open = useUIStore((state) => state.isShortcutHelpOpen)
  const setOpen = useUIStore((state) => state.setShortcutHelpOpen)

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" maxWidth="max-w-2xl">
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-dim">
                {group.title}
              </h3>
              <div className="space-y-0.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.label}
                    className="flex min-h-7 items-center justify-between gap-3 rounded-md px-1.5 py-1 hover:bg-bg-hover/70"
                  >
                    <span className="min-w-0 text-[12px] text-text-secondary">
                      {shortcut.label}
                      {shortcut.note && <span className="ml-1.5 text-[10px] text-text-dim">{shortcut.note}</span>}
                    </span>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
