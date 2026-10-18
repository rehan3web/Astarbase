export type SqlEditorDraft = { database: string; name: string; sql: string }
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const KEY = 'sorabase_sql_editor_handoff'

function validate(value: unknown): SqlEditorDraft {
  if (!value || typeof value !== 'object') throw new Error('Invalid SQL editor draft')
  const draft = value as Partial<SqlEditorDraft>
  if (typeof draft.database !== 'string' || !draft.database.trim() ||
      typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 200 ||
      typeof draft.sql !== 'string' || !draft.sql.trim()) throw new Error('Invalid SQL editor draft')
  return { database: draft.database, name: draft.name, sql: draft.sql }
}

export function queueSqlEditorDraft(draft: SqlEditorDraft, storage: DraftStorage = window.sessionStorage) {
  storage.setItem(KEY, JSON.stringify(validate(draft)))
}

export function takeSqlEditorDraft(database: string, storage: DraftStorage = window.sessionStorage): SqlEditorDraft | null {
  const saved = storage.getItem(KEY)
  if (saved === null) return null
  storage.removeItem(KEY)
  const draft = validate(JSON.parse(saved))
  if (draft.database !== database) throw new Error(`SQL definition belongs to ${draft.database}. Select that database and open its definition again.`)
  return draft
}
