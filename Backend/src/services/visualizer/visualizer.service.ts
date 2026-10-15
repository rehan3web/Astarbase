import { TableService } from '../tables/tables.service.js';

export class SchemaService {
  constructor(readonly tables: TableService) {}
  async diagram(database: string) {
    return this.tables.db(database, async client => {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const names = await client.query(`
          SELECT n.nspname AS schema, c.relname AS name FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
            AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
          ORDER BY n.nspname,c.relname`);
        const nodes = [];
        for (const name of names.rows) {
          const info = await this.tables.info(client, name.schema, name.name);
          nodes.push({ id: JSON.stringify([name.schema, name.name]), ...info });
        }
        const relationships = await client.query(`
          SELECT con.oid::text AS id, con.conname AS name,
            sn.nspname AS source_schema, sc.relname AS source_table,
            tn.nspname AS target_schema, tc.relname AS target_table,
            array_agg(sa.attname::text ORDER BY k.ord) AS source_columns,
            array_agg(ta.attname::text ORDER BY k.ord) AS target_columns,
            con.confupdtype AS on_update, con.confdeltype AS on_delete,
            con.condeferrable AS deferrable
          FROM pg_constraint con
          JOIN pg_class sc ON sc.oid = con.conrelid JOIN pg_namespace sn ON sn.oid = sc.relnamespace
          JOIN pg_class tc ON tc.oid = con.confrelid JOIN pg_namespace tn ON tn.oid = tc.relnamespace
          CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY k(src, dst, ord)
          JOIN pg_attribute sa ON sa.attrelid = sc.oid AND sa.attnum = k.src
          JOIN pg_attribute ta ON ta.attrelid = tc.oid AND ta.attnum = k.dst
          WHERE con.contype = 'f' AND sn.nspname NOT IN ('pg_catalog','information_schema')
          GROUP BY con.oid, sn.nspname,sc.relname,tn.nspname,tc.relname ORDER BY con.oid`);
        await client.query('COMMIT');
        const actions: Record<string, string> = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
        const edges = relationships.rows.map(row => ({
          ...row, source: JSON.stringify([row.source_schema, row.source_table]),
          target: JSON.stringify([row.target_schema, row.target_table]),
          on_update: actions[row.on_update], on_delete: actions[row.on_delete],
        }));
        return { database, nodes, edges };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }
}
