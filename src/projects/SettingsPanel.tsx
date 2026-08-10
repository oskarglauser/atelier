import { useThemeStore } from '../store/themeStore'
import { ArrowLeft, Sun, Moon, SunMoon, Monitor, Palette, Grid3x3, Info } from 'lucide-react'

interface Props {
  onBack: () => void
}

export function SettingsPanel({ onBack }: Props) {
  const { mode, setMode } = useThemeStore()

  return (
    <div className="h-screen bg-bg flex flex-col">
      <header className="h-16 flex items-center px-8 border-b border-border shrink-0 gap-4">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center text-text-secondary hover:text-text hover:bg-bg-hover rounded-lg"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-xl font-semibold text-text tracking-tight">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={18} className="text-text-secondary" />
              <h2 className="text-base font-medium text-text">Appearance</h2>
            </div>
            <div className="bg-bg-secondary border border-border rounded-xl p-4">
              <label className="text-sm text-text-secondary mb-3 block">Theme</label>
              <div className="flex gap-2">
                {([
                  { value: 'auto' as const, label: 'Auto', Icon: SunMoon, desc: 'Follow system' },
                  { value: 'light' as const, label: 'Light', Icon: Sun, desc: 'Always light' },
                  { value: 'dark' as const, label: 'Dark', Icon: Moon, desc: 'Always dark' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                      mode === opt.value
                        ? 'border-accent bg-accent/10 text-text'
                        : 'border-border hover:border-border-light text-text-secondary hover:text-text'
                    }`}
                  >
                    <opt.Icon size={22} />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-text-dim">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Grid3x3 size={18} className="text-text-secondary" />
              <h2 className="text-base font-medium text-text">Canvas</h2>
            </div>
            <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text">Show grid</div>
                  <div className="text-xs text-text-dim mt-0.5">Display grid lines on the canvas</div>
                </div>
                <span className="text-sm text-text-dim">Always on</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text">Snap to grid</div>
                  <div className="text-xs text-text-dim mt-0.5">Snap objects to grid when moving</div>
                </div>
                <span className="text-sm text-text-dim">Coming soon</span>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Monitor size={18} className="text-text-secondary" />
              <h2 className="text-base font-medium text-text">Export</h2>
            </div>
            <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text">Default PNG scale</div>
                  <div className="text-xs text-text-dim mt-0.5">Resolution multiplier for PNG export</div>
                </div>
                <span className="text-sm text-text-dim">2x</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text">SVG export mode</div>
                  <div className="text-xs text-text-dim mt-0.5">How SVG paths are exported</div>
                </div>
                <span className="text-sm text-text-dim">Optimized</span>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Info size={18} className="text-text-secondary" />
              <h2 className="text-base font-medium text-text">About</h2>
            </div>
            <div className="bg-bg-secondary border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-text font-medium">Atelier</div>
                  <div className="text-xs text-text-dim mt-0.5">Vector design tool for branding & logos</div>
                </div>
                <span className="text-sm text-text-dim">v{__APP_VERSION__}</span>
              </div>
              <div className="border-t border-border" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-text-dim">Made by</div>
                  <a href="https://glauser.com" target="_blank" rel="noopener noreferrer" className="text-sm text-text font-medium hover:text-accent transition-colors">
                    Glauser Creative
                  </a>
                </div>
              </div>
              <div className="border-t border-border" />
              <div>
                <div className="text-xs text-text-dim mb-3">Built with open source</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: 'React', url: 'https://react.dev' },
                    { name: 'Konva.js', url: 'https://konvajs.org' },
                    { name: 'Yjs', url: 'https://yjs.dev' },
                    { name: 'Zustand', url: 'https://zustand.docs.pmnd.rs' },
                    { name: 'Paper.js', url: 'http://paperjs.org' },
                    { name: 'opentype.js', url: 'https://opentype.js.org' },
                    { name: 'jsPDF', url: 'https://github.com/parallax/jsPDF' },
                    { name: 'react-colorful', url: 'https://github.com/omgovich/react-colorful' },
                    { name: 'Tailwind CSS', url: 'https://tailwindcss.com' },
                    { name: 'Vite', url: 'https://vite.dev' },
                    { name: 'Tauri', url: 'https://tauri.app' },
                  ].map((lib) => (
                    <a
                      key={lib.name}
                      href={lib.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs text-text-secondary bg-bg-tertiary rounded-md hover:text-text hover:bg-bg-hover transition-colors"
                    >
                      {lib.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
