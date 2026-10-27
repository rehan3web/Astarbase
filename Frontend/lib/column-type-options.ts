export type ColumnDefaultSuggestion = { value: string; description: string }

const aliases: Record<string, string> = {
  smallint: 'int2', integer: 'int4', bigint: 'int8', real: 'float4',
  'double precision': 'float8', decimal: 'numeric', bool: 'boolean',
  'character varying': 'varchar', 'timestamp with time zone': 'timestamptz',
  'timestamp without time zone': 'timestamp', 'time without time zone': 'time',
  'time with time zone': 'timetz',
}
const supported = new Set([
  'text', 'varchar', 'int2', 'int4', 'int8', 'float4', 'float8', 'numeric',
  'uuid', 'boolean', 'json', 'jsonb', 'date', 'time', 'timetz', 'timestamp', 'timestamptz',
])

export function getColumnTypeOptions(type: string, isArray = false) {
  const normalized = type.trim().toLowerCase()
  const array = isArray || /\[\]$/.test(normalized)
  const raw = normalized.replace(/(?:\[\])+$/, '').replace(/\([^)]*\)/g, '').trim()
  const base = aliases[raw] ?? raw
  const suggestions: ColumnDefaultSuggestion[] = []
  const add = (value: string, description: string) => suggestions.push({ value, description })
  if (supported.has(base)) {
    if (array) {
      add(`'{}'::${base}[]`, 'An empty array for this column type')
    } else if (base === 'timestamp' || base === 'timestamptz') {
      add('now()', 'Returns the current date and time')
      add("(now() at time zone 'utc')", 'Returns the current date and time in UTC')
    } else if (base === 'date') {
      add('CURRENT_DATE', 'Returns the current date')
    } else if (base === 'time' || base === 'timetz') {
      add('CURRENT_TIME', 'Returns the current time')
    } else if (base === 'uuid') {
      add('gen_random_uuid()', 'Generates a random UUID')
    } else if (base === 'json' || base === 'jsonb') {
      add(`'{}'::${base}`, 'An empty JSON object')
      add(`'[]'::${base}`, 'An empty JSON array')
    } else if (base === 'boolean') {
      add('true', 'Defaults to true')
      add('false', 'Defaults to false')
    } else if (base === 'text' || base === 'varchar') {
      add("''", 'An empty string')
    } else {
      add('0', 'Defaults to zero')
      add('1', 'Defaults to one')
    }
  }
  // PostgreSQL json has no equality/btree operator class, including json arrays.
  return { suggestions, supportsUnique: supported.has(base) && base !== 'json' }
}

type ColumnTypeDraft = {
  type: string
  defaultValue: string
  isArray?: boolean
  isUnique?: boolean
  isPrimaryKey?: boolean
}

/** Keep custom expressions, but discard built-in defaults invalidated by a type change. */
export function applyColumnTypeChange<T extends ColumnTypeDraft>(current: T, updates: Partial<T>): T {
  const next = { ...current, ...updates }
  if (next.type === current.type && !!next.isArray === !!current.isArray) return next
  const previousOptions = getColumnTypeOptions(current.type, current.isArray)
  const nextOptions = getColumnTypeOptions(next.type, next.isArray)
  if (previousOptions.suggestions.some(option => option.value === next.defaultValue)
    && !nextOptions.suggestions.some(option => option.value === next.defaultValue)) {
    next.defaultValue = ''
  }
  if (!nextOptions.supportsUnique) {
    next.isUnique = false
    next.isPrimaryKey = false
  }
  return next
}
