import { useState } from 'react'
import { Dialog, DialogAction, DialogCancel } from '../ui/Dialog'
import { requestSignInCode, signInWithCode } from './authClient'

/**
 * Signing in, in two steps: ask for a code, then type it.
 *
 * No passwords anywhere — the code is the whole mechanism (infra INFRA.md
 * "Auth"). Signing in adds cloud documents; it does not touch the projects
 * already on this machine, which keep working signed out.
 */
export function SignIn({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setEmail(''); setCode(''); setSent(false); setError(''); setBusy(false)
  }

  const close = () => { reset(); onClose() }

  const sendCode = async () => {
    if (!email.trim() || busy) return
    setBusy(true); setError('')
    const { error } = await requestSignInCode(email.trim())
    setBusy(false)
    if (error) { setError(error.message ?? 'Could not send a code.'); return }
    setSent(true)
  }

  const submitCode = async () => {
    if (!code.trim() || busy) return
    setBusy(true); setError('')
    const { error } = await signInWithCode(email.trim(), code.trim())
    setBusy(false)
    if (error) { setError('That code is not right, or it has expired.'); return }
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={sent ? 'Enter your code' : 'Sign in'}
      footer={
        <>
          <DialogCancel onClick={close} />
          <DialogAction onClick={sent ? submitCode : sendCode}>
            {busy ? 'Working…' : sent ? 'Sign in' : 'Send code'}
          </DialogAction>
        </>
      }
    >
      {sent ? (
        <>
          <p className="mb-3 text-[12px] text-text-dim">
            We sent a code to <span className="text-text-secondary">{email}</span>. It expires in a few minutes.
          </p>
          <input
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCode() }}
            placeholder="123456"
            inputMode="numeric"
            className="w-full rounded-lg border border-border bg-bg-tertiary px-4 py-2.5 font-mono text-[13px] tracking-widest text-text outline-none transition-colors focus:border-accent"
          />
        </>
      ) : (
        <>
          <p className="mb-3 text-[12px] text-text-dim">
            Sign in to keep documents in the cloud and work on them with other
            people. Projects already on this machine stay where they are.
          </p>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') sendCode() }}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </>
      )}
      {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
    </Dialog>
  )
}
