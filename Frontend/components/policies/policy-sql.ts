import type { PolicyCommand, PolicyMode, PolicyPayload } from './rls-types'

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`

/** SQL generated here is an editable form, not a general SQL execution route. */
export function buildPolicySql(policy: PolicyPayload, schema: string, table: string): string {
  const lines = [
    `CREATE POLICY ${quote(policy.name)}`,
    `ON ${quote(schema)}.${quote(table)}`,
    `AS ${policy.mode}`,
    `FOR ${policy.command}`,
    `TO ${policy.roles.map(role => role === 'public' ? 'PUBLIC' : quote(role)).join(', ')}`,
  ]
  if (policy.usingExpression !== null) lines.push(`USING (\n  ${policy.usingExpression}\n)`)
  if (policy.checkExpression !== null) lines.push(`WITH CHECK (\n  ${policy.checkExpression}\n)`)
  return `${lines.join('\n')};`
}

type Token = { value: string; start: number; end: number; kind: 'word' | 'identifier' | 'literal' | 'symbol' }

// A deliberately narrow CREATE POLICY reader. Expressions stay opaque and are
// validated by PostgreSQL; quoted strings/comments must not close their brackets.
function tokenize(sql: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < sql.length) {
    if (/\s/.test(sql[i])) { i++; continue }
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i + 2)
      i = end === -1 ? sql.length : end + 1
      continue
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1
      i += 2
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2 }
        else if (sql.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      if (depth) throw new Error('Close the SQL comment before saving.')
      continue
    }
    const start = i
    const escaped = /[eE]/.test(sql[i]) && sql[i + 1] === "'"
    if (sql[i] === '"' || sql[i] === "'" || escaped) {
      if (escaped) i++
      const delimiter = sql[i++]
      let value = ''
      let closed = false
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { value += sql.slice(i, i + 2); i += 2; continue }
        if (sql[i] === delimiter) {
          if (sql[i + 1] === delimiter) { value += delimiter; i += 2; continue }
          i++; closed = true; break
        }
        value += sql[i++]
      }
      if (!closed) throw new Error('Close the quoted SQL value before saving.')
      tokens.push({ value, start, end: i, kind: delimiter === '"' ? 'identifier' : 'literal' })
      continue
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0]
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length)
      if (end < 0) throw new Error('Close the dollar-quoted SQL value before saving.')
      i = end + dollar.length
      tokens.push({ value: sql.slice(start, i), start, end: i, kind: 'literal' })
      continue
    }
    const word = sql.slice(i).match(/^[A-Za-z_\u0080-\uFFFF][A-Za-z_0-9$\u0080-\uFFFF]*/)?.[0]
    if (word) {
      i += word.length
      tokens.push({ value: word, start, end: i, kind: 'word' })
    } else {
      i++
      tokens.push({ value: sql[start], start, end: i, kind: 'symbol' })
    }
  }
  return tokens
}

export function parsePolicySql(sql: string, schema: string, table: string): PolicyPayload {
  if (sql.length > 40000) throw new Error('Policy SQL is too long.')
  const tokens = tokenize(sql)
  let i = 0
  const is = (value: string) => tokens[i]?.kind === 'word' && tokens[i].value.toUpperCase() === value
  const keyword = (value: string) => {
    if (!is(value)) throw new Error(`Expected ${value} in CREATE POLICY SQL.`)
    i++
  }
  const identifier = () => {
    const token = tokens[i++]
    if (!token || !['word', 'identifier'].includes(token.kind)) throw new Error('Expected a policy, table, or role name.')
    return token.kind === 'word' ? token.value.toLowerCase() : token.value
  }
  const expression = () => {
    const open = tokens[i++]
    if (open?.value !== '(' || open.kind !== 'symbol') throw new Error('Wrap the SQL expression in parentheses.')
    let depth = 1
    while (i < tokens.length) {
      const token = tokens[i++]
      if (token.kind !== 'symbol') continue
      if (token.value === '(') depth++
      if (token.value === ')' && --depth === 0) {
        const value = sql.slice(open.end, token.start).trim()
        if (!value || !tokenize(value).length) throw new Error('Enter a SQL expression, for example true.')
        return value
      }
    }
    throw new Error('Close the SQL expression parentheses before saving.')
  }
  keyword('CREATE'); keyword('POLICY')
  const name = identifier()
  if (!name.trim() || new TextEncoder().encode(name).length > 63) throw new Error('Policy name must contain 1–63 bytes.')
  keyword('ON')
  const first = identifier()
  let targetSchema = schema
  let targetTable = first
  if (tokens[i]?.value === '.') { i++; targetSchema = first; targetTable = identifier() }
  if (targetSchema !== schema || targetTable !== table) throw new Error(`This policy must target ${quote(schema)}.${quote(table)}.`)
  let mode: PolicyMode = 'PERMISSIVE'
  if (is('AS')) {
    i++
    if (!is('PERMISSIVE') && !is('RESTRICTIVE')) throw new Error('Choose PERMISSIVE or RESTRICTIVE.')
    mode = tokens[i++].value.toUpperCase() as PolicyMode
  }
  let command: PolicyCommand = 'ALL'
  if (is('FOR')) {
    i++
    if (!['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].some(is)) throw new Error('Choose ALL, SELECT, INSERT, UPDATE, or DELETE.')
    command = tokens[i++].value.toUpperCase() as PolicyCommand
  }
  const roles: string[] = []
  if (is('TO')) {
    i++
    do {
      roles.push(identifier())
      if (tokens[i]?.value !== ',') break
      i++
    } while (true)
  } else roles.push('public')
  let usingExpression: string | null = null
  let checkExpression: string | null = null
  if (is('USING')) { i++; usingExpression = expression() }
  if (is('WITH')) { i++; keyword('CHECK'); checkExpression = expression() }
  if (tokens[i]?.kind === 'symbol' && tokens[i].value === ';') i++
  if (i !== tokens.length) throw new Error('Enter one CREATE POLICY statement only, with USING before WITH CHECK.')
  if (command === 'INSERT' && usingExpression !== null) throw new Error('INSERT policies support WITH CHECK, not USING.')
  if ((command === 'SELECT' || command === 'DELETE') && checkExpression !== null) throw new Error(`${command} policies support USING, not WITH CHECK.`)
  return { name, command, mode, roles: [...new Set(roles)], usingExpression, checkExpression }
}
