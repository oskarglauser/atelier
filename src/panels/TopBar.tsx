import { useState, useRef, useEffect } from 'react'
import { useHistoryStore } from '../store/historyStore'
import { useProjectStore } from '../projects/projectStore'
import { getStageRef } from '../store/stageRef'
import { captureThumbnail } from '../canvas/captureThumbnail'
import { useUIStore } from '../store/uiStore'
import { KeyboardShortcutsDialog } from '../ui/KeyboardShortcutsDialog'
import { Undo2, Redo2, ChevronLeft, ChevronDown, Plus, Keyboard, Settings } from 'lucide-react'

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { canUndo, canRedo, undo, redo } = useHistoryStore()
  const rawCloseProject = useProjectStore((s) => s.closeProject)
  const saveThumbnail = useProjectStore((s) => s.saveThumbnail)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  const openProject = useProjectStore((s) => s.openProject)
  const createProject = useProjectStore((s) => s.createProject)
  const setShortcutHelpOpen = useUIStore((s) => s.setShortcutHelpOpen)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeProject = projects.find((p) => p.id === activeProjectId)

  const closeProject = () => {
    const stage = getStageRef()
    if (stage && activeProjectId) {
      const thumb = captureThumbnail(stage)
      if (thumb) saveThumbnail(activeProjectId, thumb)
    }
    rawCloseProject()
  }

  const closeDropdown = () => {
    setDropdownOpen(false)
    setIsCreating(false)
    setNewName('')
  }

  const switchProject = (id: string) => {
    if (id === activeProjectId) {
      closeDropdown()
      return
    }
    const stage = getStageRef()
    if (stage && activeProjectId) {
      const thumb = captureThumbnail(stage)
      if (thumb) saveThumbnail(activeProjectId, thumb)
    }
    openProject(id)
    closeDropdown()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const stage = getStageRef()
    if (stage && activeProjectId) {
      const thumb = captureThumbnail(stage)
      if (thumb) saveThumbnail(activeProjectId, thumb)
    }
    const project = await createProject(name)
    openProject(project.id)
    closeDropdown()
  }

  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isCreating])

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
        setIsCreating(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  return (
    <div className="h-11 bg-bg border-b border-border flex items-center px-3 shrink-0 relative">
      <button
        onClick={closeProject}
        className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover rounded-md transition-colors"
        title="Back to projects"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </button>

      <div className="relative ml-1" ref={dropdownRef}>
        <button
          onClick={() => (dropdownOpen ? closeDropdown() : setDropdownOpen(true))}
          className="flex items-center gap-1 px-2 h-7 rounded-md text-sm text-text hover:bg-bg-hover transition-colors"
        >
          <span className="truncate max-w-48">{activeProject?.name || 'Untitled'}</span>
          <ChevronDown size={12} strokeWidth={1.5} className="text-text-dim shrink-0" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-bg border border-border rounded-lg shadow-lg py-1 z-50">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => switchProject(p.id)}
                className={`w-full text-left px-3 py-1.5 text-sm truncate transition-colors ${
                  p.id === activeProjectId
                    ? 'text-text bg-bg-hover'
                    : 'text-text-secondary hover:text-text hover:bg-bg-hover'
                }`}
              >
                {p.name}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              {isCreating ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleCreate() }}
                  className="px-2 py-1"
                >
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setIsCreating(false) }}
                    placeholder="Project name..."
                    className="w-full px-2 py-1 text-sm bg-bg-hover border border-border rounded-md outline-none text-text placeholder:text-text-dim focus:border-accent"
                  />
                </form>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-bg-hover transition-colors flex items-center gap-2"
                >
                  <Plus size={14} strokeWidth={1.5} />
                  New project
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1" />
      <div className="absolute left-1/2 -translate-x-1/2 text-[15px] text-text tracking-wide pointer-events-none" style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400 }}>
        Atelier
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onOpenSettings}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setShortcutHelpOpen(true)}
          className="mr-1 flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          aria-label="Open keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={undo}
          disabled={!canUndo}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-bg-hover disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Undo (⌘Z)"
        >
          <Undo2 size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-bg-hover disabled:opacity-25 disabled:pointer-events-none transition-colors"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 size={14} strokeWidth={1.5} />
        </button>
      </div>
      <KeyboardShortcutsDialog />
    </div>
  )
}
