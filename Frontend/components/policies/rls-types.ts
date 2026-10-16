export type PolicyCommand = 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
export type PolicyMode = 'PERMISSIVE' | 'RESTRICTIVE'

export type RlsPolicy = {
  name: string
  command: PolicyCommand
  mode: PolicyMode
  roles: string[]
  usingExpression: string | null
  checkExpression: string | null
}

export type RlsTable = {
  schema: string
  name: string
  enabled: boolean
  forced: boolean
  policies: RlsPolicy[]
}

export type RlsRole = {
  name: string
  superuser: boolean
  bypassRls: boolean
  login: boolean
}

export type RlsCatalog = {
  database: string
  tables: RlsTable[]
  roles: RlsRole[]
}

export type PolicyPayload = {
  name: string
  command: PolicyCommand
  mode: PolicyMode
  roles: string[]
  usingExpression: string | null
  checkExpression: string | null
}

export const policyPath = (database: string, schema: string, table: string) =>
  `/databases/${encodeURIComponent(database)}/rls/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`

export function policyRoleOptions(roles: RlsRole[]) {
  return [...new Set(['public', ...roles.map(role => role.name)])]
}

