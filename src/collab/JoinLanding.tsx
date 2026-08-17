import { useState } from 'react'
import { Check, Copy, Download, ExternalLink } from 'lucide-react'
import { ticketAppUrl } from './ticket'

/**
 * What a join link shows in a browser.
 *
 * Collaboration needs the peer-to-peer transport, which only the desktop app
 * has, so this cannot open the document here. Rather than joining into
 * something that would silently never sync, it hands the link on to the app —
 * and shows the code, because the person may be reading this on a machine that
 * is not the one they want to design on.
 */
export function JoinLanding({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied — the field is selectable as a fallback
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md text-center">
        <div
          className="mb-2 text-2xl text-text"
          style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 400 }}
        >
          Someone shared a document
        </div>
        <p className="mb-8 text-[13px] leading-relaxed text-text-dim">
          Editing together happens directly between your machines, which the
          desktop app can do and a browser tab cannot. Open it in Atelier to
          join.
        </p>

        <a
          href={ticketAppUrl(code)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-text px-5 py-2.5 text-sm font-semibold text-bg shadow-sm transition-opacity hover:opacity-90"
        >
          <ExternalLink size={14} strokeWidth={2} />
          Open in Atelier
        </a>

        <a
          href="https://github.com/oskarglauser/atelier/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm text-text-secondary transition-colors hover:border-border-light hover:text-text"
        >
          <Download size={14} strokeWidth={1.7} />
          Download Atelier
        </a>

        <div className="mt-10 border-t border-border pt-6">
          <p className="mb-2 text-[12px] text-text-dim">
            Designing on a different machine? Paste this code into Join there.
          </p>
          <div className="flex items-center gap-1.5">
            <input
              readOnly
              value={code}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-md border border-border bg-bg-tertiary px-2 py-1.5 font-mono text-[11px] text-text"
            />
            <button
              onClick={copy}
              title="Copy invite code"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            >
              {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.6} />}
            </button>
          </div>
        </div>

        <a
          href="#/"
          className="mt-8 inline-block text-[12px] text-text-dim transition-colors hover:text-text-secondary"
        >
          Go to my projects
        </a>
      </div>
    </div>
  )
}
