// RFC4180-style CSV parsing, including quoted newlines, commas, escaped quotes
// and PostgreSQL's distinction between an unquoted NULL and a quoted empty string.
export function parseSqlOutput(stdout: string) {
  const records: (string | null)[][] = []
  let row: (string | null)[] = [], value = '', quoted = false, wasQuoted = false
  const field = () => { row.push(value === '' && !wasQuoted ? null : value); value = ''; wasQuoted = false }
  for (let i = 0; i < stdout.length; i++) {
    const c = stdout[i]
    if (c === '"') {
      if (quoted && stdout[i + 1] === '"') { value += '"'; i++ }
      else { quoted = !quoted; wasQuoted = true }
    } else if (!quoted && c === ',') field()
    else if (!quoted && c === '\n') { field(); records.push(row); row = [] }
    else if (!quoted && c === '\r' && stdout[i + 1] === '\n') continue
    else value += c
  }
  if (value || row.length || wasQuoted) { field(); records.push(row) }
  const command = (r: (string | null)[]) => r.length === 1 && /^(CREATE |ALTER |DROP |INSERT \d|UPDATE \d|DELETE \d|BEGIN$|COMMIT$|ROLLBACK$|TRUNCATE |SET$|DO$|GRANT$|REVOKE$)/.test(r[0] ?? '')
  const table = records.filter(r => !command(r))
  if (!table.length) return { columns: [] as string[], rows: [] as Record<string, unknown>[] }
  const columns = table[0].map(c => c ?? '')
  // Different-width result sets cannot be merged without corrupting data.
  // Keep every byte available in the separate raw-output panel.
  if (table.some(r => r.length !== columns.length)) return { columns: ['output'], rows: [{ output: stdout }] }
  return { columns, rows: table.slice(1).map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) }
}
