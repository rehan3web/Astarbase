'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FileCode,
  Folder,
  FolderOpen,
  FolderPlus,
  Heart,
  MoreVertical,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { SqlSnippet, SqlFolder } from '@/lib/mock-data'
import { useTheme } from '@/components/providers/ThemeProvider'
import { cn } from '@/lib/utils'
import { SqlFileIcon } from './SqlFileIcon'

interface SqlSidebarProps {
  snippets: SqlSnippet[]
  folders?: SqlFolder[]
  activeSnippetId: string
  search: string
  onSearchChange: (value: string) => void
  onSelectSnippet: (snippet: SqlSnippet) => void
  onCreateNewQuery: () => void
  onCreateFolder?: (name?: string, visibility?: 'private' | 'shared') => void
  onRenameFolder?: (folderId: string, newName: string) => void
  onDeleteFolder?: (folderId: string) => void
  onCreateQueryInFolder?: (folderId: string) => void
  onToggleFavorite?: (snippetId: string) => void
  onToggleVisibility?: (snippetId: string) => void
  onRenameSnippet?: (snippetId: string, newName: string) => void
  onDuplicateSnippet?: (snippet: SqlSnippet) => void
  onDeleteSnippet?: (snippetId: string) => void
}

function InlineRenameInput({
  initialValue,
  onSave,
  onCancel,
  className,
}: {
  initialValue: string
  onSave: (value: string) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Select text only once when the input mounts
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          const trimmed = value.trim()
          if (trimmed) onSave(trimmed)
          else onCancel()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        }
      }}
      onBlur={() => {
        const trimmed = value.trim()
        if (trimmed) onSave(trimmed)
        else onCancel()
      }}
      onClick={(e) => e.stopPropagation()}
      className={className}
    />
  )
}

