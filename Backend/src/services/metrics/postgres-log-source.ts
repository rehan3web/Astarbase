import path from 'node:path';
import type { Config } from '../../config.js';
import { withDatabase } from '../../db/socket.js';

export const ACTIVITY_LOG_DIRECTORY = '/var/log/sorabase-activity';
export const ACTIVITY_LOG_FILE = /^activity-\d{8}-\d{6}\.json$/;
export type LogFile = { name: string; size: number };
export type LogInventory = { files: LogFile[]; current: string | null };
export interface ActivityLogSource {
  inventory(): Promise<LogInventory>;
  read(name: string, offset: number, length: number): Promise<Buffer | null>;
  remove(name: string): Promise<void>;
}

// All reads use the existing privileged Unix socket. Never expose a log-file
// reader through the public API, and never return raw records to the frontend.
export class PostgresLogSource implements ActivityLogSource {
  constructor(private config: Config, private removeFile: (file: string) => Promise<void>,
    private directory = ACTIVITY_LOG_DIRECTORY) {}
  private file(name: string) {
    if (!ACTIVITY_LOG_FILE.test(name)) throw new Error('Invalid activity log filename');
    return path.posix.join(this.directory, name);
  }
  async inventory(): Promise<LogInventory> {
    return withDatabase(this.config, 'postgres', async client => {
      const { rows: [settings] } = await client.query(`SELECT
        current_setting('logging_collector') AS collector,
        current_setting('log_destination') AS destination,
        current_setting('log_directory') AS directory,
        current_setting('log_duration') AS duration,
        current_setting('log_statement') AS statement,
        current_setting('log_min_duration_statement') AS minimum,
        current_setting('log_min_duration_sample') AS sample,
        current_setting('log_min_error_statement') AS error_statement,
        current_setting('log_error_verbosity') AS verbosity,
        current_setting('log_parameter_max_length') AS parameters,
        current_setting('log_parameter_max_length_on_error') AS error_parameters,
        pg_current_logfile('jsonlog') AS current`);
      if (settings.collector !== 'on' || settings.destination !== 'jsonlog' ||
        settings.directory !== this.directory || settings.duration !== 'on' ||
        settings.statement !== 'none' || settings.minimum !== '-1' || settings.sample !== '-1' ||
        settings.error_statement !== 'panic' || settings.verbosity !== 'terse' ||
        settings.parameters !== '0' || settings.error_parameters !== '0' ||
        typeof settings.current !== 'string' || path.posix.dirname(settings.current) !== this.directory) {
        throw new Error('Activity logging settings are not ready. Update and restart the PostgreSQL Compose service.');
      }
      const { rows } = await client.query('SELECT name,size FROM pg_ls_logdir() ORDER BY name');
      return {
        current: settings.current ? path.posix.basename(settings.current) : null,
        files: rows.filter(row => ACTIVITY_LOG_FILE.test(row.name)).map(row => ({
          name: row.name, size: Number(row.size),
        })),
      };
    });
  }
  async read(name: string, offset: number, length: number) {
    return withDatabase(this.config, 'postgres', async client => {
      const { rows: [row] } = await client.query(
        'SELECT pg_read_binary_file($1,$2::bigint,$3::bigint,true) AS data',
        [this.file(name), offset, length]);
      return row.data as Buffer | null;
    });
  }
  async remove(name: string) { await this.removeFile(this.file(name)); }
}
