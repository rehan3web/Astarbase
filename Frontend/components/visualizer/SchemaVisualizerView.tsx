'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, useNodesState, useEdgesState, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// @ts-ignore dagre has no bundled type declarations
import dagre from 'dagre'
import { Key, RefreshCw } from 'lucide-react'
import { api, Diagram, SchemaNode, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useTheme } from '@/components/providers/ThemeProvider'

type TableNode = Node<{ table: SchemaNode }, 'table'>
function TableCard({ data }: NodeProps<TableNode>) {
  const table = data.table
  return <div className="w-72 rounded-lg border border-default bg-studio shadow-lg text-xs">
    <h3 className="px-4 py-3 border-b border-default font-semibold"><span className="text-foreground-lighter">{table.schema}.</span>{table.name}</h3>
    {table.columns.map(c => <div key={c.name} className="relative flex justify-between gap-4 px-4 py-2 border-b border-default last:border-0">
      <Handle type="target" position={Position.Left} id={`target-${c.name}`} className="!bg-sky-400" />
      <span className="flex items-center gap-2">{table.primaryKey.includes(c.name) && <Key size={11} className="text-amber-500" />}{c.name}{c.nullable && <span className="text-foreground-muted">?</span>}</span><span className="text-foreground-lighter font-mono">{c.type}</span>
      <Handle type="source" position={Position.Right} id={`source-${c.name}`} className="!bg-sky-400" />
    </div>)}
  </div>
}
const nodeTypes = { table: TableCard }
export function SchemaVisualizerView() {
  const { database } = useStudio()
  const { theme } = useTheme()
  const [diagram, setDiagram] = useState<Diagram | null>(null)
  const [schema, setSchema] = useState('*')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try { const result = await api<Diagram>(`/databases/${encodeURIComponent(database)}/schema`, { signal }); if (!signal?.aborted) setDiagram(result) }
    catch (e) { if (!signal?.aborted) setError(errorMessage(e)) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    setDiagram(null); setSchema('*')
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  const schemas = useMemo(() => [...new Set(diagram?.nodes.map(n => n.schema) || [])], [diagram])
  useEffect(() => {
    const included = new Set((diagram?.nodes || []).filter(n => schema === '*' || n.schema === schema).map(n => n.id))
    // Include referenced tables from other schemas so cross-schema FKs remain visible.
    for (const e of diagram?.edges || []) if (included.has(e.source)) included.add(e.target)
    const visible = (diagram?.nodes || []).filter(n => included.has(n.id))
    const relationships = (diagram?.edges || []).filter(e => included.has(e.source) && included.has(e.target))
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
    graph.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 150 })
    visible.forEach(n => graph.setNode(n.id, { width: 288, height: 48 + n.columns.length * 34 }))
    relationships.forEach(e => graph.setEdge(e.source, e.target))
    dagre.layout(graph)
    setNodes(visible.map(table => {
      const point = graph.node(table.id)
      return { id: table.id, type: 'table', position: { x: point.x - 144, y: point.y - (48 + table.columns.length * 34) / 2 }, data: { table } }
    }))
    setEdges(relationships.map(e => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: `source-${e.source_columns[0]}`, targetHandle: `target-${e.target_columns[0]}`,
      label: `${e.source_columns.join(', ')} → ${e.target_columns.join(', ')}`,
      style: { stroke: '#38bdf8', strokeWidth: 1.5 }, animated: false,
    })))
  }, [diagram, schema, setNodes, setEdges])
  return <div className="flex flex-col h-full">
    <header className="border-b border-default p-4 flex gap-4 items-center text-sm"><h1 className="font-semibold">Schema visualizer</h1><code className="text-xs text-foreground-lighter">{database}</code>
      <select aria-label="Schema" value={schema} onChange={e => setSchema(e.target.value)} className="border border-default bg-studio rounded px-2 py-1"><option value="*">All schemas</option>{schemas.map(s => <option key={s}>{s}</option>)}</select>
      <button disabled={loading} onClick={() => load()} className="border border-default rounded px-3 py-1 flex gap-2 items-center"><RefreshCw size={14} />Refresh</button>
      <span className="text-xs text-foreground-lighter">{nodes.length} tables · {edges.length} relationships</span>
    </header>
    {error && <p role="alert" className="p-4 text-sm text-red-400">{error}</p>}
    {loading && <p className="p-4 text-sm text-foreground-lighter">Reading live database catalog…</p>}
    {!loading && !error && !nodes.length && <p className="p-8 text-sm text-foreground-lighter">No tables in this database yet. Create tables using the table editor or SQL runner.</p>}
    <div className="flex-1 min-h-0"><ReactFlow key={`${database}:${schema}:${nodes.length}:${edges.length}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView fitViewOptions={{ padding: 0.2 }} colorMode={theme === 'dark' ? 'dark' : 'light'}><Background /><Controls /><MiniMap /></ReactFlow></div>
  </div>
}
