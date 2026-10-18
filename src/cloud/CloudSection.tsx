import { useState } from 'react'
import { Cloud, LogOut, Plus, Users } from 'lucide-react'
import { Dialog, DialogAction, DialogCancel } from '../ui/Dialog'
import { signOut } from './authClient'
import { openCloudDocument } from './route'
import { SignIn } from './SignIn'
import { useCloudDocuments } from './useCloudDocuments'

/**
 * Cloud documents, shown above the local projects when signed in.
 *
 * Signed out it is a single line offering to sign in, and nothing about the
 * projects below it changes — which is the whole point: the hosted version is
 * something you opt into, not something that happens to your work.
 */
export function CloudSection() {
  const { signedIn, checkingSession, email, documents, loaded, error, refresh, create } =
    useCloudDocuments()
  const [showSignIn, setShowSignIn] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')

  if (checkingSession) return null

  const handleCreate = async () => {
    const id = await create(title.trim() || 'Untitled')
    setTitle('')
    setShowCreate(false)
    openCloudDocument(id)
  }

  if (!signedIn) {
    return (
      <>
        <div className="mb-10 flex items-center justify-between rounded-2xl border border-border bg-bg-secondary/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <Cloud size={16} strokeWidth={1.6} className="text-text-dim" />
            <div>
              <div className="text-[13px] text-text">Work together</div>
              <div className="text-[11px] text-text-dim">
                Sign in to keep documents in the cloud and edit them with other people.
                Your projects below stay on this machine.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowSignIn(true)}
            className="shrink-0 rounded-lg bg-text px-3.5 py-1.5 text-[13px] font-semibold text-bg shadow-sm transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </div>
        <SignIn open={showSignIn} onClose={() => { setShowSignIn(false); void refresh() }} />
      </>
    )
  }

  return (
    <div className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={14} strokeWidth={1.7} className="text-text-dim" />
          <h2 className="text-[11px] uppercase tracking-widest text-text-dim">Cloud</h2>
          {email && <span className="text-[11px] text-text-dim/70">{email}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          >
            <Plus size={14} strokeWidth={1.8} />
            New
          </button>
          <button
            onClick={() => void signOut().then(refresh)}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-bg-hover hover:text-text"
          >
            <LogOut size={14} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}

      {loaded && documents.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-[12px] text-text-dim">
          No cloud documents yet. Create one to work on it with other people.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {documents.map((d) => (
          <button
            key={d.id}
            onClick={() => openCloudDocument(d.id)}
            className="group flex items-center justify-between rounded-xl border border-border bg-bg-secondary px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border-light hover:shadow-lg"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-text">{d.title}</div>
              <div className="mt-0.5 text-[11px] text-text-dim">
                {new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {d.role !== 'owner' && ` · ${d.role}`}
              </div>
            </div>
            <Users size={13} strokeWidth={1.6} className="shrink-0 text-text-dim opacity-0 transition-opacity group-hover:opacity-60" />
          </button>
        ))}
      </div>

      <Dialog
        open={showCreate}
        onClose={() => { setShowCreate(false); setTitle('') }}
        title="New cloud document"
        footer={
          <>
            <DialogCancel onClick={() => { setShowCreate(false); setTitle('') }} />
            <DialogAction onClick={handleCreate}>Create</DialogAction>
          </>
        }
      >
        <p className="mb-3 text-[12px] text-text-dim">
          This one lives on the server, so you can share it and edit it with
          other people at the same time.
        </p>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
          placeholder="Document name..."
          className="w-full rounded-lg border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent"
        />
      </Dialog>
    </div>
  )
}
