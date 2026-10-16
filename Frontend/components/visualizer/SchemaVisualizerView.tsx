'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
// @ts-expect-error dagre is a JavaScript-only dependency without bundled declarations
import dagre from 'dagre'
import {
  ChevronDown,
  Copy,
  Diamond,
  Download,
  Fingerprint,
  Hash,
  Key,
  Link as LinkIcon,
  MoreVertical,
  Search,
  Table2 as TableIcon,
} from 'lucide-react'
import { SchemaSelector } from '@/components/ui/schema-selector'
import { useNotifications } from '@/components/providers/NotificationProvider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useStudio } from '@/components/providers/StudioProvider'
import { useTheme } from '@/components/providers/ThemeProvider'
import { api, Diagram, SchemaEdge, SchemaNode, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { copyText } from '@/lib/copy-text'

type TableNodeData = {
  table: SchemaNode
  foreignKeys: SchemaEdge[]
  isHighlighted?: boolean
  isDimmed?: boolean
}
type FlowTableNode = Node<TableNodeData, 'tableNode'>

// Original custom React Flow table node; only its metadata source is live.
function TableNode({ data }: NodeProps<FlowTableNode>) {
  const table = data.table
  const isHighlighted = data.isHighlighted
  const isDimmed = data.isDimmed

  return (
    <div
      className={cn(
        'w-72 rounded-lg border bg-studio shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden text-sm select-none transition-all duration-200',
        isHighlighted && 'ring-2 ring-brand-500 border-brand-500 scale-[1.02] z-20',
        isDimmed && 'opacity-35 grayscale-[50%]',
        !isHighlighted && !isDimmed && 'border-default'
      )}
    >
      {/* Table Header */}
      <div className="px-3 py-2.5 border-b border-default flex items-center justify-between">
        <div className="flex items-center gap-2.5 truncate">
          <TableIcon className="h-4 w-4 text-foreground-light shrink-0" strokeWidth={1.5} />
          <span className="text-foreground truncate">{table.name}</span>
        </div>
        <MoreVertical className="h-4 w-4 text-foreground-light shrink-0" />
      </div>

      {/* Columns list */}
      <div className="divide-y divide-default">
        {table.columns.map(column => {
          const isPrimaryKey = table.primaryKey.includes(column.name)
          const isForeignKey = data.foreignKeys.some(edge =>
            edge.source_schema === table.schema
            && edge.source_table === table.name
            && edge.source_columns.includes(column.name)
          )
          const isIdentity = isPrimaryKey && /^int/i.test(column.type)
          return (
            <div
              key={column.name}
              className="relative px-3 py-2 flex items-center justify-between gap-3 hover:bg-surface-100 transition-colors group"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`${table.name}-${column.name}-target`}
                className="!w-1.5 !h-1.5 !min-w-0 !min-h-0 !bg-foreground-muted !border-0 opacity-0 group-hover:opacity-100"
              />
              <div className="flex items-center gap-3 truncate">
                <div className="flex items-center gap-1.5 shrink-0 text-foreground-light">
                  {isPrimaryKey && <Key className="h-3.5 w-3.5 -rotate-45" strokeWidth={1.5} aria-label="Primary key" />}
                  {isForeignKey && <LinkIcon className="h-3.5 w-3.5" strokeWidth={1.5} aria-label="Foreign key" />}
                  <Diamond className={cn('h-3.5 w-3.5', !column.nullable && 'fill-current')} strokeWidth={1.5} aria-label={column.nullable ? 'Nullable' : 'Not null'} />
                  {isIdentity && <Hash className="h-3.5 w-3.5" strokeWidth={1.5} aria-label="Identity" />}
                  {isPrimaryKey && !isIdentity && <Fingerprint className="h-3.5 w-3.5" strokeWidth={1.5} aria-label="Primary key" />}
                </div>
                <span className="truncate text-foreground">{column.name}</span>
              </div>
              <span className="shrink-0 text-xs font-mono text-foreground-lighter">{column.type}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`${table.name}-${column.name}-source`}
                className="!w-1.5 !h-1.5 !min-w-0 !min-h-0 !bg-foreground-muted !border-0 opacity-0 group-hover:opacity-100"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const nodeTypes = { tableNode: TableNode }

function getLayoutedElements(nodes: FlowTableNode[], edges: Edge[], direction = 'LR') {
  try {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({ rankdir: direction, ranksep: 90, nodesep: 50 })

    nodes.forEach(node => {
      const columnCount = node.data?.table?.columns?.length || 4
      dagreGraph.setNode(node.id, { width: 300, height: 42 + columnCount * 37 })
    })
    edges.forEach(edge => dagreGraph.setEdge(edge.source, edge.target))
    dagre.layout(dagreGraph)

    const layoutedNodes = nodes.map(node => {
      const point = dagreGraph.node(node.id)
      return {
        ...node,
        position: {
          x: point.x - 150,
          y: point.y - (42 + (node.data?.table?.columns?.length || 4) * 37) / 2,
        },
      }
    })
    return { nodes: layoutedNodes, edges }
  } catch (error) {
    console.error('Dagre layout failed, using grid fallback:', error)
    const layoutedNodes = nodes.map((node, index) => ({
      ...node,
      position: { x: 50 + (index % 3) * 340, y: 50 + Math.floor(index / 3) * 280 },
    }))
    return { nodes: layoutedNodes, edges }
  }
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]!)
}

function generateMarkdown(tables: SchemaNode[], edges: SchemaEdge[], schemaName: string): string {
  const lines = [`# Schema: ${schemaName}\n`]
  tables.forEach(table => {
    lines.push(`### Table: \`${table.name}\`\n`, '| Column | Type | Key | Default |', '| :--- | :--- | :--- | :--- |')
    table.columns.forEach(column => {
      const relation = edges.find(edge =>
        edge.source_schema === table.schema
        && edge.source_table === table.name
        && edge.source_columns.includes(column.name)
      )
      const key = table.primaryKey.includes(column.name)
        ? '`PK`'
        : relation ? `\`FK → ${relation.target_table}.${relation.target_columns[relation.source_columns.indexOf(column.name)]}\`` : '-'
      const defaultValue = column.default ? `\`${column.default}\`` : '-'
      lines.push(`| **${column.name}** | \`${column.type}\` | ${key} | ${defaultValue} |`)
    })
    lines.push('')
  })
  return lines.join('\n')
}

function generateSchemaSvg(nodes: FlowTableNode[], edges: Edge[], isDark: boolean): { svgString: string; width: number; height: number } {
  const nodeWidth = 260
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  nodes.forEach(node => {
    const table = node.data?.table
    if (!table) return
    const nodeHeight = 40 + table.columns.length * 28 + 12
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + nodeWidth)
    maxY = Math.max(maxY, node.position.y + nodeHeight)
  })
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 800; maxY = 600 }

  const padding = 60
  const width = Math.max(maxX - minX + padding * 2, 400)
  const height = Math.max(maxY - minY + padding * 2, 300)
  const originX = minX - padding
  const originY = minY - padding
  const backgroundColor = isDark ? '#121212' : '#ffffff'
  const cardColor = isDark ? '#181818' : '#ffffff'
  const headerColor = isDark ? '#222222' : '#f3f4f6'
  const borderColor = isDark ? '#2e2e2e' : '#e5e7eb'
  const textColor = isDark ? '#f3f4f6' : '#111827'
  const mutedText = isDark ? '#888888' : '#6b7280'
  const edgeColor = '#38bdf8'
  const keyColor = '#f59e0b'

  const edgeElements = edges.map(edge => {
    const source = nodes.find(node => node.id === edge.source)
    const target = nodes.find(node => node.id === edge.target)
    if (!source || !target) return ''
    const sourceIndex = Math.max(0, source.data.table.columns.findIndex(column => `${source.data.table.name}-${column.name}-source` === edge.sourceHandle))
    const targetIndex = Math.max(0, target.data.table.columns.findIndex(column => `${target.data.table.name}-${column.name}-target` === edge.targetHandle))
    const sx = source.position.x + nodeWidth
    const sy = source.position.y + 40 + sourceIndex * 28 + 14
    const tx = target.position.x
    const ty = target.position.y + 40 + targetIndex * 28 + 14
    const dx = Math.max(Math.abs(tx - sx) * 0.45, 40)
    return `<path d="M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}" fill="none" stroke="${edgeColor}" stroke-width="2" stroke-linecap="round" opacity="0.85"/><circle cx="${sx}" cy="${sy}" r="3" fill="${edgeColor}"/><circle cx="${tx}" cy="${ty}" r="3" fill="${edgeColor}"/>`
  }).join('\n')

  const nodeElements = nodes.map(node => {
    const table = node.data.table
    const height = 40 + table.columns.length * 28 + 12
    const columnElements = table.columns.map((column, index) => {
      const y = 40 + index * 28
      const cy = y + 18
      const relation = node.data.foreignKeys.find(edge => edge.source_schema === table.schema && edge.source_table === table.name && edge.source_columns.includes(column.name))
      const keyLabel = table.primaryKey.includes(column.name) ? 'PK' : relation ? 'FK' : ''
      const labelColor = table.primaryKey.includes(column.name) ? keyColor : edgeColor
      return `<line x1="0" y1="${y}" x2="${nodeWidth}" y2="${y}" stroke="${borderColor}" stroke-width="1"/><text x="14" y="${cy}" font-family="monospace" font-size="11" fill="${table.primaryKey.includes(column.name) ? keyColor : textColor}" font-weight="${table.primaryKey.includes(column.name) ? 'bold' : 'normal'}">${escapeXml(column.name)}</text><text x="${nodeWidth - 14}" y="${cy}" font-family="sans-serif" font-size="10" text-anchor="end" fill="${mutedText}">${escapeXml(column.type)}${keyLabel ? ` <tspan fill="${labelColor}" font-weight="bold">${keyLabel}</tspan>` : ''}</text>`
    }).join('\n')
    return `<g transform="translate(${node.position.x}, ${node.position.y})"><rect width="${nodeWidth}" height="${height}" rx="8" fill="${cardColor}" stroke="${borderColor}" stroke-width="1.5"/><rect width="${nodeWidth}" height="38" rx="8" fill="${headerColor}" stroke="${borderColor}" stroke-width="1.5"/><rect y="30" width="${nodeWidth}" height="8" fill="${headerColor}"/><text x="14" y="24" font-family="monospace" font-size="12" font-weight="bold" fill="${textColor}">${escapeXml(table.name)}</text>${columnElements}</g>`
  }).join('\n')

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${originX} ${originY} ${width} ${height}"><rect x="${originX}" y="${originY}" width="${width}" height="${height}" fill="${backgroundColor}"/>${edgeElements}${nodeElements}</svg>`
  return { svgString, width, height }
}

function SchemaVisualizerInner() {
  const { database } = useStudio()
  const { notify } = useNotifications()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { fitView } = useReactFlow()
  const [diagram, setDiagram] = useState<Diagram | null>(null)
  const [selectedSchema, setSelectedSchema] = useState('public')
  const [searchQuery, setSearchQuery] = useState('')
  const [errorMessageText, setErrorMessageText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copyingSql, setCopyingSql] = useState(false)
  const copyRequest = useRef<AbortController | null>(null)
  const currentDatabase = useRef(database)
  currentDatabase.current = database
  useEffect(() => {
    setCopyingSql(false)
    return () => {
      copyRequest.current?.abort()
      copyRequest.current = null
    }
  }, [database])

  const loadSchema = useCallback(async (signal?: AbortSignal, announce = false) => {
    setIsLoading(true); setErrorMessageText('')
    try {
      const liveDiagram = await api<Diagram>(`/databases/${encodeURIComponent(database)}/schema`, { signal })
      if (!signal?.aborted) {
        setDiagram(liveDiagram)
        setSelectedSchema(current => liveDiagram.nodes.some(table => table.schema === current) ? current : liveDiagram.nodes[0]?.schema ?? 'public')
        if (announce) notify('Schema refreshed')
      }
    } catch (error) {
      if (!signal?.aborted) {
        const message = errorMessage(error)
        setErrorMessageText(message)
        if (announce) notify(message, 'error')
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [database, notify])
  useEffect(() => {
    const controller = new AbortController()
    void loadSchema(controller.signal)
    return () => controller.abort()
  }, [loadSchema])

  const liveDiagram = diagram?.database === database ? diagram : null
  const schemas = useMemo(() => [...new Set(liveDiagram?.nodes.map(table => table.schema) || [])], [liveDiagram])
  const schemaTables = useMemo(() => (liveDiagram?.nodes || []).filter(table => table.schema === selectedSchema), [liveDiagram, selectedSchema])
  const schemaEdges = useMemo(() => {
    const schemaIds = new Set(schemaTables.map(table => table.id))
    return (liveDiagram?.edges || []).filter(edge => schemaIds.has(edge.source) && schemaIds.has(edge.target))
  }, [liveDiagram, schemaTables])
  const initialNodes = useMemo<FlowTableNode[]>(() => schemaTables.map((table, index) => ({
    id: table.id,
    type: 'tableNode',
    position: { x: 50 + (index % 3) * 340, y: 50 + Math.floor(index / 3) * 280 },
    data: { table, foreignKeys: liveDiagram?.edges || [], isHighlighted: false, isDimmed: false },
  })), [schemaTables, liveDiagram])
  const initialEdges = useMemo<Edge[]>(() => schemaEdges.map(edge => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: `${edge.source_table}-${edge.source_columns[0]}-source`,
    target: edge.target,
    targetHandle: `${edge.target_table}-${edge.target_columns[0]}-target`,
    animated: true,
    style: { stroke: '#38bdf8', strokeWidth: 1.75 },
  })), [schemaEdges])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowTableNode>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges)

  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges)
    setNodes(layoutedNodes)
    setEdges(layoutedEdges)
    const timeout = window.setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 80)
    return () => window.clearTimeout(timeout)
  }, [selectedSchema, initialNodes, initialEdges, fitView, setNodes, setEdges])

  useEffect(() => {
    const query = searchQuery.trim().toLowerCase()
    setNodes(previousNodes => previousNodes.map(node => {
      const match = !!query && node.data.table.name.toLowerCase().includes(query)
      return { ...node, data: { ...node.data, isHighlighted: match, isDimmed: !!query && !match } }
    }))
  }, [searchQuery, setNodes])

  const handleAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges)
    setNodes([...layoutedNodes])
    setEdges([...layoutedEdges])
    window.setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
    notify('Schema layout arranged')
  }, [nodes, edges, fitView, setNodes, setEdges, notify])

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const query = searchQuery.trim().toLowerCase()
      if (!query) return
      const matchedNode = nodes.find(node => node.data.table.name.toLowerCase().includes(query))
      if (matchedNode) fitView({ nodes: [{ id: matchedNode.id }], duration: 500, padding: 0.8 })
    }
  }

  const handleCopyAsSql = useCallback(async () => {
    if (!liveDiagram || copyRequest.current) return
    const controller = new AbortController()
    copyRequest.current = controller
    setCopyingSql(true); setErrorMessageText('')
    try {
      const result = await api<{ database: string; sql: string }>(
        `/databases/${encodeURIComponent(database)}/schema/sql`, { signal: controller.signal },
      )
      if (controller.signal.aborted || currentDatabase.current !== database) return
      if (result.database !== database || typeof result.sql !== 'string' || !result.sql.trim()) throw new Error('No SQL schema was returned')
      await copyText(result.sql)
      if (!controller.signal.aborted && currentDatabase.current === database) notify('Copied SQL schema for all tables!')
    } catch (error) {
      if (!controller.signal.aborted && currentDatabase.current === database) {
        const message = errorMessage(error); setErrorMessageText(message); notify(message, 'error')
      }
    } finally {
      if (copyRequest.current === controller) { copyRequest.current = null; setCopyingSql(false) }
    }
  }, [database, liveDiagram, notify])

  const handleCopyAsMarkdown = useCallback(async () => {
    if (!liveDiagram) return
    try {
      await copyText(generateMarkdown(schemaTables, schemaEdges, selectedSchema))
      notify('Copied Markdown schema to clipboard!')
    } catch (error) { const message = errorMessage(error); setErrorMessageText(message); notify(message, 'error') }
  }, [liveDiagram, schemaTables, schemaEdges, selectedSchema, notify])

  const handleDownloadPng = useCallback(() => {
    try {
      const { svgString, width, height } = generateSchemaSvg(nodes, edges, isDark)
      const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
      const image = new Image()
      image.onload = () => {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = width * scale; canvas.height = height * scale
        const context = canvas.getContext('2d')
        if (context) {
          context.scale(scale, scale); context.drawImage(image, 0, 0)
          const anchor = document.createElement('a')
          anchor.href = canvas.toDataURL('image/png'); anchor.download = `${selectedSchema}-schema.png`
          document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor)
          notify('Downloaded schema as PNG')
        } else { setErrorMessageText('Could not render the schema diagram as PNG.'); notify('Could not render the schema diagram as PNG.', 'error') }
        URL.revokeObjectURL(url)
      }
      image.onerror = () => { URL.revokeObjectURL(url); setErrorMessageText('Could not render the schema diagram as PNG.'); notify('Could not render the schema diagram as PNG.', 'error') }
      image.src = url
    } catch (error) { const message = errorMessage(error); setErrorMessageText(message); notify(message, 'error') }
  }, [nodes, edges, isDark, selectedSchema, notify])

  const handleDownloadSvg = useCallback(() => {
    try {
      const { svgString } = generateSchemaSvg(nodes, edges, isDark)
      const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${selectedSchema}-schema.svg`
      document.body.appendChild(anchor); anchor.click(); document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      notify('Downloaded schema as SVG')
    } catch (error) { const message = errorMessage(error); setErrorMessageText(message); notify(message, 'error') }
  }, [nodes, edges, isDark, selectedSchema, notify])

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-studio relative">

      {/* Original top toolbar: schema selector, search, split SQL/export control, auto layout */}
      <div className="h-11 shrink-0 border-b border-default bg-dash-sidebar flex items-center justify-between px-4 z-10 select-none">
        <div className="flex items-center gap-2">
          <SchemaSelector selectedSchema={selectedSchema} onSelectSchema={setSelectedSchema} schemas={schemas.length ? schemas : ['public']} />
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-foreground-lighter pointer-events-none" />
            <input type="text" aria-label="Find table" placeholder="Find table..." value={searchQuery} onChange={event => setSearchQuery(event.target.value)} onKeyDown={handleSearchKeyDown} className="h-7 pl-8 pr-6 w-44 rounded-md border border-strong bg-surface-100 hover:bg-surface-200/50 focus:bg-surface-100 text-xs text-foreground placeholder:text-foreground-lighter focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors" />
            {searchQuery && <button type="button" aria-label="Clear table search" onClick={() => setSearchQuery('')} className="absolute right-2 text-foreground-lighter hover:text-foreground text-[10px] cursor-pointer">✕</button>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-strong bg-surface-100 overflow-hidden shadow-xs">
            <button type="button" onClick={() => void handleCopyAsSql()} disabled={!liveDiagram || copyingSql} className="h-7 px-2.5 flex items-center gap-1.5 text-xs font-medium text-foreground hover:bg-surface-200 transition-colors cursor-pointer disabled:opacity-50" title="Copy actual SQL schema for all tables in this database">
              <Copy className="h-3.5 w-3.5 text-foreground-light shrink-0" /><span>{copyingSql ? 'Copying…' : 'Copy as SQL'}</span>
            </button>
            <div className="w-[1px] h-4 bg-border-strong self-center" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="h-7 px-1.5 flex items-center justify-center text-foreground-light hover:text-foreground hover:bg-surface-200 transition-colors cursor-pointer" aria-label="More export options"><ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-overlay border border-overlay p-1 shadow-xl rounded-md">
                <DropdownMenuItem onSelect={() => void handleCopyAsMarkdown()} disabled={!liveDiagram} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded"><Copy className="h-3.5 w-3.5 text-foreground-lighter" /><span>Copy as Markdown</span></DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDownloadPng} disabled={!nodes.length} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded"><Download className="h-3.5 w-3.5 text-foreground-lighter" /><span>Download as PNG</span></DropdownMenuItem>
                <DropdownMenuItem onSelect={handleDownloadSvg} disabled={!nodes.length} className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded"><Download className="h-3.5 w-3.5 text-foreground-lighter" /><span>Download as SVG</span></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <button type="button" onClick={handleAutoLayout} className="h-7 px-3 text-xs font-medium text-foreground bg-surface-100 hover:bg-surface-200 border border-strong rounded-md transition-colors cursor-pointer shadow-xs">Auto layout</button>
        </div>
      </div>

      {errorMessageText && <div role="alert" className="flex items-center justify-between border-b border-default p-3 text-xs text-red-400">{errorMessageText}<button type="button" onClick={() => void loadSchema(undefined, true)} className="underline">Retry</button></div>}
      {isLoading && <div className="absolute top-14 left-4 z-10 rounded-md border border-default bg-surface-100/90 px-3 py-2 text-xs text-foreground-lighter">Loading live schema…</div>}
      {!isLoading && !errorMessageText && !nodes.length && <div className="absolute inset-0 top-11 z-10 grid place-items-center pointer-events-none"><div className="rounded-lg border border-default bg-surface-100/90 p-6 text-center text-sm text-foreground-lighter">{schemas.length ? 'No tables in this schema.' : 'No database tables found.'}<br /><span className="text-xs">Create tables in the Table Editor or run DDL in SQL Editor.</span></div></div>}

      {/* Original interactive entity-relationship canvas and bottom controls */}
      <div className="flex-1 w-full h-full relative bg-[#FAFAFA] dark:bg-[#121212]">
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2} colorMode={isDark ? 'dark' : 'light'} proOptions={{ hideAttribution: true }} className="!bg-transparent">
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? '#2e2e2e' : '#D1D5DB'} bgColor="transparent" />
          <Controls showInteractive={false} className="!shadow-none overflow-hidden rounded-md border border-default" />
          <MiniMap pannable zoomable bgColor={isDark ? '#171717' : '#ffffff'} nodeColor={isDark ? '#2e2e2e' : '#e5e7eb'} nodeStrokeColor={isDark ? '#3e3e3e' : '#d1d5db'} nodeBorderRadius={4} maskColor={isDark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(240, 240, 240, 0.6)'} className="!shadow-none overflow-hidden rounded-md border border-default" />
        </ReactFlow>
      </div>
    </div>
  )
}

export function SchemaVisualizerView() {
  return <ReactFlowProvider><SchemaVisualizerInner /></ReactFlowProvider>
}
