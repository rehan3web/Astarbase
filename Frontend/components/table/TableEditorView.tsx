'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage, qi, literal, tablePath, TableRows, SqlResponse } from '@/lib/api'
import { liveTable, createTableSql } from '@/lib/live-tables'
import type { TableDefinition } from '@/lib/mock-data'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { TableExplorer, TableAction } from './explorer/TableExplorer'
import { TableToolbar } from './editor/TableToolbar'
import { TableDataGrid, ColumnAction } from './editor/TableDataGrid'
import { TableFooter } from './editor/TableFooter'
import { TableDefinitionView } from './editor/TableDefinitionView'
import { InsertTableModal } from './insert/InsertTableModal'
import { InsertRowModal } from './insert/InsertRowModal'
import { InsertColumnModal } from './insert/InsertColumnModal'
import { DeleteTableModal } from './delete/DeleteTableModal'
import { DeleteRowsModal } from './delete/DeleteRowsModal'
import { EditTableModal, EditTableValues } from './edit/EditTableModal'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TableTabBar } from './tabs/TableTabBar'
import { TableNewTabView } from './tabs/TableNewTabView'
import { NEW_TAB_ID } from './tabs/TableTabBar'
import { LoadingIndicator, Spinner } from '@/components/ui/spinner'
import type { RecentTableItem } from './tabs/TableNewTabView'
import { foreignKeyReferenceSql, type ForeignKeyDraft } from '@/lib/foreign-keys'
import { copyText } from '@/lib/copy-text'

