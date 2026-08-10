import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { isTauri } from '../utils/isTauri'

type UpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'dismissed' }

const CHECK_INTERVAL = 30 * 60 * 1000 // 30 minutes

export function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return

    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) return

      // Stop polling once we find an update
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }

      setState({ status: 'downloading', progress: 0 })

      let downloaded = 0
      let contentLength = 0
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            if (contentLength > 0) {
              setState({ status: 'downloading', progress: Math.round((downloaded / contentLength) * 100) })
            }
            break
          case 'Finished':
            break
        }
      })

      setState({ status: 'ready', version: update.version })
    } catch {
      // Silently fail — don't bother the user if update check fails
    }
  }, [])

  useEffect(() => {
    const initialTimeout = setTimeout(checkForUpdate, 5000)
    intervalRef.current = setInterval(checkForUpdate, CHECK_INTERVAL)
    return () => { clearTimeout(initialTimeout); if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [checkForUpdate])

  if (state.status === 'idle' || state.status === 'dismissed') return null

  if (state.status === 'downloading') {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border shadow-lg text-[13px] text-text-dim animate-in fade-in slide-in-from-bottom-2 duration-200">
        <Download size={14} className="animate-pulse" />
        <span>Downloading update{state.progress > 0 ? ` (${state.progress}%)` : '...'}</span>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-bg-secondary border border-border shadow-lg text-[13px] text-text animate-in fade-in slide-in-from-bottom-2 duration-200">
      <RefreshCw size={14} />
      <span>v{state.version} ready</span>
      <button
        onClick={async () => {
          const { relaunch } = await import('@tauri-apps/plugin-process')
          await relaunch()
        }}
        className="px-2.5 py-1 rounded-lg text-[12px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
      >
        Restart
      </button>
      <button
        onClick={() => setState({ status: 'dismissed' })}
        className="p-0.5 rounded-md text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  )
}
