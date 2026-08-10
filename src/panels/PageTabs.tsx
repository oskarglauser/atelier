import { useDocument } from '../hooks/useDocument'
import { useProjectStore } from '../projects/projectStore'
import { addPage, deletePage, renamePage } from '../document/createDoc'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'

export function PageTabs() {
  const { doc, pages, activePageId } = useDocument()
  const setActivePageId = useProjectStore((s) => s.setActivePageId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleAddPage = () => {
    const id = addPage(doc)
    setActivePageId(id)
  }

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id)
    setEditName(name)
  }

  const handleFinishRename = () => {
    if (editingId && editName.trim()) {
      renamePage(doc, editingId, editName.trim())
    }
    setEditingId(null)
  }

  const handleDeletePage = (id: string) => {
    if (pages.length <= 1) return
    const idx = pages.findIndex((p) => p.id === id)
    const nextPage = pages[idx === 0 ? 1 : idx - 1]
    deletePage(doc, id)
    if (activePageId === id && nextPage) {
      setActivePageId(nextPage.id)
    }
  }

  return (
    <div className="h-8 bg-bg border-b border-border flex items-center px-2 gap-0.5 shrink-0 overflow-x-auto">
      {pages.map((page) => (
        <div
          key={page.id}
          onClick={() => setActivePageId(page.id)}
          onDoubleClick={() => handleStartRename(page.id, page.name)}
          className={`flex items-center gap-1 px-3 h-6 rounded-md text-[13px] cursor-pointer group transition-colors ${
            page.id === activePageId
              ? 'bg-bg-secondary text-text'
              : 'text-text-dim hover:text-text-secondary'
          }`}
        >
          {editingId === page.id ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="bg-transparent outline-none text-[13px] w-20"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span>{page.name}</span>
          )}
          {pages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeletePage(page.id) }}
              className="opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
            >
              <X size={11} strokeWidth={1.5} />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={handleAddPage}
        className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text-secondary rounded-md transition-colors"
        title="Add page"
      >
        <Plus size={13} strokeWidth={1.5} />
      </button>
    </div>
  )
}
