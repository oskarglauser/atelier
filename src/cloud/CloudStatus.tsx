import { Eye, Loader2, WifiOff } from 'lucide-react'
import { useDocument } from '../hooks/useDocument'

/**
 * What the server is letting you do with this document.
 *
 * Shown because the alternative is worse: a read-only connection still accepts
 * edits locally and has them discarded on the way out, so without this someone
 * can draw for a minute into a document that never changes. Saying so is the
 * difference between a restriction and a bug.
 */
export function CloudStatus() {
  const { hostedStatus, canEdit } = useDocument()

  // A local project has no server and nothing to report.
  if (!hostedStatus) return null

  if (hostedStatus.state === 'error') {
    return (
      <Banner tone="danger">
        <WifiOff size={13} strokeWidth={1.7} />
        {hostedStatus.error ?? 'Lost the connection to this document.'}
      </Banner>
    )
  }

  if (hostedStatus.state === 'connecting') {
    return (
      <Banner tone="dim">
        <Loader2 size={13} strokeWidth={1.7} className="animate-spin" />
        Connecting…
      </Banner>
    )
  }

  if (!canEdit) {
    return (
      <Banner tone="dim">
        <Eye size={13} strokeWidth={1.7} />
        You are viewing this document. Ask whoever shared it for access to edit.
      </Banner>
    )
  }

  return null
}

function Banner({
  tone,
  children,
}: {
  tone: 'dim' | 'danger'
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center gap-2 border-b px-4 py-1.5 text-[12px] ${
        tone === 'danger'
          ? 'border-danger/30 bg-danger/10 text-danger'
          : 'border-border bg-bg-secondary text-text-dim'
      }`}
    >
      {children}
    </div>
  )
}
