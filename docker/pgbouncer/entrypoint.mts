import { chmod, mkdir, writeFile } from 'node:fs/promises';
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
  const configFile = path.join(directory, 'pgbouncer.ini');
  // Escape PgBouncer userlist quotes, never interpolate credentials into a shell.
  await writeFile(usersFile, `"${user}" "${password.replaceAll('"', '""')}"\n`, { mode: 0o600 });
  await chmod(usersFile, 0o600);
  await writeFile(configFile, `[databases]
* = host=/var/run/postgresql port=5432

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir = /tmp
auth_type = scram-sha-256
auth_file = ${usersFile}
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
server_reset_query = DISCARD ALL
server_reset_query_always = 1
server_idle_timeout = 60
server_login_retry = 1
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
