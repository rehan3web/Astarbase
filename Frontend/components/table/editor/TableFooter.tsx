'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type TableFooterProps = {
  page: number
  pageCount: number
  pageSize: number
  recordCount: number
  loading?: boolean
  view: 'data' | 'definition'
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onViewChange: (view: 'data' | 'definition') => void
}

const PAGE_SIZES = [100, 500, 1000] as const

export function TableFooter({
  page,
  pageCount,
  pageSize,
  recordCount,
  loading = false,
  view,
  onPageChange,
  onPageSizeChange,
  onViewChange,
}: TableFooterProps) {
  const maxPage = Math.max(1, pageCount)
  const [pageDraft, setPageDraft] = useState(String(page))
  const lastCommittedPage = useRef(page)
  const dataTabRef = useRef<HTMLButtonElement>(null)
  const definitionTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setPageDraft(String(page))
    lastCommittedPage.current = page
  }, [page])

  const resetPageDraft = () => setPageDraft(String(page))

  const commitPage = () => {
    const value = pageDraft.trim()
    if (!/^\d+$/.test(value)) {
      resetPageDraft()
      return
    }

    const parsedPage = Number(value)
    if (!Number.isSafeInteger(parsedPage)) {
      resetPageDraft()
      return
    }

    const nextPage = Math.min(maxPage, Math.max(1, parsedPage))
    setPageDraft(String(nextPage))
    if (nextPage !== lastCommittedPage.current) {
      lastCommittedPage.current = nextPage
      onPageChange(nextPage)
    }
  }

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: 'data' | 'definition',
  ) => {
    let nextTab: 'data' | 'definition' | null = null
    if (event.key === 'ArrowLeft') nextTab = currentTab === 'data' ? 'definition' : 'data'
    if (event.key === 'ArrowRight') nextTab = currentTab === 'data' ? 'definition' : 'data'
    if (event.key === 'Home') nextTab = 'data'
    if (event.key === 'End') nextTab = 'definition'
    if (!nextTab) return

    event.preventDefault()
    onViewChange(nextTab)
    ;(nextTab === 'data' ? dataTabRef : definitionTabRef).current?.focus()
  }

  return (
    <footer
      data-table-footer
      className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-default bg-white dark:bg-dash-sidebar px-3 py-1.5 text-xs text-foreground-lighter sm:px-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-default text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <label htmlFor="table-footer-page" className="pl-0.5">Page</label>
        <input
          id="table-footer-page"
          aria-label="Page number"
          inputMode="numeric"
          autoComplete="off"
          value={pageDraft}
          onChange={event => setPageDraft(event.target.value)}
          onBlur={commitPage}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitPage()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              resetPageDraft()
              event.currentTarget.blur()
            }
          }}
          className="h-7 w-12 rounded-md border border-default bg-studio px-2 text-center font-mono text-xs text-foreground outline-none transition-colors focus:border-strong focus:ring-1 focus:ring-strong"
        />
        <span className="whitespace-nowrap">of {pageCount}</span>

        <button
          type="button"
          aria-label="Next page"
          disabled={page >= maxPage || loading}
          onClick={() => onPageChange(Math.min(maxPage, page + 1))}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-default text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Rows per page"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-default bg-studio px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"
            >
              {pageSize} rows
              <ChevronsUpDown className="h-3 w-3 text-foreground-muted" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={5}
            className="w-64 border-default bg-surface-100 p-1 text-foreground shadow-lg"
          >
            {PAGE_SIZES.map(size => (
              <DropdownMenuItem
                key={size}
                onSelect={() => onPageSizeChange(size)}
                className="h-7 cursor-pointer justify-between gap-3 rounded-sm px-2 text-xs text-foreground-light focus:bg-surface-200 focus:text-foreground"
              >
                {size} rows
                {pageSize === size && <Check className="h-3 w-3 text-foreground" aria-hidden="true" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="ml-0.5 whitespace-nowrap text-foreground-lighter" aria-live="polite">
          {recordCount.toLocaleString()} {recordCount === 1 ? 'record' : 'records'}
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Table view"
        className="inline-flex h-7 shrink-0 items-center rounded-md border border-default bg-studio p-0.5"
      >
        <button
          ref={dataTabRef}
          type="button"
          role="tab"
          aria-selected={view === 'data'}
          tabIndex={view === 'data' ? 0 : -1}
          onClick={() => onViewChange('data')}
          onKeyDown={event => handleTabKeyDown(event, 'data')}
          className={`h-full rounded-[4px] px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong ${
            view === 'data'
              ? 'border border-default bg-surface-100 font-medium text-foreground shadow-sm'
              : 'text-foreground-lighter hover:text-foreground'
          }`}
        >
          Data
        </button>
        <button
          ref={definitionTabRef}
          type="button"
          role="tab"
          aria-selected={view === 'definition'}
          tabIndex={view === 'definition' ? 0 : -1}
          onClick={() => onViewChange('definition')}
          onKeyDown={event => handleTabKeyDown(event, 'definition')}
          className={`h-full rounded-[4px] px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong ${
            view === 'definition'
              ? 'border border-default bg-surface-100 font-medium text-foreground shadow-sm'
              : 'text-foreground-lighter hover:text-foreground'
          }`}
        >
          Definition
        </button>
      </div>
    </footer>
  )
}