export function SqlSidebar({
  snippets,
  folders = [],
  activeSnippetId,
  search,
  onSearchChange,
  onSelectSnippet,
  onCreateNewQuery,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onCreateQueryInFolder,
  onToggleFavorite,
  onToggleVisibility,
  onRenameSnippet,
  onDuplicateSnippet,
  onDeleteSnippet,
}: SqlSidebarProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    shared: true,
    favorites: true,
    private: true,
  })

  // Collapsible folders
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    folder_1: true,
  })

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'folder' | 'snippet'
    id: string
  } | null>(null)

  // Inline editing state for direct in-place renaming
  const [inlineEditing, setInlineEditing] = useState<{
    type: 'folder' | 'snippet'
    id: string
  } | null>(null)

  // Dialog state for create/delete
  const [modalState, setModalState] = useState<{
    type: 'create_folder' | 'delete_folder' | 'delete_snippet'
    id?: string
    name?: string
  } | null>(null)
  const [modalInputValue, setModalInputValue] = useState('')
  const [newFolderVisibility, setNewFolderVisibility] = useState<'private' | 'shared'>('private')

  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus modal input on open
  useEffect(() => {
    if (modalState && modalState.type !== 'delete_folder' && modalState.type !== 'delete_snippet') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [modalState])

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    if (contextMenu) {
      window.addEventListener('mousedown', handleOutsideClick)
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  // Filter snippets by search
  const filteredSnippets = snippets.filter((s) => {
    if (!search.trim()) return true
    return (
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.sql.toLowerCase().includes(search.toLowerCase())
    )
  })

  // Categorize snippets
  const sharedSnippets = filteredSnippets.filter((s) => s.visibility === 'shared')
  const sharedFolders = folders.filter((folder) => folder.visibility === 'shared')
  const sharedRootSnippets = sharedSnippets.filter((snippet) => !snippet.folderId)
  const favoriteSnippets = filteredSnippets.filter((s) => s.isFavorite)
  const privateSnippets = filteredSnippets.filter((s) => s.visibility !== 'shared')

  // Folders for private
  const privateFolders = folders.filter((f) => f.visibility !== 'shared')
  const privateCount = privateSnippets.length

  const handleModalSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!modalState) return

    if (modalState.type === 'create_folder') {
      const name = modalInputValue.trim() || 'New folder'
      onCreateFolder?.(name, newFolderVisibility)
    } else if (modalState.type === 'delete_folder' && modalState.id) {
      onDeleteFolder?.(modalState.id)
    } else if (modalState.type === 'delete_snippet' && modalState.id) {
      onDeleteSnippet?.(modalState.id)
    }

    setModalState(null)
  }

  // Render Snippet Helper
  const renderSnippetRow = (snip: SqlSnippet, isInsideFolder = false) => {
    const isSelected = snip.id === activeSnippetId
    return (
      <div
        key={snip.id}
        onClick={() => onSelectSnippet(snip)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setContextMenu({
            x: Math.min(e.clientX, window.innerWidth - 200),
            y: Math.min(e.clientY, window.innerHeight - 200),
            type: 'snippet',
            id: snip.id,
          })
        }}
        className={cn(
          'w-full flex items-center justify-between text-xs transition-colors cursor-pointer group text-left border-y border-x-0',
          isInsideFolder ? 'pl-7 pr-3 py-1.5' : 'px-3 py-1.5',
          isSelected
            ? 'bg-[#F3F3F3] dark:bg-[#1E1F1E] text-foreground dark:text-[#F3F3F3] font-medium border-strong shadow-2xs'
            : 'text-foreground-light hover:bg-surface-100 hover:text-foreground border-transparent'
        )}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0 mr-1.5">
          <SqlFileIcon
            className={cn(
              'w-4 h-4 shrink-0 transition-colors',
              isSelected
                ? 'text-foreground dark:text-[#F3F3F3]'
                : 'text-foreground-muted group-hover:text-foreground'
            )}
          />
          {inlineEditing?.type === 'snippet' && inlineEditing?.id === snip.id ? (
            <InlineRenameInput
              initialValue={snip.name}
              onSave={(newName) => {
                if (newName && newName !== snip.name) {
                  onRenameSnippet?.(snip.id, newName)
                }
                setInlineEditing(null)
              }}
              onCancel={() => setInlineEditing(null)}
              className="w-full h-6 px-1.5 py-0.5 rounded bg-surface-200 border border-brand text-foreground text-xs font-mono outline-none"
            />
          ) : (
            <span
              className="truncate"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setInlineEditing({ type: 'snippet', id: snip.id })
              }}
            >
              {snip.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Quick favorite heart */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite?.(snip.id)
            }}
            className={cn(
              'p-0.5 rounded hover:bg-surface-200 transition-colors cursor-pointer',
              snip.isFavorite
                ? 'text-red-500 fill-red-500'
                : 'text-foreground-lighter hover:text-foreground'
            )}
            title={snip.isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            <Heart
              className={cn('h-3 w-3', snip.isFavorite && 'fill-current text-red-500')}
            />
          </button>

          {/* 3-dots button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              setContextMenu({
                x: Math.min(rect.left, window.innerWidth - 200),
                y: Math.min(rect.bottom + 4, window.innerHeight - 200),
                type: 'snippet',
                id: snip.id,
              })
            }}
            className="p-0.5 rounded hover:bg-surface-200 text-foreground-lighter hover:text-foreground transition-colors cursor-pointer"
            title="Options"
          >
            <MoreVertical className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <aside className="w-64 shrink-0 border-r border-default bg-dash-sidebar flex flex-col h-full select-none relative">
      {/* Top Search & Create Actions Bar */}
      <div className="p-2 border-b border-default flex items-center gap-1.5">
        <div className="relative flex-1 flex items-center bg-surface-100 border border-strong rounded-md h-8 px-2.5">
          <Search className="h-3.5 w-3.5 text-foreground-lighter shrink-0 mr-1.5" />
          <input
            placeholder="Search queries..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent text-xs text-foreground placeholder:text-foreground-lighter outline-none border-none p-0"
          />
          <ChevronDown className="h-3.5 w-3.5 text-foreground-lighter shrink-0 ml-1 opacity-70" />
        </div>

        {/* Plus (+) Dropdown Button */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-8 w-8 rounded-md border border-strong bg-surface-100 hover:bg-surface-200 flex items-center justify-center text-foreground-lighter hover:text-foreground transition-colors cursor-pointer shrink-0"
              title="New..."
              aria-label="Create new query or folder"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-surface-100 border-overlay">
            <DropdownMenuItem
              onClick={onCreateNewQuery}
              className="gap-2 cursor-pointer text-xs"
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>Create new snippet</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setModalInputValue('New folder')
                setNewFolderVisibility('private')
                setModalState({ type: 'create_folder' })
              }}
              className="gap-2 cursor-pointer text-xs"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>Create new folder</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setModalInputValue('New shared folder')
                setNewFolderVisibility('shared')
                setModalState({ type: 'create_folder' })
              }}
              className="gap-2 cursor-pointer text-xs"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Create shared folder</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Accordion Sections: SHARED, FAVORITES, PRIVATE */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* 1. SHARED SECTION */}
        <div className="pb-3 border-b border-default">
          <button
            onClick={() => toggleSection('shared')}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-lighter hover:text-foreground transition-colors cursor-pointer text-left"
          >
            {openSections.shared ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>SHARED</span>
          </button>

          {openSections.shared && (
            <div className="mt-0.5">
              {sharedFolders.map((folder) => {
                const isFolderOpen = !!openFolders[folder.id]
                const children = sharedSnippets.filter((snippet) => snippet.folderId === folder.id)
                return (
                  <div key={folder.id}>
                    <div
                      onClick={() => toggleFolder(folder.id)}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 200), y: Math.min(event.clientY, window.innerHeight - 200), type: 'folder', id: folder.id })
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-surface-100 transition-colors cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isFolderOpen ? <ChevronDown className="h-3.5 w-3.5 text-foreground-lighter" /> : <ChevronRight className="h-3.5 w-3.5 text-foreground-lighter" />}
                        {isFolderOpen ? <FolderOpen className="h-3.5 w-3.5 text-foreground-lighter" /> : <Folder className="h-3.5 w-3.5 text-foreground-lighter" />}
                        <span className="truncate font-medium">{folder.name}</span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Options for ${folder.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          const rect = event.currentTarget.getBoundingClientRect()
                          setContextMenu({ x: Math.min(rect.left, window.innerWidth - 200), y: Math.min(rect.bottom + 4, window.innerHeight - 200), type: 'folder', id: folder.id })
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-200 rounded text-foreground-lighter hover:text-foreground"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                    </div>
                    {isFolderOpen && (children.length ? children.map((snippet) => renderSnippetRow(snippet, true)) : <div className="pl-8 pr-3 py-1 text-[11px] text-foreground-muted italic">Empty folder</div>)}
                  </div>
                )
              })}
              {sharedRootSnippets.length === 0 && sharedFolders.length === 0 ? (
                <div className="mx-3 my-1.5 p-4 rounded-lg border border-strong bg-surface-100/50 text-center flex flex-col items-center justify-center select-none">
                  <span className="text-xs font-medium text-foreground">
                    No shared queries
                  </span>
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Share queries with your team by right-clicking on the query.
                  </p>
                </div>
              ) : (
                sharedRootSnippets.map((snip) => renderSnippetRow(snip))
              )}
            </div>
          )}
        </div>

        {/* 2. FAVORITES SECTION */}
        <div className="py-3 border-b border-default">
          <button
            onClick={() => toggleSection('favorites')}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-lighter hover:text-foreground transition-colors cursor-pointer text-left"
          >
            {openSections.favorites ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>FAVORITES</span>
          </button>

          {openSections.favorites && (
            <div className="mt-0.5">
              {favoriteSnippets.length === 0 ? (
                <div className="mx-3 my-1.5 p-4 rounded-lg border border-strong bg-surface-100/50 text-center flex flex-col items-center justify-center select-none">
                  <span className="text-xs font-medium text-foreground">
                    No favorite queries
                  </span>
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Save a query to favorites for easy accessibility by clicking the ♡
                    icon.
                  </p>
                </div>
              ) : (
                favoriteSnippets.map((snip) => renderSnippetRow(snip))
              )}
            </div>
          )}
        </div>

        {/* 3. PRIVATE SECTION */}
        <div className="pt-3">
          <button
            onClick={() => toggleSection('private')}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase text-foreground-lighter hover:text-foreground transition-colors cursor-pointer text-left"
          >
            {openSections.private ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              PRIVATE <span className="font-normal text-foreground-lighter">({privateCount})</span>
            </span>
          </button>

          {openSections.private && (
            <div className="mt-0.5 space-y-0.5">
              {/* Folders in Private */}
              {privateFolders.map((folder) => {
                const isFolderOpen = !!openFolders[folder.id]
                const folderSnippets = privateSnippets.filter(
                  (s) => s.folderId === folder.id
                )

                return (
                  <div key={folder.id}>
                    {/* Folder Row */}
                    <div
                      onClick={() => toggleFolder(folder.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({
                          x: Math.min(e.clientX, window.innerWidth - 200),
                          y: Math.min(e.clientY, window.innerHeight - 200),
                          type: 'folder',
                          id: folder.id,
                        })
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-surface-100 transition-colors cursor-pointer select-none group"
                    >
                      <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 mr-1.5">
                        {isFolderOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                        )}
                        {isFolderOpen ? (
                          <FolderOpen className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                        ) : (
                          <Folder className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                        )}
                        {inlineEditing?.type === 'folder' && inlineEditing?.id === folder.id ? (
                          <InlineRenameInput
                            initialValue={folder.name}
                            onSave={(newName) => {
                              if (newName && newName !== folder.name) {
                                onRenameFolder?.(folder.id, newName)
                              }
                              setInlineEditing(null)
                            }}
                            onCancel={() => setInlineEditing(null)}
                            className="w-full h-6 px-1.5 py-0.5 rounded bg-surface-200 border border-brand text-foreground text-xs font-medium outline-none"
                          />
                        ) : (
                          <span
                            className="truncate font-medium"
                            onDoubleClick={(e) => {
                              e.stopPropagation()
                              setInlineEditing({ type: 'folder', id: folder.id })
                            }}
                          >
                            {folder.name}
                          </span>
                        )}
                      </div>

                      {/* Folder 3-dots actions on click / hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          setContextMenu({
                            x: Math.min(rect.left, window.innerWidth - 200),
                            y: Math.min(rect.bottom + 4, window.innerHeight - 200),
                            type: 'folder',
                            id: folder.id,
                          })
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-200 rounded text-foreground-lighter hover:text-foreground transition-all cursor-pointer"
                        title="Folder options"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Queries inside Folder */}
                    {isFolderOpen && (
                      <div className="space-y-0.5">
                        {folderSnippets.length === 0 ? (
                          <div className="pl-8 pr-3 py-1 text-[11px] text-foreground-muted italic select-none">
                            Empty folder
                          </div>
                        ) : (
                          folderSnippets.map((snip) => renderSnippetRow(snip, true))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Root Queries in Private (not in any folder) */}
              {privateSnippets
                .filter((s) => !s.folderId)
                .map((snip) => renderSnippetRow(snip, false))}

              {privateFolders.length === 0 && privateSnippets.length === 0 && (
                <div className="mx-3 my-1.5 p-4 rounded-lg border border-strong bg-surface-100/50 text-center flex flex-col items-center justify-center select-none">
                  <span className="text-xs font-medium text-foreground">
                    No private queries
                  </span>
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Click + to create a new query or folder.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* Floating Right-Click / 3-dots Context Menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border border-overlay bg-surface-100 p-1 text-foreground shadow-2xl text-xs animate-in fade-in-0 zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' ? (
            <>
              {/* Folder Context Menu */}
              <button
                onClick={() => {
                  // Ensure folder is opened and create query inside it
                  setOpenFolders((prev) => ({ ...prev, [contextMenu.id]: true }))
                  onCreateQueryInFolder?.(contextMenu.id)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Plus className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>Create new snippet</span>
              </button>
              <button
                onClick={() => {
                  const f = folders.find((item) => item.id === contextMenu.id)
                  if (f) {
                    setInlineEditing({ type: 'folder', id: f.id })
                  }
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Edit3 className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>Rename folder</span>
              </button>
              <div className="-mx-1 my-1 h-px bg-border-overlay" />
              <button
                onClick={() => {
                  const f = folders.find((item) => item.id === contextMenu.id)
                  setModalState({ type: 'delete_folder', id: contextMenu.id, name: f?.name })
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-destructive hover:text-destructive transition-colors cursor-pointer text-left"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                <span>Delete folder</span>
              </button>
            </>
          ) : (
            <>
              {/* Snippet Context Menu */}
              <button
                onClick={() => {
                  const snip = snippets.find((item) => item.id === contextMenu.id)
                  if (snip) {
                    setInlineEditing({ type: 'snippet', id: snip.id })
                  }
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Edit3 className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>Rename</span>
              </button>
              <button
                onClick={() => {
                  const snip = snippets.find((item) => item.id === contextMenu.id)
                  if (snip) onDuplicateSnippet?.(snip)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Copy className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={() => {
                  onToggleFavorite?.(contextMenu.id)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Heart className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>
                  {snippets.find((s) => s.id === contextMenu.id)?.isFavorite
                    ? 'Remove from favorites'
                    : 'Add to favorites'}
                </span>
              </button>
              <button
                onClick={() => {
                  onToggleVisibility?.(contextMenu.id)
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground transition-colors cursor-pointer text-left"
              >
                <Share2 className="h-3.5 w-3.5 text-foreground-lighter" />
                <span>
                  {snippets.find((s) => s.id === contextMenu.id)?.visibility === 'shared'
                    ? 'Make private'
                    : 'Share with team'}
                </span>
              </button>
              <div className="-mx-1 my-1 h-px bg-border-overlay" />
              <button
                onClick={() => {
                  const snip = snippets.find((item) => item.id === contextMenu.id)
                  setModalState({ type: 'delete_snippet', id: contextMenu.id, name: snip?.name })
                  setContextMenu(null)
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-surface-200 text-destructive hover:text-destructive transition-colors cursor-pointer text-left"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                <span>Delete query</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Sleek Supabase-Style Dialog Modal for Create/Rename/Delete */}
      <Dialog open={!!modalState} onOpenChange={(open) => !open && setModalState(null)}>
        <DialogContent className="max-w-md bg-surface-100 border border-overlay text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {modalState?.type === 'create_folder' && 'Create new folder'}
              {modalState?.type === 'delete_folder' && 'Delete folder'}
              {modalState?.type === 'delete_snippet' && 'Delete query'}
            </DialogTitle>
          </DialogHeader>

          {modalState?.type === 'delete_folder' ? (
            <p className="text-xs text-foreground-lighter py-2">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{modalState?.name}"</span>? Queries inside will be kept and moved out of the folder.
            </p>
          ) : modalState?.type === 'delete_snippet' ? (
            <p className="text-xs text-foreground-lighter py-2">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{modalState?.name}"</span>? This action cannot be undone.
            </p>
          ) : (
            <form onSubmit={handleModalSubmit} className="py-2 space-y-2">
              <label className="text-xs text-foreground-lighter block">Folder name</label>
              <input
                ref={inputRef}
                value={modalInputValue}
                onChange={(e) => setModalInputValue(e.target.value)}
                placeholder="Enter name..."
                className="w-full bg-surface-200 border border-strong rounded px-3 py-2 text-xs text-foreground outline-none focus:border-brand"
              />
            </form>
          )}

          <DialogFooter className="flex justify-end gap-2 pt-3 border-t border-default">
            <button
              type="button"
              onClick={() => setModalState(null)}
              className="px-3 py-1.5 text-xs rounded border border-strong hover:bg-surface-200 text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleModalSubmit()}
              className={cn(
                'px-3 py-1.5 text-xs rounded font-medium transition-colors cursor-pointer text-white',
                modalState?.type.startsWith('delete')
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-brand hover:bg-brand-button hover:brightness-105'
              )}
            >
              {modalState?.type.startsWith('delete') ? 'Delete' : 'Save'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

