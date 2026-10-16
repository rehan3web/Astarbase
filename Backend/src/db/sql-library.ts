import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { HttpError } from '../errors.js';

const name = z.string().trim().min(1).max(160);
const visibility = z.enum(['private', 'shared']);
export const folderInput = z.object({ name, visibility: visibility.default('private') }).strict();
export const folderPatch = z.object({ name, visibility }).partial().strict()
  .refine(value => Object.keys(value).length > 0);
const snippetFields = {
  name, sql: z.string().max(60000), description: z.string().max(2000),
  visibility, folderId: z.uuid().nullable(), isFavorite: z.boolean(),
};
export const snippetInput = z.object({
  ...snippetFields, description: snippetFields.description.default(''),
  visibility: visibility.default('private'), folderId: snippetFields.folderId.default(null),
  isFavorite: z.boolean().default(false),
}).strict();
// PATCH must not inherit create defaults: omitted values must remain untouched.
export const snippetPatch = z.object(snippetFields).partial().strict()
  .refine(value => Object.keys(value).length > 0);
export type Folder = { id: string; name: string; visibility: 'private' | 'shared' };
export type Snippet = Folder & {
  sql: string; description: string; folderId: string | null; isFavorite: boolean;
  inserted_at: string; updated_at: string;
};

// Saved editor documents are admin metadata. SQL is never executed here.
// Both visibility groups remain behind Studio authentication, not public links.
export class SqlLibraryStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sql_folders (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK(visibility IN ('private','shared'))
      );
      CREATE TABLE IF NOT EXISTS sql_snippets (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, sql TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL CHECK(visibility IN ('private','shared')),
        folder_id TEXT REFERENCES sql_folders(id) ON DELETE SET NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
        inserted_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sql_snippets_folder_idx ON sql_snippets(folder_id);
    `);
  }
  list() {
    const folders = this.db.prepare('SELECT * FROM sql_folders ORDER BY name,id').all() as Folder[];
    const snippets = this.db.prepare(`
      SELECT id,name,sql,description,visibility,folder_id AS folderId,
        is_favorite AS isFavorite,inserted_at,updated_at
      FROM sql_snippets ORDER BY inserted_at DESC,id
    `).all().map(row => ({ ...row, isFavorite: Boolean(row.isFavorite) }) as Snippet);
    return { folders, snippets };
  }
  private folder(id: string): Folder {
    const row = this.db.prepare('SELECT * FROM sql_folders WHERE id=?').get(id);
    if (!row) throw new HttpError(404, 'Folder not found');
    return row as Folder;
  }
  private transaction(work: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try { work(); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.list();
  }
  createFolder(input: unknown) {
    const data = folderInput.parse(input);
    this.db.prepare('INSERT INTO sql_folders(id,name,visibility) VALUES(?,?,?)')
      .run(randomUUID(), data.name, data.visibility);
    return this.list();
  }
  updateFolder(id: string, input: unknown) {
    const patch = folderPatch.parse(input);
    return this.transaction(() => {
      const previous = this.folder(id);
      const next = { ...previous, ...patch };
      this.db.prepare('UPDATE sql_folders SET name=?,visibility=? WHERE id=?').run(next.name, next.visibility, id);
      if (next.visibility !== previous.visibility) {
        this.db.prepare('UPDATE sql_snippets SET visibility=?,updated_at=? WHERE folder_id=?')
          .run(next.visibility, new Date().toISOString(), id);
      }
    });
  }
  deleteFolder(id: string) {
    this.folder(id);
    this.db.prepare('DELETE FROM sql_folders WHERE id=?').run(id);
    return this.list();
  }
  createSnippet(input: unknown) {
    const data = snippetInput.parse(input);
    if (data.folderId) data.visibility = this.folder(data.folderId).visibility;
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO sql_snippets
      (id,name,sql,description,visibility,folder_id,is_favorite,inserted_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), data.name, data.sql, data.description, data.visibility, data.folderId,
        Number(data.isFavorite), now, now);
    return this.list();
  }
  updateSnippet(id: string, input: unknown) {
    const patch = snippetPatch.parse(input);
    const previous = this.list().snippets.find(row => row.id === id);
    if (!previous) throw new HttpError(404, 'Snippet not found');
    const next = { ...previous, ...patch };
    if (next.folderId) {
      const folder = this.folder(next.folderId);
      if (patch.folderId !== undefined) next.visibility = folder.visibility;
      else if (patch.visibility !== undefined && patch.visibility !== folder.visibility) next.folderId = null;
      else next.visibility = folder.visibility;
    }
    this.db.prepare(`UPDATE sql_snippets SET name=?,sql=?,description=?,visibility=?,
      folder_id=?,is_favorite=?,updated_at=? WHERE id=?`)
      .run(next.name, next.sql, next.description, next.visibility, next.folderId,
        Number(next.isFavorite), new Date().toISOString(), id);
    return this.list();
  }
  deleteSnippet(id: string) {
    const result = this.db.prepare('DELETE FROM sql_snippets WHERE id=?').run(id);
    if (!result.changes) throw new HttpError(404, 'Snippet not found');
    return this.list();
  }
}