type Summary = { schema: string; name: string; estimated_rows: string; rls_enabled?: boolean }
type ColumnValues = { name: string; type: string; defaultValue: string; isNullable: boolean; isArray?: boolean; isPrimaryKey?: boolean; description?: string; foreignKey?: ForeignKeyDraft | null }
const blankColumn: ColumnValues = { name: '', type: 'text', defaultValue: '', isNullable: true, isPrimaryKey: false }
export function TableEditorView() {
  const router = useRouter()
  const { database, settings } = useStudio()
  const { notify } = useNotifications()
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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [sortColumn, setSortColumn] = useState('')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [definition, setDefinition] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState(NEW_TAB_ID)
  const [recentItems, setRecentItems] = useState<RecentTableItem[]>([])
  const [deleteTable, setDeleteTable] = useState<TableDefinition | null>(null)
  const [editTable, setEditTable] = useState<TableDefinition | null>(null)
  const [deleteRowsOpen, setDeleteRowsOpen] = useState(false)
  const [deleteColumn, setDeleteColumn] = useState<NonNullable<typeof table>['columns'][number] | null>(null)
  const [insertTable, setInsertTable] = useState(false)
  const [insertRow, setInsertRow] = useState(false)
  const [insertColumn, setInsertColumn] = useState(false)
  const [rowValues, setRowValues] = useState<Record<string, unknown>>({})
  const [columnValues, setColumnValues] = useState(blankColumn)
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [frozenColumns, setFrozenColumns] = useState<Set<string>>(new Set())
  const version = useRef(0)
  const table = data ? { ...liveTable(data), rlsEnabled: selected?.rls_enabled } : null
  const schemas = [...new Set(['public', ...tables.map(t => t.schema)])]
  const summaries = tables.map(t => ({
    id: JSON.stringify([t.schema, t.name]), schema: t.schema, name: t.name,
    estimatedRowCount: Number(t.estimated_rows), columns: [], rows: [], rlsEnabled: t.rls_enabled,
  } as TableDefinition))
  const loadTables = useCallback(async (signal?: AbortSignal) => {
    const list = await api<Summary[]>(`/databases/${encodeURIComponent(database)}/tables`, { signal })
    setTables(list)
    return list
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    version.current++
    setInsertColumn(false); setColumnValues(blankColumn); setEditingColumn(null)
    setSelected(null); setData(null); setOffset(0); setError(''); setTables([]); setFrozenColumns(new Set())
    loadTables(controller.signal).then(list => { if (!controller.signal.aborted && list[0]) { setSelected(list[0]); setSchema(list[0].schema); const id = JSON.stringify([list[0].schema, list[0].name]); setOpenTabs([id]); setActiveTab(id); setRecentItems([{ tableId: id, openedAt: Date.now() }]) } })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => controller.abort()
  }, [loadTables])
  const loadRows = useCallback(async (signal?: AbortSignal) => {
    if (!selected) return false
    const current = ++version.current
    setLoading(true); setError(''); setData(null); setSelectedRows(new Set())
    try {
      const result = await api<TableRows>(`${tablePath(database, selected.schema, selected.name)}?limit=${limit}&offset=${offset}`, { signal })
      if (current === version.current && !signal?.aborted) { setData(result); return true }
    } catch (e) { if (current === version.current && !signal?.aborted) setError(errorMessage(e)) }
    finally { if (current === version.current && !signal?.aborted) setLoading(false) }
    return false
  }, [database, selected, offset, limit])
  useEffect(() => { const controller = new AbortController(); void loadRows(controller.signal); return () => controller.abort() }, [loadRows])
  useEffect(() => {
    if (data && offset > 0 && offset >= Number(data.total)) {
      setOffset(Math.max(0, Math.ceil(Number(data.total) / limit) - 1) * limit)
    }
  }, [data, offset, limit])
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
    setBusy(true); setError('')
    try { await fn(); notify(message, 'success'); return true }
    catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error'); return false }
    finally { setBusy(false) }
  }
  async function sql(query: string) {
    return api<SqlResponse>('/sql', { method: 'POST', body: { database, sql: query } })
  }
  const name = table ? `${qi(table.schema)}.${qi(table.name)}` : ''
  const filteredTables = tables.filter(t => t.schema === schema && t.name.toLowerCase().includes(search.toLowerCase()))
  const lookupTable = (id: string) => summaries.find(t => t.id === id)
  function openTable(target: TableDefinition) {
    const id = JSON.stringify([target.schema, target.name])
    setSelected({ schema: target.schema, name: target.name, estimated_rows: String(target.estimatedRowCount), rls_enabled: target.rlsEnabled })
    setOffset(0); setFilter(''); setSelectedRows(new Set()); setActiveTab(id)
    setOpenTabs(prev => prev.includes(id) ? prev : prev.includes(NEW_TAB_ID) && activeTab === NEW_TAB_ID ? prev.map(x => x === NEW_TAB_ID ? id : x) : [...prev, id])
    setRecentItems(prev => [{ tableId: id, openedAt: Date.now() }, ...prev.filter(item => item.tableId !== id)].slice(0, 10))
  }
  function activateTab(id: string) {
    setActiveTab(id)
    if (id === NEW_TAB_ID) { setSelected(null); setData(null); return }
    const target = lookupTable(id)
    if (target) { setSelected({ schema: target.schema, name: target.name, estimated_rows: String(target.estimatedRowCount), rls_enabled: target.rlsEnabled }); setOffset(0); setFilter('') }
  }
  function closeTab(id: string) {
    const index = openTabs.indexOf(id)
    if (index < 0) return
    const next = openTabs.filter(x => x !== id)
    if (!next.length) next.push(NEW_TAB_ID)
    setOpenTabs(next)
    if (activeTab === id) activateTab(next[Math.min(index, next.length - 1)])
  }
  function newTab() {
    setOpenTabs(prev => prev.includes(NEW_TAB_ID) ? prev : [...prev, NEW_TAB_ID])
    setActiveTab(NEW_TAB_ID); setSelected(null); setData(null)
  }
  const pickedRows = [...selectedRows].map(i => rows[Number(i)]).filter((r): r is Record<string, unknown> => !!r)
  function download(content: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
  }
  function csv(rowsToExport: Record<string, unknown>[]) {
    if (!data) return ''
    const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    return [data.columns.map(c => quote(c.name)).join(','), ...rowsToExport.map(r => data.columns.map(c => quote(r[c.name])).join(','))].join('\n')
  }
  async function copySelected(kind: 'csv' | 'json' | 'sql') {
    if (!table || !data) return
    const selected = pickedRows
    let content = kind === 'csv' ? csv(selected) : JSON.stringify(selected, null, 2)
    if (kind === 'sql') content = selected.map(row => `INSERT INTO ${qi(data.schema)}.${qi(data.name)} (${data.columns.map(c => qi(c.name)).join(', ')}) VALUES (${data.columns.map(c => row[c.name] === null || row[c.name] === undefined ? 'NULL' : typeof row[c.name] === 'number' || typeof row[c.name] === 'boolean' ? String(row[c.name]) : literal(String(row[c.name]))).join(', ')});`).join('\n')
    try { await copyText(content); notify(`Copied ${selected.length} selected row${selected.length === 1 ? '' : 's'} as ${kind.toUpperCase()}.`) } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') }
  }
  async function refresh(announce = false) {
    try {
      await loadTables()
      const rowsLoaded = await loadRows()
      if (!rowsLoaded) throw new Error('Table rows could not be refreshed')
      if (announce) notify('Tables refreshed')
    }
    catch (e) {
      const message = errorMessage(e)
      setError(message)
      if (announce) notify(message, 'error')
      else throw e
    }
  }
  async function cell(rowIdx: number, column: string, value: unknown) {
    if (!data) return
    let parsed = value
    const col = data.columns.find(c => c.name === column)
    try { if (col && ['json', 'jsonb'].includes(col.udt_name) && typeof value === 'string') parsed = JSON.parse(value) }
    catch { setError('Enter valid JSON for this column'); notify('Enter valid JSON for this column', 'error'); return }
    await mutate(async () => {
      await api(tablePath(database, data.schema, data.name), { method: 'PATCH', body: { key: key(rows[rowIdx]), changes: { [column]: parsed } } })
      await loadRows()
      }, 'Row updated')
  }
  async function removeRows() {
    if (!data || !selectedRows.size) return
    await mutate(async () => {
      for (const index of selectedRows) await api(tablePath(database, data.schema, data.name), { method: 'DELETE', body: { key: key(rows[Number(index)]) } })
      setSelectedRows(new Set()); await loadRows()
    }, 'Selected rows deleted')
  }
  async function tableAction(target: TableDefinition, action: TableAction) {
    if (action === 'copy-name') { try { await navigator.clipboard.writeText(target.name); notify(`Copied table name ${target.name}`) } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') }; return }
    if (action === 'delete') { setDeleteTable(target); return }
    if (action === 'copy-schema') {
      try {
        const detail = table?.schema === target.schema && table.name === target.name ? data! : await api<TableRows>(`${tablePath(database, target.schema, target.name)}?limit=1&offset=0`)
        await navigator.clipboard.writeText(createTableSql(liveTable(detail)))
        notify(`Copied live DDL for ${target.name}.`)
      } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') }
      return
    }
    if (action === 'export-csv' || action === 'export-json' || action === 'export-sql') {
      try {
        const detail = data?.schema === target.schema && data.name === target.name ? data : await api<TableRows>(`${tablePath(database, target.schema, target.name)}?limit=${limit}&offset=0`)
        const live = liveTable(detail)
        const content = action === 'export-csv'
          ? [detail.columns.map(c => `"${c.name}"`).join(','), ...detail.rows.map(row => detail.columns.map(c => `"${String(row[c.name] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n')
          : action === 'export-json' ? JSON.stringify(detail.rows, null, 2) : `${createTableSql(live)}\n\n${detail.rows.map(row => `INSERT INTO ${qi(target.schema)}.${qi(target.name)} (${detail.columns.map(c => qi(c.name)).join(', ')}) VALUES (${detail.columns.map(c => row[c.name] === null ? 'NULL' : typeof row[c.name] === 'number' || typeof row[c.name] === 'boolean' ? String(row[c.name]) : literal(String(row[c.name]))).join(', ')});`).join('\n')}`
        download(content, `${target.name}.${action === 'export-csv' ? 'csv' : action === 'export-json' ? 'json' : 'sql'}`, action === 'export-csv' ? 'text/csv' : action === 'export-json' ? 'application/json' : 'application/sql')
        notify(`Exported ${target.name} as ${action.slice(7).toUpperCase()}.`)
      } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') }
      return
    }
    if (action === 'edit') { setEditTable(target); return }
    if (action === 'duplicate') {
      const used = new Set(tables.filter(t => t.schema === target.schema).map(t => t.name))
      let copyName = `${target.name}_copy`
      for (let index = 2; used.has(copyName); index++) copyName = `${target.name}_copy${index}`
      await mutate(async () => {
        await sql(`BEGIN; CREATE TABLE ${qi(target.schema)}.${qi(copyName)} (LIKE ${qi(target.schema)}.${qi(target.name)} INCLUDING ALL); INSERT INTO ${qi(target.schema)}.${qi(copyName)} SELECT * FROM ${qi(target.schema)}.${qi(target.name)}; COMMIT;`)
        const next = await loadTables()
        const created = next.find(item => item.schema === target.schema && item.name === copyName)
        if (created) openTable({ ...target, id: JSON.stringify([created.schema, created.name]), name: created.name, rows: [], columns: [] })
      }, `Table duplicated as ${copyName}`)
    }
    if (action === 'view-policies') router.push(`/policies?schema=${encodeURIComponent(target.schema)}&table=${encodeURIComponent(target.name)}`)
  }
  async function columnAction(column: NonNullable<typeof table>['columns'][number], action: ColumnAction) {
    if (action === 'sort-asc' || action === 'sort-desc') { setSortColumn(column.name); setDirection(action === 'sort-asc' ? 'asc' : 'desc'); setSelectedRows(new Set()); return }
    if (action === 'copy-name') { try { await navigator.clipboard.writeText(column.name); notify(`Copied column name ${column.name}`) } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') }; return }
    if (action === 'toggle-freeze') {
      setFrozenColumns(prev => { const next = new Set(prev); next.has(column.id) ? next.delete(column.id) : next.add(column.id); return next })
      return
    }
    if (action === 'edit') {
      setEditingColumn(column.name)
      setColumnValues({ name: column.name, type: column.dataType, defaultValue: column.defaultValue || '', isNullable: column.isNullable, isPrimaryKey: column.isPrimaryKey })
      setInsertColumn(true); return
    }
    if (action === 'delete') setDeleteColumn(column)
  }
  return <div className="flex h-full w-full overflow-hidden bg-studio relative">
    {sidebarOpen && <TableExplorer selectedSchema={schema} schemas={schemas} onSelectSchema={s => { setSchema(s); const first = tables.find(t => t.schema === s); if (first) openTable(lookupTable(JSON.stringify([first.schema, first.name]))!); else newTab() }} tableSearch={search} onTableSearchChange={setSearch} filteredTables={filteredTables.map(t => ({ id: JSON.stringify([t.schema, t.name]), schema: t.schema, name: t.name, estimatedRowCount: Number(t.estimated_rows), columns: [], rows: [], rlsEnabled: t.rls_enabled } as TableDefinition))} selectedTable={activeTab === NEW_TAB_ID ? null : table} onSelectTable={openTable} onNewTable={() => setInsertTable(true)} onTableAction={tableAction} />}
    <section className="flex flex-col min-w-0 flex-1 overflow-hidden">
      <TableTabBar openTabIds={openTabs} activeTabId={activeTab} getTable={lookupTable} isSidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(v => !v)} onSelectTab={activateTab} onCloseTab={closeTab} onNewTab={newTab} onTableAction={(target, action) => void tableAction(target, action as TableAction)} />
      {activeTab === NEW_TAB_ID || !selected ? <TableNewTabView recentItems={recentItems} getTable={lookupTable} onCreateTable={() => setInsertTable(true)} onOpenTable={openTable} /> : table ? <>
         <TableToolbar selectedTable={table} selectedRowIds={selectedRows} filterSearch={filter} onFilterSearchChange={v => { setFilter(v); setSelectedRows(new Set()) }} sortColumn={sortColumn} onSortColumnChange={setSortColumn} sortDirection={direction} onSortDirectionChange={setDirection} onCopyCsv={() => void copySelected('csv')} onCopyJson={() => void copySelected('json')} onCopySql={() => void copySelected('sql')} onExportCsv={() => { try { download(csv(pickedRows), `${table.name}_selected.csv`, 'text/csv'); notify('Selected rows exported as CSV') } catch (e) { notify(errorMessage(e), 'error') } }} onExportJson={() => { try { download(JSON.stringify(pickedRows, null, 2), `${table.name}_selected.json`, 'application/json'); notify('Selected rows exported as JSON') } catch (e) { notify(errorMessage(e), 'error') } }} onDeleteSelected={() => setDeleteRowsOpen(true)} onAddRlsPolicy={() => router.push(`/policies?schema=${encodeURIComponent(table.schema)}&table=${encodeURIComponent(table.name)}`)} onRefresh={() => void refresh(true)} onInsertRow={() => setInsertRow(true)} onInsertColumn={() => { setEditingColumn(null); setColumnValues(blankColumn); setInsertColumn(true) }} />
         {busy && <div role="status" className="flex items-center gap-2 px-4 py-1 text-[11px] text-foreground-lighter border-b border-default"><Spinner size={14} decorative />Writing changes to Postgres…</div>}
        {error && <div role="alert" className="px-4 py-2 text-xs text-red-400 border-b border-default">{error}</div>}
         {loading ? <LoadingIndicator label="Loading table data" className="flex-1" size={26} /> : <>
          {!data?.editable && <p className="px-4 py-2 text-xs text-amber-500 border-b border-default">This table has no primary key; safe row edit and delete are unavailable. Inserts remain enabled.</p>}
          <div className="flex-1 min-h-0 overflow-auto">{definition ? <TableDefinitionView selectedTable={table} /> : <TableDataGrid selectedTable={table} displayedRows={rows} selectedRowIds={selectedRows} onToggleSelectAll={() => setSelectedRows(selectedRows.size === rows.length ? new Set() : new Set(rows.map((_, i) => String(i))))} onToggleSelectRow={idx => setSelectedRows(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next })} onInsertColumn={() => setInsertColumn(true)} sortColumn={sortColumn} sortDirection={direction} frozenColumnIds={frozenColumns} onColumnAction={columnAction} onUpdateCell={data?.editable && !busy ? cell : undefined} hideFooter />}</div>
          <TableFooter
            page={Math.floor(offset / limit) + 1}
            pageCount={Math.max(1, Math.ceil(Number(data?.total || 0) / limit))}
            pageSize={limit}
            recordCount={Number(data?.total || 0)}
            loading={busy || loading}
            view={definition ? 'definition' : 'data'}
            onPageChange={page => setOffset((page - 1) * limit)}
            onPageSizeChange={size => { setLimit(size); setOffset(0) }}
            onViewChange={view => setDefinition(view === 'definition')}
          />
        </>}</> : loading ? <LoadingIndicator label="Loading tables" className="flex-1" size={26} /> : error ? <div role="alert" className="m-5 rounded border border-destructive/30 p-4 text-sm text-red-400">{error}<button onClick={() => void loadTables().catch(e => setError(errorMessage(e)))} className="ml-3 underline">Retry</button></div> : <div className="p-10 text-sm text-foreground-lighter">{tables.length ? 'Select a table from the explorer or open a new tab.' : 'No tables in this schema. Create a table or use the SQL editor.'}</div>}
    </section>
    <InsertTableModal open={insertTable} onOpenChange={setInsertTable} schemaName={schema} onInsertTable={async t => {
      const ok = await mutate(async () => { await sql(`BEGIN; ${createTableSql(t)} COMMIT;`); await loadTables(); openTable(t); setOffset(0) }, 'Table created')
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
          notify('Changing an existing primary-key constraint is not supported here', 'error')
          return
        }
        let statement = `ALTER TABLE ${name} ADD COLUMN ${target} ${type}${c.isNullable ? '' : ' NOT NULL'}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}${c.isPrimaryKey ? ' PRIMARY KEY' : ''};`
        if (editingColumn) {
          statement = editingColumn === c.name ? '' : `ALTER TABLE ${name} RENAME COLUMN ${qi(editingColumn)} TO ${target};`
          statement += `ALTER TABLE ${name} ALTER COLUMN ${target} TYPE ${type} USING ${target}::${type}; ALTER TABLE ${name} ALTER COLUMN ${target} ${c.isNullable ? 'DROP' : 'SET'} NOT NULL; ALTER TABLE ${name} ALTER COLUMN ${target} ${c.defaultValue ? `SET DEFAULT ${c.defaultValue}` : 'DROP DEFAULT'};`
        }
        if (c.foreignKey) statement += `ALTER TABLE ${name} ADD FOREIGN KEY (${target}) ${foreignKeyReferenceSql(c.foreignKey)};`
        if (c.description !== undefined) statement += `COMMENT ON COLUMN ${name}.${target} IS ${literal(c.description)};`
        const ok = await mutate(async () => { await sql(`BEGIN; ${statement} COMMIT;`); await refresh() }, editingColumn ? 'Column updated' : 'Column created')
        if (ok) { setColumnValues(blankColumn); if (!keepOpen) setInsertColumn(false) }
      }} />
    </>}
    <DeleteTableModal open={!!deleteTable} onOpenChange={open => { if (!open) setDeleteTable(null) }} table={deleteTable} onConfirm={async (target, cascade) => {
      const ok = await mutate(async () => {
        await sql(`DROP TABLE ${qi(target.schema)}.${qi(target.name)}${cascade ? ' CASCADE' : ' RESTRICT'};`)
        setOpenTabs(prev => prev.filter(id => id !== target.id)); setRecentItems(prev => prev.filter(item => item.tableId !== target.id))
        if (selected?.schema === target.schema && selected.name === target.name) { setSelected(null); setData(null); setActiveTab(NEW_TAB_ID) }
        await loadTables()
      }, 'Table deleted')
      if (ok) setDeleteTable(null)
    }} />
    <DeleteRowsModal open={deleteRowsOpen} onOpenChange={setDeleteRowsOpen} rowCount={selectedRows.size} onConfirm={removeRows} />
    <Dialog open={!!deleteColumn} onOpenChange={open => { if (!open && !busy) setDeleteColumn(null) }}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-default"><DialogTitle className="text-sm font-medium">Delete column “{deleteColumn?.name}”?</DialogTitle></div>
        <div className="px-5 py-4"><DialogDescription className="text-sm text-foreground-light">This permanently drops the column and all values stored in it from <code>{data?.schema}.{data?.name}</code>.</DialogDescription></div>
        <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2"><Button variant="default" size="large" disabled={busy} onClick={() => setDeleteColumn(null)}>Cancel</Button><Button variant="destructive" size="large" disabled={busy || !deleteColumn} loading={busy} onClick={async () => {
          if (!deleteColumn) return
          const column = deleteColumn
          const ok = await mutate(async () => { await sql(`ALTER TABLE ${name} DROP COLUMN ${qi(column.name)};`); await refresh() }, 'Column deleted')
          if (ok) setDeleteColumn(null)
        }}>{busy ? 'Deleting…' : 'Delete column'}</Button></div>
      </DialogContent>
    </Dialog>
    <EditTableModal open={!!editTable} onOpenChange={open => { if (!open) setEditTable(null) }} table={editTable} existingNames={tables.filter(item => item.schema === editTable?.schema && item.name !== editTable?.name).map(item => item.name)} securityEditable={false} onSave={async (target, values: EditTableValues) => {
      const nextName = values.name.trim()
      await mutate(async () => {
        const statements: string[] = []
        if (nextName !== target.name) statements.push(`ALTER TABLE ${qi(target.schema)}.${qi(target.name)} RENAME TO ${qi(nextName)};`)
        if (values.comment) statements.push(`COMMENT ON TABLE ${qi(target.schema)}.${qi(nextName)} IS ${literal(values.comment)};`)
        if (statements.length) await sql(`BEGIN; ${statements.join(' ')} COMMIT;`)
        const next = await loadTables()
        if (selected?.schema === target.schema && selected.name === target.name) {
          const renamed = next.find(item => item.schema === target.schema && item.name === nextName)
          if (renamed) { setSelected(renamed); setData(null); const previousId = target.id; const nextId = JSON.stringify([renamed.schema, renamed.name]); setOpenTabs(tabs => tabs.map(id => id === previousId ? nextId : id)); setActiveTab(nextId) }
        }
      }, 'Table updated')
    }} />
  </div>
}
