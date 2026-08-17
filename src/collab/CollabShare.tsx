import { useState } from 'react'
import { Users, Copy, Check } from 'lucide-react'
import { useDocument } from '../hooks/useDocument'
import { useRemotePeers } from './usePresence'
import { encodeTicket } from './ticket'

/**
 * Sharing control for the current document: how many people are in it, and the
 * ticket that lets someone else join.
 *
 * Only meaningful on the desktop build, where the peer-to-peer transport runs,
 * so it hides itself entirely in the browser rather than offering something
 * that cannot work.
 */
export function CollabShare() {
  const { docId, collabStatus } = useDocument()
  const peers = useRemotePeers()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!collabStatus) return null

  const ticket =
    collabStatus.state === 'connected' && docId
      ? encodeTicket({ docId, peers: collabStatus.endpointId ? [collabStatus.endpointId] : [] })
      : ''

  const copy = async () => {
    if (!ticket) return
    try {
      await navigator.clipboard.writeText(ticket)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied — the field is selectable as a fallback
    }
  }

  const label =
    collabStatus.state === 'error'
      ? 'Sharing unavailable'
      : collabStatus.state === 'connecting'
        ? 'Starting…'
        : peers.length === 0
          ? 'Share'
          : `${peers.length + 1} editing`

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={collabStatus.error ?? 'Share this document on your local network'}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
      >
        <Users size={13} strokeWidth={1.6} />
        {label}
        {peers.length > 0 && (
          <span className="flex items-center -space-x-1">
            {peers.slice(0, 3).map((p) => (
              <span
                key={p.clientId}
                title={p.user.name}
                className="h-3 w-3 rounded-full border border-bg"
                style={{ backgroundColor: p.user.color }}
              />
            ))}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-border bg-bg-secondary p-3 shadow-xl">
          {collabStatus.state === 'error' ? (
            <p className="text-[12px] text-danger">{collabStatus.error}</p>
          ) : (
            <>
              <p className="mb-2 text-[12px] text-text-secondary">
                Anyone on this network with the code below can open and edit this document.
                There is no way to revoke it, so share it like a password.
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={ticket}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text"
                />
                <button
                  onClick={copy}
                  title="Copy invite code"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
                >
                  {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.6} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
