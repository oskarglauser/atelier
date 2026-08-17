import { create } from 'zustand'
import { generateId } from '../utils/id'

/**
 * Who this browser is, for presence. Nothing here is an account — it is a
 * local label so collaborators can tell cursors apart, persisted so you keep
 * the same name and colour across reloads.
 */
export interface Identity {
  id: string
  name: string
  color: string
}

interface IdentityState extends Identity {
  setName: (name: string) => void
  setColor: (color: string) => void
}

/** Distinguishable at small sizes on both light and dark canvases. */
const PALETTE = [
  '#e0544e', // red
  '#e08a2e', // amber
  '#3f9e4d', // green
  '#2e8ba8', // teal
  '#4a6fe0', // blue
  '#8a4ae0', // violet
  '#d1409a', // magenta
  '#7a6a52', // taupe
]

const STORAGE_KEY = 'atelier-identity'

function randomName(): string {
  // Short, neutral, and unlikely to collide in a 2–8 person session
  return `Guest ${Math.floor(1000 + Math.random() * 9000)}`
}

function load(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>
      if (parsed.id && parsed.name && parsed.color) return parsed as Identity
    }
  } catch {
    // Corrupt or unavailable storage — fall through to a fresh identity
  }
  const fresh: Identity = {
    id: generateId(),
    name: randomName(),
    color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
  } catch {
    // Private mode: keep the in-memory identity for this session
  }
  return fresh
}

function persist(identity: Identity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
  } catch {
    // Non-fatal — presence still works for this session
  }
}

const initial = load()

export const useIdentityStore = create<IdentityState>((set, get) => ({
  ...initial,

  setName: (name) => {
    const next = { ...get(), name }
    persist({ id: next.id, name: next.name, color: next.color })
    set({ name })
  },

  setColor: (color) => {
    const next = { ...get(), color }
    persist({ id: next.id, name: next.name, color: next.color })
    set({ color })
  },
}))
