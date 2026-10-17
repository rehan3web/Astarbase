import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

class ConfigurationError extends Error {}

export async function writePoolConfig(directory: string, env: NodeJS.ProcessEnv): Promise<string> {
  const user = env.DB_USER ?? '';
  const password = env.DB_PASSWORD ?? '';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(user)) throw new ConfigurationError('Invalid DB_USER');
  if (password.length < 16 || /[\x00-\x1f\x7f]/.test(password)) {
    throw new ConfigurationError('DB_PASSWORD must have at least 16 characters and no control characters');
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const usersFile = path.join(directory, 'users.txt');
  const hbaFile = path.join(directory, 'pg_hba.conf');
  const configFile = path.join(directory, 'pgbouncer.ini');
  let poolSize = 20;
  try {
    poolSize = Number((await readFile(path.join(directory, 'pool-size'), 'utf8')).trim());
    if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 80) throw new ConfigurationError('Invalid saved pool size');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // Escape PgBouncer userlist quotes, never interpolate credentials into a shell.
  await writeFile(usersFile, `"${user}" "${password.replaceAll('"', '""')}"\n`, { mode: 0o600 });
  await chmod(usersFile, 0o600);
  // auth_user is still used internally over the Postgres Unix socket. It must
  // never be accepted as a public PgBouncer client or public console admin.
  await writeFile(hbaFile, `local all "${user}" scram-sha-256
host all "${user}" 0.0.0.0/0 reject
host all "${user}" ::/0 reject
local all all scram-sha-256
host all all 0.0.0.0/0 scram-sha-256
host all all ::/0 scram-sha-256
`, { mode: 0o600 });
  await chmod(hbaFile, 0o600);
  await writeFile(configFile, `[databases]
* = host=/var/run/postgresql port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir = /tmp
auth_type = hba
auth_hba_file = ${hbaFile}
auth_file = ${usersFile}
auth_user = ${user}
admin_users = ${user}
auth_dbname = postgres
auth_query = SELECT usename, passwd FROM sorabase_pool_auth.lookup($1)
pool_mode = transaction
max_client_conn = 200
default_pool_size = ${poolSize}
reserve_pool_size = 0
max_db_connections = 80
max_user_connections = 80
server_reset_query = DISCARD ALL
server_reset_query_always = 1
server_idle_timeout = 60
server_login_retry = 1
server_lifetime = 300
log_connections = 0
log_disconnections = 0
`, { mode: 0o600 });
  await chmod(configFile, 0o600);
  return configFile;
}

export async function start(directory = '/etc/pgbouncer'): Promise<void> {
  if (typeof process.execve !== 'function') {
    throw new ConfigurationError('PgBouncer startup requires Node.js 24 on Linux with process.execve support');
  }
  process.umask(0o077);
  const configFile = await writePoolConfig(directory, process.env);
  // Replace Node with PgBouncer so Docker signals and exit codes reach it directly.
  process.execve('/usr/bin/pgbouncer', ['pgbouncer', configFile], process.env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(error => {
    console.error(error instanceof ConfigurationError ? error.message :
      'PgBouncer startup failed. Check configuration directory permissions and the PgBouncer executable.');
    process.exitCode = 1;
  });
}
