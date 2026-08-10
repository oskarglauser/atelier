import { create } from 'zustand'

type ThemeMode = 'auto' | 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'auto' ? getSystemTheme() : mode
}

function loadMode(): ThemeMode {
  return (localStorage.getItem('atelier-theme') as ThemeMode) || 'auto'
}

function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved)
}

const initialMode = loadMode()
const initialResolved = resolve(initialMode)
applyTheme(initialResolved)

export const useThemeStore = create<ThemeState>((set) => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    const currentMode = useThemeStore.getState().mode
    if (currentMode === 'auto') {
      const r = getSystemTheme()
      applyTheme(r)
      set({ resolved: r })
    }
  })

  return {
    mode: initialMode,
    resolved: initialResolved,

    setMode: (mode) => {
      localStorage.setItem('atelier-theme', mode)
      const r = resolve(mode)
      applyTheme(r)
      set({ mode, resolved: r })
    },
  }
})
