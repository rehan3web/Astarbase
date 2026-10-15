import type { Config } from '../../config.js';
import { HttpError } from '../../errors.js';
import { DockerService } from './docker.js';

export class PostgresContainer {
  constructor(readonly config: Config, readonly docker = new DockerService(config)) {}

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
    ], this.config.SQL_TIMEOUT_MS + 15000);
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
      '--dbname', database, this.file(id)], 3600000);
  }

  async removeDump(id: string): Promise<void> {
    await this.docker.exec(['rm', '-f', '--', this.file(id)]);
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
