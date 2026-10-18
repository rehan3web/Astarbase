'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/api'
import { LoadingIndicator } from '@/components/ui/spinner'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { queueSqlEditorDraft } from '@/lib/sql-editor-handoff'
import type { TableDefinition } from '@/lib/mock-data'

interface TableDefinitionViewProps {
  selectedTable: TableDefinition
}

type DefinitionResponse = {
  database: string
  schema: string
  table: string
  sql: string
}

type SqlToken = { text: string; kind: 'keyword' | 'string' | 'comment' | 'identifier' | 'number' | 'plain' }

const SQL_KEYWORDS = new Set([
  'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'cascade', 'check', 'collate',
  'column', 'constraint', 'create', 'default', 'delete', 'desc', 'distinct', 'drop', 'else',
  'end', 'exists', 'foreign', 'from', 'generated', 'if', 'in', 'index', 'insert', 'into',
  'is', 'key', 'not', 'null', 'on', 'or', 'order', 'primary', 'references', 'returning',
  'select', 'set', 'table', 'then', 'unique', 'update', 'using', 'values', 'when', 'where',
  'with', 'without', 'time', 'zone', 'identity', 'serial', 'true', 'false',
])

function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let i = 0
  const add = (text: string, kind: SqlToken['kind']) => {
    if (!text) return
    const previous = tokens[tokens.length - 1]
    if (previous?.kind === kind) previous.text += text
    else tokens.push({ text, kind })
  }
  while (i < sql.length) {
    const start = i
    const current = sql[i]
    const next = sql[i + 1]

    if (current === '-' && next === '-') {
      i += 2
      while (i < sql.length && sql[i] !== '\n') i++
      add(sql.slice(start, i), 'comment')
    } else if (current === '/' && next === '*') {
      i += 2
      let depth = 1
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2 }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2 }
        else i++
      }
      add(sql.slice(start, i), 'comment')
    } else if (current === '$' && /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.test(sql.slice(i))) {
      const delimiter = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0] ?? '$$'
      i += delimiter.length
      const end = sql.indexOf(delimiter, i)
      i = end < 0 ? sql.length : end + delimiter.length
      add(sql.slice(start, i), 'string')
    } else if (current === "'" || current === '"') {
      i++
      while (i < sql.length) {
        if (sql[i] === current && sql[i + 1] === current) i += 2
        else if (sql[i] === current) { i++; break }
        else if (current === "'" && sql[i] === '\\' && i + 1 < sql.length) i += 2
        else i++
      }
      add(sql.slice(start, i), current === "'" ? 'string' : 'identifier')
    } else if (/[A-Za-z_]/.test(current)) {
      i++
      while (i < sql.length && /[A-Za-z0-9_$]/.test(sql[i])) i++
      const word = sql.slice(start, i)
      add(word, SQL_KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'plain')
    } else if (/[0-9]/.test(current)) {
      i++
      while (i < sql.length && /[0-9.eE+-]/.test(sql[i])) i++
      add(sql.slice(start, i), 'number')
    } else {
      i++
      add(current, 'plain')
    }
  }
  return tokens
}

function splitSqlLines(tokens: SqlToken[]) {
  const lines: SqlToken[][] = [[]]
  for (const token of tokens) {
    const parts = token.text.split('\n')
    parts.forEach((part, index) => {
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind })
      if (index < parts.length - 1) lines.push([])
    })
  }
  return lines
}

const tokenClass: Record<SqlToken['kind'], string> = {
  keyword: 'text-[#3456c7] dark:text-[#8da8ff] font-medium',
  string: 'text-[#a45b28] dark:text-[#e6a877]',
  comment: 'text-[#88909b] dark:text-[#7c8796] italic',
  identifier: 'text-[#5d6470] dark:text-[#c4cad3]',
  number: 'text-[#73713a] dark:text-[#d0c77a]',
  plain: 'text-[#3f4650] dark:text-[#d4d8df]',
}

export function TableDefinitionView({ selectedTable }: TableDefinitionViewProps) {
  const router = useRouter()
  const { database } = useStudio()
  const { notify } = useNotifications()
  const schema = selectedTable.schema
  const table = selectedTable.name
  const [sql, setSql] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [handoffError, setHandoffError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoading(true)
    setSql(null)
    setError('')
    setHandoffError('')
    api<DefinitionResponse>(
      `/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/definition`,
      { signal: controller.signal },
    ).then(result => {
      if (!current) return
      setSql(result.sql)
      setLoading(false)
    }).catch(cause => {
      if (!current || controller.signal.aborted) return
      setError(errorMessage(cause))
      setLoading(false)
    })
    return () => {
      current = false
      controller.abort()
    }
  }, [database, schema, table, attempt])

  const lines = useMemo(() => splitSqlLines(tokenizeSql(sql ?? '')), [sql])

  function openInSqlEditor() {
    if (sql === null) return
    try {
      queueSqlEditorDraft({ database, name: `Definition of ${schema}.${table}`, sql })
      router.push('/sql')
    } catch (cause) {
      const message = `Could not open SQL Editor: ${errorMessage(cause)}`
      setHandoffError(message)
      notify(message, 'error')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-surface-100 text-foreground" aria-label="Table SQL definition">
      <header className="flex h-11 min-h-11 items-center border-b border-default px-3">
        <h2 className="text-[16px] font-normal tracking-tight text-foreground">
          SQL Definition of {table}
          <span className="ml-2 text-[14px] font-normal text-foreground-lighter">(Read only)</span>
        </h2>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <button
          type="button"
          onClick={openInSqlEditor}
          disabled={sql === null}
          className="absolute right-2 top-2 z-10 rounded-[9px] border border-default bg-white px-2.5 py-1 text-[12px] font-normal text-foreground shadow-sm transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-100"
          aria-label="Open in SQL Editor"
          data-testid="open-sql-editor"
        >
          Open in SQL Editor
        </button>

        {loading ? (
          <LoadingIndicator label="Loading table definition" className="min-h-40 flex-1 text-foreground-muted" />
        ) : error ? (
          <div className="grid flex-1 place-items-center p-6">
            <div className="max-w-md space-y-3 text-center">
              <p role="alert" className="text-sm text-red-600 dark:text-red-400" data-testid="definition-error">{error}</p>
              <button
                type="button"
                onClick={() => setAttempt(value => value + 1)}
                className="rounded-md border border-default bg-surface-100 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                data-testid="retry-definition"
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div
            role="textbox"
            aria-label="SQL definition"
            aria-readonly="true"
            aria-multiline="true"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-auto bg-white py-2 pr-4 text-[13px] leading-[19px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:bg-surface-100 max-[640px]:pt-11"
            data-testid="sql-definition"
          >
            <div className="min-w-max font-mono">
              {lines.map((line, index) => (
                <div className="flex min-h-[19px] w-full leading-[19px]" key={index}>
                  <span aria-hidden="true" className="sticky left-0 w-10 shrink-0 select-none bg-white pr-3 text-right text-[#4b9e9a] dark:bg-surface-100 dark:text-[#72c5bd]">
                    {index + 1}
                  </span>
                  <span data-sql-line className="whitespace-pre pl-4">
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} className={tokenClass[token.kind]}>{token.text}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {handoffError && <p role="alert" className="border-t border-default px-4 py-2 text-xs text-red-600 dark:text-red-400" data-testid="sql-handoff-error">{handoffError}</p>}
      </div>
    </section>
  )
}
