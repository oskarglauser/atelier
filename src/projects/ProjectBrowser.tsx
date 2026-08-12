import { useEffect, useState } from 'react'
import { useProjectStore } from './projectStore'
import { Plus, Trash2, Settings } from 'lucide-react'
import { SettingsPanel } from './SettingsPanel'
import { Dialog, DialogCancel, DialogAction } from '../ui/Dialog'

export function ProjectBrowser() {
  const { projects, loading, loadProjects, createProject, deleteProject, openProject } = useProjectStore()
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled'
    const meta = await createProject(name)
    setNewName('')
    setShowCreate(false)
    openProject(meta.id)
  }

  const handleDelete = () => {
    if (deleteTarget) {
      deleteProject(deleteTarget.id)
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg text-text-dim text-sm">
        Loading...
      </div>
    )
  }

  if (showSettings) {
    return <SettingsPanel onBack={() => setShowSettings(false)} />
  }

  return (
    <div className="h-screen bg-bg flex flex-col">
      <header className="h-14 flex items-center justify-between px-6 md:px-8 border-b border-border shrink-0 relative bg-bg/90 backdrop-blur-xl">
        <div className="w-24" />
        <div className="absolute left-1/2 -translate-x-1/2 text-[15px] text-text tracking-wide" style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400 }}>
          Atelier
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center text-text-dim hover:text-text hover:bg-bg-hover rounded-lg transition-colors"
            aria-label="Open settings"
            title="Settings"
          >
            <Settings size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-text text-bg rounded-lg text-[13px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus size={14} strokeWidth={2} />
            New
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-10 md:px-8">
        <div className="mx-auto max-w-7xl">
        {projects.length === 0 && (
          <div className="text-center py-32">
            <div className="text-2xl text-text mb-1" style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400 }}>
              Start creating
            </div>
            <div className="text-text-dim text-sm mb-8">Create your first project to begin designing</div>
            <button
              onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 mx-auto px-5 py-2 bg-text text-bg rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus size={14} strokeWidth={2} />
              New Project
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => openProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openProject(project.id)
                }
              }}
              role="button"
              tabIndex={0}
              className="bg-bg-secondary border border-border rounded-2xl overflow-hidden cursor-pointer hover:border-border-light hover:-translate-y-0.5 hover:shadow-xl focus-visible:border-accent transition-all duration-200 group"
            >
              <div className="aspect-[4/3] bg-bg-tertiary/70 flex items-center justify-center text-text-dim overflow-hidden border-b border-border">
                {project.thumbnail ? (
                  <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-text-dim uppercase tracking-widest">Empty</span>
                )}
              </div>
              <div className="px-4 py-3.5 flex items-center justify-between">
                <div>
                  <div className="text-[13px] text-text font-medium">{project.name}</div>
                  <div className="text-[11px] text-text-dim mt-0.5">
                    {new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget({ id: project.id, name: project.name })
                  }}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-danger p-1 transition-opacity"
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        </div>
      </main>
      <footer className="py-4 flex items-center justify-center gap-2 text-[10px] text-text-dim/50 tracking-wide shrink-0">
        <a href="https://glauser.com" target="_blank" rel="noopener noreferrer" className="hover:text-text-dim transition-colors">
          Made by Glauser Creative
        </a>
        <span aria-hidden>·</span>
        <span>v{__APP_VERSION__}</span>
      </footer>

      {/* Create Project Dialog */}
      <Dialog
        open={showCreate}
        onClose={() => { setShowCreate(false); setNewName('') }}
        title="New Project"
        footer={
          <>
            <DialogCancel onClick={() => { setShowCreate(false); setNewName('') }} />
            <DialogAction onClick={handleCreate}>Create</DialogAction>
          </>
        }
      >
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
          }}
          placeholder="Project name..."
          className="w-full bg-bg-tertiary border border-border rounded-lg px-4 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors"
        />
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
        footer={
          <>
            <DialogCancel onClick={() => setDeleteTarget(null)} />
            <DialogAction onClick={handleDelete} variant="danger">Delete</DialogAction>
          </>
        }
      >
        <p className="text-[13px] text-text-secondary">
          Are you sure you want to delete <span className="font-medium text-text">{deleteTarget?.name}</span>? This action cannot be undone.
        </p>
      </Dialog>
    </div>
  )
}
