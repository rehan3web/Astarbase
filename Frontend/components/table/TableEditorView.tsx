'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errorMessage, qi, literal, tablePath, TableRows, SqlResponse } from '@/lib/api'
import { liveTable, createTableSql } from '@/lib/live-tables'
import type { TableDefinition } from '@/lib/mock-data'
import { useStudio } from '@/components/providers/StudioProvider'
import { TableExplorer, TableAction } from './explorer/TableExplorer'
import { TableDataGrid, ColumnAction } from './editor/TableDataGrid'
import { TableDefinitionView } from './editor/TableDefinitionView'
import { InsertTableModal } from './insert/InsertTableModal'
import { InsertRowModal } from './insert/InsertRowModal'
import { InsertColumnModal } from './insert/InsertColumnModal'

type Summary = { schema: string; name: string; estimated_rows: string; rls_enabled?: boolean }
type ColumnValues = { name: string; type: string; defaultValue: string; isNullable: boolean; isArray?: boolean; isPrimaryKey?: boolean; description?: string }
const blankColumn: ColumnValues = { name: '', type: 'text', defaultValue: '', isNullable: true, isPrimaryKey: false }
export function TableEditorView() {
  const { database, settings } = useStudio()
  const [tables, setTables] = useState<Summary[]>([])
  const [schema, setSchema] = useState('public')
  const [selected, setSelected] = useState<Summary | null>(null)
  const [data, setData] = useState<TableRows | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(settings?.defaultRowLimit || 100)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState('')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [definition, setDefinition] = useState(false)
  const [insertTable, setInsertTable] = useState(false)
  const [insertRow, setInsertRow] = useState(false)
  const [insertColumn, setInsertColumn] = useState(false)
  const [rowValues, setRowValues] = useState<Record<string, unknown>>({})
  const [columnValues, setColumnValues] = useState(blankColumn)
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [frozenColumns, setFrozenColumns] = useState<Set<string>>(new Set())
  const version = useRef(0)
  const table = data ? liveTable(data) : null
  const schemas = [...new Set(['public', ...tables.map(t => t.schema)])]
  const summaries = tables.filter(t => t.schema === schema && t.name.toLowerCase().includes(search.toLowerCase())).map(t => ({
    id: JSON.stringify([t.schema, t.name]), schema: t.schema, name: t.name,
    estimatedRowCount: Number(t.estimated_rows), columns: [], rows: [],
  } as TableDefinition))
  const loadTables = useCallback(async (signal?: AbortSignal) => {
    const list = await api<Summary[]>(`/databases/${encodeURIComponent(database)}/tables`, { signal })
    setTables(list)
    return list
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    version.current++
    setSelected(null); setData(null); setOffset(0); setError(''); setNotice(''); setTables([]); setFrozenColumns(new Set())
    loadTables(controller.signal).then(list => { if (!controller.signal.aborted && list[0]) { setSelected(list[0]); setSchema(list[0].schema) } })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => controller.abort()
  }, [loadTables])
  const loadRows = useCallback(async (signal?: AbortSignal) => {
    if (!selected) return
    const current = ++version.current
    setLoading(true); setError(''); setData(null); setSelectedRows(new Set())
    try {
      const result = await api<TableRows>(`${tablePath(database, selected.schema, selected.name)}?limit=${limit}&offset=${offset}`, { signal })
      if (current === version.current && !signal?.aborted) setData(result)
    } catch (e) { if (current === version.current && !signal?.aborted) setError(errorMessage(e)) }
    finally { if (current === version.current && !signal?.aborted) setLoading(false) }
  }, [database, selected, offset, limit])
  useEffect(() => { const controller = new AbortController(); void loadRows(controller.signal); return () => controller.abort() }, [loadRows])
  const rows = useMemo(() => {
    const list = [...(data?.rows || [])].filter(r => !filter || Object.values(r).some(v => JSON.stringify(v)?.toLowerCase().includes(filter.toLowerCase())))
    if (sortColumn) list.sort((a, b) => String(a[sortColumn] ?? '').localeCompare(String(b[sortColumn] ?? ''), undefined, { numeric: true }) * (direction === 'asc' ? 1 : -1))
    return list
  }, [data, filter, sortColumn, direction])
  const key = (row: Record<string, unknown>) => {
    if (!data?.primaryKey.length) throw new Error('This table has no primary key. Use SQL to edit it safely.')
    return Object.fromEntries(data.primaryKey.map(k => [k, row[k]]))
  }
  async function mutate(fn: () => Promise<unknown>, message: string) {
    if (busy) return false
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice(message); return true }
    catch (e) { setError(errorMessage(e)); return false }
    finally { setBusy(false) }
  }
  async function sql(query: string) {
    return api<SqlResponse>('/sql', { method: 'POST', body: { database, sql: query } })
  }
  const name = table ? `${qi(table.schema)}.${qi(table.name)}` : ''
  async function refresh() { await loadTables(); await loadRows() }
  async function cell(rowIdx: number, column: string, value: unknown) {
    if (!data) return
    let parsed = value
    const col = data.columns.find(c => c.name === column)
    try { if (col && ['json', 'jsonb'].includes(col.udt_name) && typeof value === 'string') parsed = JSON.parse(value) }
    catch { setError('Enter valid JSON for this column'); return }
    await mutate(async () => {
      await api(tablePath(database, data.schema, data.name), { method: 'PATCH', body: { key: key(rows[rowIdx]), changes: { [column]: parsed } } })
      await loadRows()
    }, 'Row saved to Postgres')
  }
  async function removeRows() {
    if (!data || !window.confirm(`Delete ${selectedRows.size} selected rows from ${data.schema}.${data.name}?`)) return
    await mutate(async () => {
      for (const index of selectedRows) await api(tablePath(database, data.schema, data.name), { method: 'DELETE', body: { key: key(rows[Number(index)]) } })
      await loadRows()
    }, 'Selected rows deleted')
  }
  async function tableAction(target: TableDefinition, action: TableAction) {
    if (action === 'copy-name') { await navigator.clipboard.writeText(target.name); return }
    if (action !== 'delete') { setError('Use the SQL editor for schema export, duplication, policies or table settings. No local-only changes are made.'); return }
    if (!window.confirm(`Permanently DROP TABLE ${target.schema}.${target.name}?`)) return
    await mutate(async () => {
      await sql(`DROP TABLE ${qi(target.schema)}.${qi(target.name)};`)
      setSelected(null); setData(null); await loadTables()
    }, 'Table deleted')
  }
  async function columnAction(column: NonNullable<typeof table>['columns'][number], action: ColumnAction) {
    if (action === 'sort-asc' || action === 'sort-desc') { setSortColumn(column.name); setDirection(action === 'sort-asc' ? 'asc' : 'desc'); setSelectedRows(new Set()); return }
    if (action === 'copy-name') { await navigator.clipboard.writeText(column.name); return }
    if (action === 'toggle-freeze') {
      setFrozenColumns(prev => { const next = new Set(prev); next.has(column.id) ? next.delete(column.id) : next.add(column.id); return next })
      return
    }
    if (action === 'edit') {
      setEditingColumn(column.name)
      setColumnValues({ name: column.name, type: column.dataType, defaultValue: column.defaultValue || '', isNullable: column.isNullable, isPrimaryKey: column.isPrimaryKey })
      setInsertColumn(true); return
    }
    if (action === 'delete' && window.confirm(`Permanently delete column ${column.name} and its data?`)) {
      await mutate(async () => { await sql(`ALTER TABLE ${name} DROP COLUMN ${qi(column.name)};`); await refresh() }, 'Column deleted')
    }
  }
  return <div className="flex h-full w-full overflow-hidden bg-studio">
    <TableExplorer selectedSchema={schema} schemas={schemas} onSelectSchema={s => { setSchema(s); setSelected(null); setData(null) }} tableSearch={search} onTableSearchChange={setSearch} filteredTables={summaries} selectedTable={table} onSelectTable={t => { setSelected({ schema: t.schema, name: t.name, estimated_rows: String(t.estimatedRowCount) }); setOffset(0); setFilter('') }} onNewTable={() => setInsertTable(true)} onTableAction={tableAction} />
    <section className="flex flex-col min-w-0 flex-1">
      <div className="flex gap-3 items-center p-3 border-b border-default flex-wrap text-xs">
        <strong>{selected ? `${selected.schema}.${selected.name}` : 'Tables'}</strong>
        <button disabled={busy} onClick={() => refresh().catch(e => setError(errorMessage(e)))} className="border border-default rounded px-3 py-1">Refresh</button>
        {table && <>
          <button disabled={busy} onClick={() => setInsertRow(true)} className="border border-default rounded px-3 py-1">Insert row</button>
          <button disabled={busy} onClick={() => { setEditingColumn(null); setColumnValues(blankColumn); setInsertColumn(true) }} className="border border-default rounded px-3 py-1">Add column</button>
          <button disabled={busy || !data?.editable || !selectedRows.size} onClick={removeRows} className="border border-default rounded px-3 py-1 disabled:opacity-40">Delete selected</button>
          <button onClick={() => setDefinition(!definition)} className="border border-default rounded px-3 py-1">{definition ? 'Data' : 'Definition'}</button>
          <input aria-label="Filter loaded page" placeholder="Filter this page…" className="border border-default bg-studio rounded px-2 py-1" value={filter} onChange={e => { setFilter(e.target.value); setSelectedRows(new Set()) }} />
        </>}
        {busy && <span>Saving…</span>}
      </div>
      {error && <div role="alert" className="p-3 text-sm text-red-400 border-b border-default">{error}</div>}
      {notice && <div role="status" className="p-2 text-xs text-brand-500">{notice}</div>}
      {loading ? <div className="p-8 text-foreground-lighter">Loading table from Postgres…</div> : !table ? <div className="p-10 text-sm text-foreground-lighter">{tables.length ? 'Select a table from the sidebar.' : 'No tables yet. Create a table or use the SQL editor.'}</div> : <>
        {!data?.editable && <p className="px-3 py-2 text-xs text-amber-500">No primary key: row editing/deletion is disabled. Inserts are available.</p>}
        {definition ? <TableDefinitionView selectedTable={table} /> :
          <TableDataGrid selectedTable={table} displayedRows={rows} selectedRowIds={selectedRows} onToggleSelectAll={() => setSelectedRows(selectedRows.size === rows.length ? new Set() : new Set(rows.map((_, i) => String(i))))} onToggleSelectRow={idx => setSelectedRows(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next })} onInsertColumn={() => setInsertColumn(true)} sortColumn={sortColumn} sortDirection={direction} frozenColumnIds={frozenColumns} onColumnAction={columnAction} onUpdateCell={data?.editable && !busy ? cell : undefined} hideFooter />}
        <div className="mt-auto flex gap-4 items-center border-t border-default p-3 text-xs">
          <span>{data?.total} total rows · {rows.length} shown</span>
          <select aria-label="Rows per page" className="bg-studio border border-default rounded" value={limit} onChange={e => { setLimit(Number(e.target.value)); setOffset(0) }}>{[...new Set([25, 50, 100, 250, 1000, limit])].sort((a,b) => a-b).map(n => <option key={n} value={n}>{n} per page</option>)}</select>
          <button disabled={offset === 0 || busy} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</button>
          <span>Page {Math.floor(offset / limit) + 1}</span>
          <button disabled={offset + limit >= Number(data?.total || 0) || busy} onClick={() => setOffset(offset + limit)}>Next</button>
        </div>
      </>}
    </section>
    <InsertTableModal open={insertTable} onOpenChange={setInsertTable} schemaName={schema} onInsertTable={async t => {
      const ok = await mutate(async () => { await sql(`BEGIN; ${createTableSql(t)} COMMIT;`); await loadTables(); setSelected({ schema: t.schema, name: t.name, estimated_rows: '0' }); setOffset(0) }, 'Table created')
      if (ok) setInsertTable(false)
    }} />
    {table && <>
      <InsertRowModal open={insertRow} onOpenChange={setInsertRow} selectedTable={table} newRowData={rowValues} onNewRowDataChange={setRowValues} onInsert={async keepOpen => {
        const ok = await mutate(async () => {
          const values = Object.fromEntries(Object.entries(rowValues).map(([key, value]) => {
            const col = data?.columns.find(c => c.name === key)
            return [key, col && ['json', 'jsonb'].includes(col.udt_name) && typeof value === 'string' ? JSON.parse(value) : value]
          }))
          await api(tablePath(database, table.schema, table.name), { method: 'POST', body: { values } }); await loadRows()
        }, 'Row inserted')
        if (ok) { setRowValues({}); if (!keepOpen) setInsertRow(false) }
      }} />
      <InsertColumnModal open={insertColumn} onOpenChange={setInsertColumn} selectedTable={table} newColumnData={columnValues} onNewColumnDataChange={setColumnValues} mode={editingColumn ? 'edit' : 'create'} onInsert={async keepOpen => {
        const c = columnValues
        const target = qi(c.name)
        const type = c.type + (c.isArray && !c.type.endsWith('[]') ? '[]' : '')
        if (editingColumn && !!c.isPrimaryKey !== !!data?.primaryKey.includes(editingColumn)) {
          setError('Use the SQL editor to change existing primary-key constraints. No changes were made.')
          return
        }
        let statement = `ALTER TABLE ${name} ADD COLUMN ${target} ${type}${c.isNullable ? '' : ' NOT NULL'}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}${c.isPrimaryKey ? ' PRIMARY KEY' : ''};`
        if (editingColumn) {
          statement = editingColumn === c.name ? '' : `ALTER TABLE ${name} RENAME COLUMN ${qi(editingColumn)} TO ${target};`
          statement += `ALTER TABLE ${name} ALTER COLUMN ${target} TYPE ${type} USING ${target}::${type}; ALTER TABLE ${name} ALTER COLUMN ${target} ${c.isNullable ? 'DROP' : 'SET'} NOT NULL; ALTER TABLE ${name} ALTER COLUMN ${target} ${c.defaultValue ? `SET DEFAULT ${c.defaultValue}` : 'DROP DEFAULT'};`
        }
        if (c.description !== undefined) statement += `COMMENT ON COLUMN ${name}.${target} IS ${literal(c.description)};`
        const ok = await mutate(async () => { await sql(`BEGIN; ${statement} COMMIT;`); await refresh() }, 'Column saved')
        if (ok) { setColumnValues(blankColumn); if (!keepOpen) setInsertColumn(false) }
      }} />
    </>}
  </div>
}
