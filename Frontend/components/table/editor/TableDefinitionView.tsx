'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { PrimaryKeyIcon } from '@/components/ui/primary-key-icon'
import { TableDefinition } from '@/lib/mock-data'

interface TableDefinitionViewProps {
  selectedTable: TableDefinition
}

export function TableDefinitionView({ selectedTable }: TableDefinitionViewProps) {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 bg-studio">
      <div className="max-w-4xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground tracking-tight">
            Table Columns & Schema
          </h2>
          <p className="text-xs text-foreground-lighter">
            {selectedTable.comment || 'No table description provided.'}
          </p>
        </div>

        <div className="rounded-md border border-default bg-surface-100 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-200 border-b border-default text-foreground-lighter uppercase text-[10px] font-sans">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Data Type</th>
                <th className="px-4 py-2.5 font-medium">Format</th>
                <th className="px-4 py-2.5 font-medium">Key / Attributes</th>
                <th className="px-4 py-2.5 font-medium">Default Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {selectedTable.columns.map((c) => (
                <tr key={c.id} className="hover:bg-surface-200/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground flex items-center gap-2">
                    {c.isPrimaryKey && <PrimaryKeyIcon className="h-3.5 w-3.5 text-brand-500" />}
                    <span>{c.name}</span>
                  </td>
                  <td className="px-4 py-3 text-brand-400">{c.dataType}</td>
                  <td className="px-4 py-3 text-foreground-lighter">{c.format}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {c.isPrimaryKey && (
                        <Badge variant="brand">PRIMARY KEY</Badge>
                      )}
                      {!c.isNullable && (
                        <Badge variant="secondary">NOT NULL</Badge>
                      )}
                      {c.isUnique && (
                        <Badge variant="warning">UNIQUE</Badge>
                      )}
                      {c.foreignKey && (
                        <Badge variant="outline" className="text-brand-400">
                          FK → {c.foreignKey.targetTable}.{c.foreignKey.targetColumn}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground-muted font-mono">
                    {c.defaultValue || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
