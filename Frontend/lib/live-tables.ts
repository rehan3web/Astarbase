import type { TableDefinition } from './mock-data'
import type { SchemaNode, SchemaEdge, TableRows } from './api'
import { qi, literal } from './api'
import { foreignKeyReferenceSql } from './foreign-keys'

export function liveTable(node: SchemaNode | TableRows, edges: SchemaEdge[] = []): TableDefinition {
  return {
    id: JSON.stringify([node.schema, node.name]), schema: node.schema, name: node.name,
    estimatedRowCount: 'total' in node ? Number(node.total) : 0,
    rows: 'rows' in node ? node.rows : [],
    columns: node.columns.map(c => {
      const edge = edges.find(e => e.source_schema === node.schema && e.source_table === node.name && e.source_columns.includes(c.name))
      return {
        id: c.name, name: c.name, format: c.udt_name, dataType: c.type, isNullable: c.nullable,
        defaultValue: c.default, isPrimaryKey: node.primaryKey.includes(c.name),
        foreignKey: edge ? { targetSchema: edge.target_schema, targetTable: edge.target_table, targetColumn: edge.target_columns[edge.source_columns.indexOf(c.name)] } : undefined,
      }
    }),
  }
}
export function createTableSql(table: TableDefinition) {
  const primary = table.columns.filter(c => c.isPrimaryKey).map(c => qi(c.name))
  const columns = table.columns.map(c => {
    const reference = c.foreignKey
    const foreignKey = !reference ? '' : reference.onDelete !== undefined || reference.onUpdate !== undefined
      ? ` ${foreignKeyReferenceSql({
        targetSchema: reference.targetSchema || table.schema,
        targetTable: reference.targetTable,
        targetColumn: reference.targetColumn,
        onDelete: reference.onDelete ?? 'NO ACTION',
        onUpdate: reference.onUpdate ?? 'NO ACTION',
      })}`
      : ` REFERENCES ${qi(reference.targetSchema || table.schema)}.${qi(reference.targetTable)}(${qi(reference.targetColumn)})`
    return `${qi(c.name)} ${c.dataType || c.format}${c.isNullable ? '' : ' NOT NULL'}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}${c.isUnique ? ' UNIQUE' : ''}${foreignKey}`
  })
  if (primary.length) columns.push(`PRIMARY KEY (${primary.join(',')})`)
  const name = `${qi(table.schema)}.${qi(table.name)}`
  return `CREATE TABLE ${name} (${columns.join(',')});${table.comment ? ` COMMENT ON TABLE ${name} IS ${literal(table.comment)};` : ''}${table.rlsEnabled ? ` ALTER TABLE ${name} ENABLE ROW LEVEL SECURITY;` : ''}`
}
