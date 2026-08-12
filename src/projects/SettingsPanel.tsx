import { useThemeStore } from '../store/themeStore'
import { useCanvasStore, type ExportScaleSetting } from '../store/canvasStore'
import { Switch } from '../ui/Switch'
import {
  ArrowLeft,
  Sun,
  Moon,
  SunMoon,
  Palette,
  Grid3x3,
  Info,
  Magnet,
  Ruler,
  Image as ImageIcon,
} from 'lucide-react'

interface Props {
  onBack: () => void
  backLabel?: string
}

const gridSizes = [8, 16, 24, 25, 32, 48, 64]
const exportScales: ExportScaleSetting[] = ['0.5x', '1x', '2x', '3x', '4x']

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="pt-1">
        <div className="flex items-center gap-2 text-text">
          <span className="text-text-dim">{icon}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <p className="mt-1.5 max-w-40 text-xs leading-relaxed text-text-dim">{description}</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-secondary shadow-sm">
        {children}
      </div>
    </section>
  )
}

function SettingRow({
  icon,
  title,
  description,
  control,
}: {
  icon?: React.ReactNode
  title: string
  description: string
  control: React.ReactNode
}) {
  return (
    <div className="flex min-h-18 items-center justify-between gap-5 border-b border-border px-5 py-4 last:border-b-0">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 text-text-dim">{icon}</span>}
        <div>
          <div className="text-[13px] font-medium text-text">{title}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-text-dim">{description}</div>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

export function SettingsPanel({ onBack, backLabel = 'Back to projects' }: Props) {
  const { mode, setMode } = useThemeStore()
  const {
    showGrid,
    setShowGrid,
    gridSize,
    setGridSize,
    snapToGrid,
    setSnapToGrid,
    snapToRulers,
    setSnapToRulers,
    showRulers,
    setShowRulers,
    lastExportScale,
    setDefaultExportScale,
  } = useCanvasStore()
  const availableGridSizes = [...new Set([...gridSizes, gridSize])].sort((a, b) => a - b)

  return (
    <div className="flex h-screen flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-5">
        <button
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
        >
          <ArrowLeft size={17} strokeWidth={1.7} />
        </button>
        <div className="ml-3">
          <h1 className="text-[15px] font-semibold tracking-tight text-text">Settings</h1>
          <p className="text-[11px] text-text-dim">Workspace preferences</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-10 md:px-10">
          <SettingsSection
            icon={<Palette size={16} />}
            title="Appearance"
            description="Choose how Atelier looks on this device."
          >
            <div className="grid grid-cols-3 gap-2 p-3">
              {([
                { value: 'auto' as const, label: 'System', Icon: SunMoon, desc: 'Match your device' },
                { value: 'light' as const, label: 'Light', Icon: Sun, desc: 'Bright workspace' },
                { value: 'dark' as const, label: 'Dark', Icon: Moon, desc: 'Dim workspace' },
              ]).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  aria-pressed={mode === option.value}
                  className={`flex min-h-24 flex-col items-start justify-between rounded-xl border p-3 text-left transition-all ${
                    mode === option.value
                      ? 'border-accent/70 bg-accent/10 text-text shadow-sm'
                      : 'border-transparent bg-bg-tertiary/70 text-text-secondary hover:border-border-light hover:bg-bg-hover hover:text-text'
                  }`}
                >
                  <option.Icon size={18} strokeWidth={1.6} />
                  <span>
                    <span className="block text-[13px] font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-[10px] text-text-dim">{option.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection
            icon={<Grid3x3 size={16} />}
            title="Canvas"
            description="Control guides and alignment behavior across projects."
          >
            <SettingRow
              icon={<Grid3x3 size={15} />}
              title="Dot grid"
              description="Show the alignment grid behind your artwork."
              control={<Switch checked={showGrid} onChange={setShowGrid} ariaLabel="Show dot grid" />}
            />
            <SettingRow
              title="Grid spacing"
              description="Distance between grid points in canvas pixels."
              control={
                <select
                  value={gridSize}
                  onChange={(event) => setGridSize(Number(event.target.value))}
                  className="h-8 rounded-lg border border-border bg-bg-tertiary px-2.5 text-xs text-text outline-none transition-colors hover:border-border-light focus:border-accent"
                >
                  {availableGridSizes.map((size) => <option key={size} value={size}>{size} px</option>)}
                </select>
              }
            />
            <SettingRow
              icon={<Magnet size={15} />}
              title="Snap to grid"
              description="Align moved and newly drawn objects to the dot grid."
              control={<Switch checked={snapToGrid} onChange={setSnapToGrid} ariaLabel="Snap to grid" />}
            />
            <SettingRow
              icon={<Ruler size={15} />}
              title="Frame rulers"
              description="Display ruler guides placed inside frames."
              control={<Switch checked={showRulers} onChange={setShowRulers} ariaLabel="Show frame rulers" />}
            />
            <SettingRow
              title="Snap to rulers"
              description="Align objects to ruler guides as you move them."
              control={<Switch checked={snapToRulers} onChange={setSnapToRulers} ariaLabel="Snap to rulers" />}
            />
          </SettingsSection>

          <SettingsSection
            icon={<ImageIcon size={16} />}
            title="Export"
            description="Set the default for new raster export rows."
          >
            <SettingRow
              title="Default raster scale"
              description="Resolution multiplier used for new PNG and JPG exports."
              control={
                <div className="flex rounded-lg bg-bg-tertiary p-0.5">
                  {exportScales.map((scale) => (
                    <button
                      key={scale}
                      onClick={() => setDefaultExportScale(scale)}
                      aria-pressed={lastExportScale === scale}
                      className={`min-w-10 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        lastExportScale === scale
                          ? 'bg-bg-secondary text-text shadow-sm'
                          : 'text-text-dim hover:text-text'
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              }
            />
          </SettingsSection>

          <SettingsSection
            icon={<Info size={16} />}
            title="About"
            description="Application and project information."
          >
            <SettingRow
              title="Atelier"
              description="A focused vector design tool for identity work."
              control={<span className="rounded-full bg-bg-tertiary px-2.5 py-1 text-[11px] text-text-dim">v{__APP_VERSION__}</span>}
            />
            <SettingRow
              title="Glauser Creative"
              description="Designed and built in Sweden."
              control={
                <a
                  href="https://glauser.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-text-secondary transition-colors hover:text-accent"
                >
                  Visit website ↗
                </a>
              }
            />
          </SettingsSection>
        </div>
      </div>
    </div>
  )
}
