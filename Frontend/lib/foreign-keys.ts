import { qi } from './api'

export const foreignKeyActions = ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'] as const
export type ForeignKeyAction = typeof foreignKeyActions[number]
export type ForeignKeyDraft = {
  targetSchema: string
  targetTable: string
  targetColumn: string
  onDelete: ForeignKeyAction
  onUpdate: ForeignKeyAction
}

export function foreignKeyReferenceSql(value: ForeignKeyDraft): string {
  if (![value.targetSchema, value.targetTable, value.targetColumn].every(name => name.trim())) {
    throw new Error('Select a referenced table and column.')
  }
  if (!foreignKeyActions.includes(value.onDelete) || !foreignKeyActions.includes(value.onUpdate)) {
    throw new Error('Invalid foreign key action.')
  }
  return `REFERENCES ${qi(value.targetSchema)}.${qi(value.targetTable)} (${qi(value.targetColumn)}) ON DELETE ${value.onDelete} ON UPDATE ${value.onUpdate}`
}
