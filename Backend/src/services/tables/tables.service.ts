import type pg from 'pg';
import type { Config } from '../../config.js';
import { quoteIdentifier as qi, withDatabase } from '../../db/socket.js';
import { HttpError } from '../../errors.js';

type Column = { name: string; type: string; udt_name: string; nullable: boolean; generated: boolean; identity: string; default: string | null };
export type TableInfo = { schema: string; name: string; columns: Column[]; primaryKey: string[] };

export class TableService {
  constructor(readonly config: Config) {}
  db<T>(database: string, fn: (client: pg.Client) => Promise<T>) { return withDatabase(this.config, database, fn); }
  async list(database: string) {
    return this.db(database, async client => (await client.query(`
      SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
        c.reltuples::bigint AS estimated_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
      ORDER BY n.nspname, c.relname`)).rows);
  }
  async info(client: pg.Client, schema: string, table: string): Promise<TableInfo> {
    const exists = await client.query(`
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind IN ('r','p')
        AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'`, [schema, table]);
    if (!exists.rowCount) throw new HttpError(404, 'Table not found');
    const columns = await client.query<Column>(`
      SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, t.typname AS udt_name,
        NOT a.attnotnull AS nullable, a.attgenerated <> '' AS generated,
        a.attidentity AS identity, pg_get_expr(d.adbin,d.adrelid) AS default
      FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [exists.rows[0].oid]);
    const pk = await client.query(`
      SELECT a.attname AS name FROM pg_index i
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE i.indrelid = $1 AND i.indisprimary ORDER BY k.ord`, [exists.rows[0].oid]);
    return { schema, name: table, columns: columns.rows, primaryKey: pk.rows.map(r => r.name) };
  }
  async rows(database: string, schema: string, table: string, limit: number, offset: number) {
    return this.db(database, async client => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const info = await this.info(client, schema, table);
        const order = info.primaryKey.length ? ` ORDER BY ${info.primaryKey.map(qi).join(',')}` : ' ORDER BY tableoid, ctid';
        const rows = await client.query(`SELECT * FROM ${qi(schema)}.${qi(table)}${order} LIMIT $1 OFFSET $2`, [limit, offset]);
        const count = await client.query(`SELECT count(*)::text AS total FROM ${qi(schema)}.${qi(table)}`);
        await client.query('COMMIT');
        return { ...info, rows: rows.rows, total: count.rows[0].total, limit, offset, editable: info.primaryKey.length > 0 };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }
  values(info: TableInfo, data: Record<string, unknown>) {
    if (!Object.keys(data).length) throw new HttpError(400, 'At least one column is required');
    return Object.entries(data).map(([name, value]) => {
      const col = info.columns.find(column => column.name === name);
      if (!col || col.generated || col.identity === 'a') throw new HttpError(400, `Column ${name} is unknown or generated`);
      return { name, value: ['json', 'jsonb'].includes(col.udt_name) && value !== null ? JSON.stringify(value) : value };
    });
  }
  key(info: TableInfo, key: Record<string, unknown>, start: number) {
    if (!info.primaryKey.length) throw new HttpError(409, 'Editing or deleting requires a primary key');
    if (Object.keys(key).length !== info.primaryKey.length || !info.primaryKey.every(k => Object.hasOwn(key, k))) {
      throw new HttpError(400, 'Provide every primary key column and no extra columns');
    }
    return {
      where: info.primaryKey.map((k, i) => `${qi(k)} IS NOT DISTINCT FROM $${start + i}`).join(' AND '),
      values: info.primaryKey.map(k => key[k]),
    };
  }
  async insert(database: string, schema: string, table: string, data: Record<string, unknown>) {
    return this.db(database, async client => {
      const info = await this.info(client, schema, table);
      if (!Object.keys(data).length) {
        return (await client.query(`INSERT INTO ${qi(schema)}.${qi(table)} DEFAULT VALUES RETURNING *`)).rows[0];
      }
      const values = this.values(info, data);
      return (await client.query(`INSERT INTO ${qi(schema)}.${qi(table)} (${values.map(v => qi(v.name)).join(',')})
        VALUES (${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, values.map(v => v.value))).rows[0];
    });
  }
  async update(database: string, schema: string, table: string, key: Record<string, unknown>, changes: Record<string, unknown>) {
    return this.db(database, async client => {
      const info = await this.info(client, schema, table);
      const values = this.values(info, changes);
      const pk = this.key(info, key, values.length + 1);
      const result = await client.query(`UPDATE ${qi(schema)}.${qi(table)}
        SET ${values.map((v, i) => `${qi(v.name)} = $${i + 1}`).join(',')} WHERE ${pk.where} RETURNING *`,
      [...values.map(v => v.value), ...pk.values]);
      if (!result.rowCount) throw new HttpError(404, 'Row not found');
      return result.rows[0];
    });
  }
  async delete(database: string, schema: string, table: string, key: Record<string, unknown>) {
    return this.db(database, async client => {
      const info = await this.info(client, schema, table);
      const pk = this.key(info, key, 1);
      const result = await client.query(`DELETE FROM ${qi(schema)}.${qi(table)} WHERE ${pk.where} RETURNING *`, pk.values);
      if (!result.rowCount) throw new HttpError(404, 'Row not found');
      return result.rows[0];
    });
  }
}
