import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { z } from 'zod';

export const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// In dist/src the source tree is two levels up.
export const backendRoot = backendDir.endsWith('/dist') ? path.resolve(backendDir, '..') : backendDir;
export const projectDir = path.resolve(backendRoot, '..');
const rootEnvFile = path.join(projectDir, '.env');
export const envFile = existsSync(rootEnvFile) ? rootEnvFile : path.join(projectDir, 'Backend', '.env');
dotenv.config({ path: envFile, quiet: true });

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const schema = z.object({
  DB_NAME: identifier,
  DB_USER: identifier,
  DB_PASSWORD: z.string().min(16).refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed'),
  DATABASE_PUBLIC_HOST: z.string().trim().default('').refine(value => value === '' || isIP(value) > 0 ||
    (value.length <= 253 && value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))),
  'Use a hostname or IP address without a scheme or port'),
  POSTGRES_PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGBOUNCER_PUBLIC_PORT: z.coerce.number().int().min(1).max(65535).default(6432),
  LEGACY_CONTROL_DB: identifier.default('sorabase_control'),
  ADMIN_DATA_DIR: z.string().refine(value => path.isAbsolute(value), 'Use an absolute directory path').default(path.join(backendRoot, 'data')),
  PG_SOCKET_DIR: z.literal('/var/run/postgresql').default('/var/run/postgresql'),
  DOCKER_SOCKET: z.literal('/var/run/docker.sock').default('/var/run/docker.sock'),
  POSTGRES_CONTAINER: z.string().regex(/^[a-zA-Z0-9_.-]+$/).default('sorabase-postgres'),
  BACKUP_DIR: z.literal('/var/lib/sorabase/backups').default('/var/lib/sorabase/backups'),
  ADMIN_API_TOKEN: z.string().min(32),
  ADMIN_USERNAME: z.string().default(''),
  ADMIN_EMAIL: z.string().default(''),
  ADMIN_PASSWORD: z.string().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  AUTO_START_COMPOSE: z.enum(['true', 'false']).default('true'),
  SQL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  POSTGRES_ACTIVITY_LOGS: z.enum(['true', 'false']).default('false'),
});

export type Config = z.infer<typeof schema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = schema.safeParse({ ...env, LEGACY_CONTROL_DB: env.LEGACY_CONTROL_DB ?? env.CONTROL_DB });
  if (!result.success) {
    // Do not include submitted values or credentials in errors.
    throw new Error(`Invalid configuration: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  if (result.data.DB_NAME === result.data.LEGACY_CONTROL_DB || ['postgres', 'template0', 'template1'].includes(result.data.DB_NAME)) {
    throw new Error('DB_NAME must be a project database, distinct from the control and system databases');
  }
  return result.data;
}
