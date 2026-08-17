import { create } from 'zustand'
import type { ProjectMeta } from '../types/document'
import { listProjects, saveProject, deleteProject as deleteProjectFromDB } from './projectPersistence'
import { generateId } from '../utils/id'
import { decodeTicket } from '../collab/ticket'

interface ProjectStore {
  projects: ProjectMeta[]
  activeProjectId: string | null
  activePageId: string | null
  loading: boolean

  loadProjects: () => Promise<void>
  createProject: (name: string) => Promise<ProjectMeta>
  joinProject: (ticketText: string) => Promise<ProjectMeta | null>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  openProject: (id: string, pageId?: string) => void
  setActivePageId: (pageId: string) => void
  closeProject: () => void
  updateProjectTimestamp: (id: string) => Promise<void>
  saveThumbnail: (id: string, dataUrl: string) => Promise<void>
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  activeProjectId: null,
  activePageId: null,
  loading: true,

  loadProjects: async () => {
    const projects = await listProjects()
    set({ projects, loading: false })
  },

  createProject: async (name: string) => {
    const now = Date.now()
    const meta: ProjectMeta = {
      id: generateId(),
      name,
      createdAt: now,
      updatedAt: now,
      teamId: null,
      createdBy: null,
      thumbnail: null,
    }
    await saveProject(meta)
    set((s) => ({ projects: [meta, ...s.projects] }))
    return meta
  },

  joinProject: async (ticketText: string) => {
    const ticket = decodeTicket(ticketText)
    if (!ticket) return null
    // Already joined this document — reopen rather than making a second copy
    const existing = get().projects.find((p) => p.joinDocId === ticket.docId)
    if (existing) return existing

    const now = Date.now()
    const meta: ProjectMeta = {
      id: generateId(),
      // Renamed once the document syncs, if it carries a name
      name: 'Shared project',
      createdAt: now,
      updatedAt: now,
      teamId: null,
      createdBy: null,
      thumbnail: null,
      joinDocId: ticket.docId,
      joinPeers: ticket.peers,
    }
    await saveProject(meta)
    set((s) => ({ projects: [meta, ...s.projects] }))
    return meta
  },

  /**
   * Used when a shared document tells us its real name, replacing the
   * placeholder a join starts with.
   */
  renameProject: async (id: string, name: string) => {
    const project = get().projects.find((p) => p.id === id)
    if (!project || project.name === name) return
    const updated = { ...project, name }
    await saveProject(updated)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }))
  },

  deleteProject: async (id: string) => {
    await deleteProjectFromDB(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
    }))
  },

  openProject: (id, pageId) => {
    set({ activeProjectId: id, activePageId: pageId || null })
    const page = pageId ? `/page/${pageId}` : ''
    window.history.replaceState(null, '', `#/project/${id}${page}`)
  },

  setActivePageId: (pageId) => {
    const projectId = get().activeProjectId
    set({ activePageId: pageId })
    if (projectId) {
      window.history.replaceState(null, '', `#/project/${projectId}/page/${pageId}`)
    }
  },

  closeProject: () => {
    set({ activeProjectId: null, activePageId: null })
    window.history.replaceState(null, '', '#/')
  },

  updateProjectTimestamp: async (id: string) => {
    const projects = get().projects
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const updated = { ...project, updatedAt: Date.now() }
    await saveProject(updated)
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }))
  },

  saveThumbnail: async (id: string, dataUrl: string) => {
    const projects = get().projects
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const updated = { ...project, thumbnail: dataUrl, updatedAt: Date.now() }
    await saveProject(updated)
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }))
  },
}))
