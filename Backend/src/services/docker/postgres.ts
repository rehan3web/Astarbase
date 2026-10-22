import type { Config } from '../../config.js';
import { HttpError } from '../../errors.js';
import { DockerService } from './docker.js';
import type { Writable } from 'node:stream';
import { quoteIdentifier } from '../../db/socket.js';
import { readableTableDefinition } from '../tables/table-definition.js';

export class PostgresContainer {
  constructor(readonly config: Config, readonly docker = new DockerService(config)) {}

  async schemaSql(database: string, relation?: { schema: string; table: string }) {
    const { stdout } = await this.docker.exec([
      'pg_dump', '--host', this.config.PG_SOCKET_DIR, '--username', this.config.DB_USER,
      '--no-password', '--schema-only', '--no-owner', '--no-privileges',
      '--no-publications', '--no-subscriptions', '--dbname', database,
      ...(relation ? ['--strict-names', '--table', `${quoteIdentifier(relation.schema)}.${quoteIdentifier(relation.table)}`] : []),
    ], 3600000, 64 * 1024 * 1024);
    // Recent pg_dump versions surround scripts with psql-only restriction
    // directives. Remove only the matching outer pair, not SQL/function bodies.
    const lines = stdout.split('\n');
    const command = (line: string) => line.trim() !== '' && !line.startsWith('--');
    const first = lines.findIndex(command);
    let last = lines.length - 1;
    while (last >= 0 && !command(lines[last])) last--;
    const restriction = first >= 0 ? /^\\restrict ([A-Za-z0-9]+)\r?$/.exec(lines[first]) : null;
    if (restriction) {
      if (lines[last].trim() !== `\\unrestrict ${restriction[1]}`) throw new Error('Schema export was incomplete');
      lines[first] = ''; lines[last] = '';
    }
    return { database, sql: lines.join('\n') };
  }

  async tableDefinition(database: string, schema: string, table: string) {
    const result = await this.schemaSql(database, { schema, table });
    return { database, schema, table, sql: readableTableDefinition(result.sql) };
  }

  async query(database: string, sql: string) {
    // With -c, psql sends the entire argument as SQL, unless it begins with a
    // backslash. Never use a shell, stdin scripts, or psql variable interpolation.
    if (!sql.trim() || sql.trimStart().startsWith('\\') || sql.includes('\0')) {
      throw new HttpError(400, 'Provide SQL, not psql backslash commands');
    }
    if (Buffer.byteLength(sql) > 60000) throw new HttpError(400, 'SQL must be at most 60,000 bytes');
    const start = performance.now();
    const output = await this.docker.exec([
      'psql', '-X', '--no-password', '--host', this.config.PG_SOCKET_DIR,
      '--username', this.config.DB_USER, '--dbname', database,
      '--set', 'ON_ERROR_STOP=1', '--csv', '--pset', 'footer=off', '--command', sql,
    ], this.config.SQL_TIMEOUT_MS + 15000, undefined, 'sorabase-sql');
    return { ...output, format: 'csv', durationMs: Math.round(performance.now() - start) };
  }

  private file(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid backup file identifier');
    return `${this.config.BACKUP_DIR}/${id}.dump`;
  }

  async dump(database: string, id: string): Promise<number> {
    await this.docker.exec(['pg_dump', '--host', this.config.PG_SOCKET_DIR, '--username', this.config.DB_USER,
      '--no-password', '--format=custom', '--file', this.file(id), '--dbname', database], 3600000);
    const { stdout } = await this.docker.exec(['stat', '-c', '%s', this.file(id)]);
    const size = Number(stdout.trim());
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Backup file has an invalid size');
    return size;
  }

  async restore(database: string, id: string): Promise<void> {
    await this.docker.exec(['pg_restore', '--host', this.config.PG_SOCKET_DIR, '--username', this.config.DB_USER,
      '--no-password', '--exit-on-error', '--single-transaction', '--no-owner',
      '--no-privileges',
      '--dbname', database, this.file(id)], 3600000);
  }

  async removeDump(id: string): Promise<void> {
    await this.docker.exec(['rm', '-f', '--', this.file(id)]);
  }

  async exportSql(id: string, destination: Writable): Promise<void> {
    // Convert the saved custom archive, not the current live database.
    await this.docker.execTo(['pg_restore', '--no-owner', '--no-privileges', '--file=-', this.file(id)], destination);
  }

  async listDumps(): Promise<Map<string, number>> {
    const { stdout } = await this.docker.exec(['find', this.config.BACKUP_DIR,
      '-maxdepth', '1', '-type', 'f', '-name', '*.dump',
      '-exec', 'stat', '-c', '%n:%s', '{}', '+']);
    const files = new Map<string, number>();
    for (const line of stdout.trim().split('\n')) {
      const match = line.match(/\/([0-9a-f-]{36})\.dump:(\d+)$/);
      if (match) files.set(match[1], Number(match[2]));
    }
    return files;
  }
}
