import type { ProjectMeta } from '../types/document'

const DB_NAME = 'atelier'
const STORE_NAME = 'projects'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const projects = request.result as ProjectMeta[]
      projects.sort((a, b) => b.updatedAt - a.updatedAt)
      resolve(projects)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveProject(meta: ProjectMeta): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(meta)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })

  // The row above is only the project's metadata — its actual content lives in
  // a separate per-project database. Without this the document data survives
  // every deletion, invisibly, forever.
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(`atelier-project-${id}`)
    // Resolve either way: a blocked or failed drop must not strand the caller,
    // and the metadata row is already gone so the project is out of the UI.
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
