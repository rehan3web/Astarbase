import pg from 'pg';
import type { Config } from '../config.js';

// Deliberately never accepts a connection URL, hostname, or caller-supplied port.
export function connection(config: Config, database: string): pg.ClientConfig {
  return {
    host: config.PG_SOCKET_DIR,
    port: 5432,
    database,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    ssl: false,
    application_name: 'astarbase-admin',
    connectionTimeoutMillis: 10000,
    statement_timeout: config.SQL_TIMEOUT_MS,
    idle_in_transaction_session_timeout: 30000,
  };
}

export async function withDatabase<T>(config: Config, database: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(connection(config, database));
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

export function quoteIdentifier(value: string): string {
  if (!value || value.includes('\0') || Buffer.byteLength(value) > 63) throw new Error('Invalid PostgreSQL identifier');
  return `"${value.replaceAll('"', '""')}"`;
}
