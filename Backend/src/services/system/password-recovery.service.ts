import Docker from 'dockerode';
import { randomBytes } from 'node:crypto';
import { PassThrough, type Duplex } from 'node:stream';
import path from 'node:path';
import type { Config } from '../../config.js';

export class RecoveryError extends Error {}
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function recoveryStatement(user: string, password: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(user)) throw new RecoveryError('Invalid DB_USER.');
  if (password.length < 16 || /[\x00-\x1f\x7f]/.test(password)) {
    throw new RecoveryError('DB_PASSWORD needs at least 16 characters and no control characters.');
  }
  let nonce: string;
  do { nonce = randomBytes(16).toString('hex'); } while (password.includes(nonce));
  const tag = `$sorabase_${nonce}$`;
  const marker = `SORABASE_RESET_OK_${nonce}`;
  // One complete standalone-backend statement. No plaintext in process arguments.
  const sql = `DO ${tag} BEGIN EXECUTE format('ALTER ROLE %I PASSWORD %L', ${literal(user)}, ${literal(password)}); RAISE NOTICE '${marker}'; END ${tag};\n`;
  return { sql, marker };
}

export function recoveryContainer(info: Docker.ContainerInspectInfo): Docker.ContainerCreateOptions {
  if (info.State.Running || info.State.Restarting || !['exited', 'created'].includes(info.State.Status)) {
    throw new RecoveryError('Postgres is still running or restarting. Stop the stack before recovery.');
  }
  if (info.State.Status === 'exited' && info.State.ExitCode !== 0) {
    throw new RecoveryError('Postgres did not shut down cleanly. Start only Postgres, then stop it cleanly with a 60-second timeout before recovery.');
  }
  const pgdata = info.Config.Env?.find(value => value.startsWith('PGDATA='))?.slice(7) || '/var/lib/postgresql/data';
  if (!path.posix.isAbsolute(pgdata)) throw new RecoveryError('Invalid Postgres data directory.');
  const mount = info.Mounts.filter(value => ['volume', 'bind'].includes(value.Type) &&
    (pgdata === value.Destination || pgdata.startsWith(`${value.Destination}/`)))
    .sort((a, b) => b.Destination.length - a.Destination.length)[0];
  if (!mount || !mount.RW || mount.Destination === '/') {
    throw new RecoveryError('A writable persistent Postgres data mount is required; no new database will be initialized.');
  }
  const source = mount.Type === 'volume' ? mount.Name : mount.Source;
  if (!source) throw new RecoveryError('Cannot identify the existing Postgres data volume.');
  return {
    Image: info.Image, // Exact same installed Postgres image, never pull a different major.
    User: 'postgres',
    Entrypoint: ['postgres'],
    Cmd: ['--single', '-D', pgdata, '-c', 'password_encryption=scram-sha-256',
      '-c', 'standard_conforming_strings=on', '-c', 'log_statement=none',
      '-c', 'log_min_error_statement=panic', '-c', 'log_min_messages=notice',
      '-c', 'logging_collector=off', '-c', 'log_destination=stderr', 'postgres'],
    Env: [`PGDATA=${pgdata}`],
    AttachStdin: true, AttachStdout: true, AttachStderr: true,
    OpenStdin: true, StdinOnce: true, Tty: false,
    Labels: { 'sorabase.maintenance': 'password-recovery' },
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=16m,mode=1777' },
      LogConfig: { Type: 'none', Config: {} },
      Mounts: [{ Type: mount.Type as 'volume' | 'bind', Source: source, Target: mount.Destination, ReadOnly: false }],
    },
  };
}

async function execute(docker: Docker, helper: Docker.Container, sql: string): Promise<{ code: number; output: string }> {
  const stream = await helper.attach({ stream: true, stdin: true, stdout: true, stderr: true, hijack: true }) as Duplex;
  const out = new PassThrough();
  const err = new PassThrough();
  try {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let code: number | undefined;
      let ended = false;
      const timer = setTimeout(() => {
        reject(new RecoveryError('Recovery timed out; the password change is not confirmed. Keep Postgres stopped until recovery cleanup finishes.'));
      }, 60000);
      const fail = () => { clearTimeout(timer); reject(new RecoveryError('Recovery stream failed; the password change is not confirmed.')); };
      const finish = () => {
        if (ended && code !== undefined) {
          clearTimeout(timer);
          resolve({ code, output: Buffer.concat(chunks).toString('utf8') });
        }
      };
      for (const output of [out, err]) output.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) {
          clearTimeout(timer);
          reject(new RecoveryError('Recovery output limit exceeded; the password change is not confirmed.'));
        } else chunks.push(chunk);
      });
      stream.once('error', fail);
      stream.once('end', () => { ended = true; finish(); });
      stream.once('close', () => { ended = true; finish(); });
      docker.modem.demuxStream(stream, out, err);
      void (async () => {
        await helper.start();
        stream.end(sql);
        const result = await helper.wait();
        code = result.StatusCode;
        finish();
      })().catch(fail);
    });
  } finally {
    stream.destroy();
    out.destroy();
    err.destroy();
  }
}

export async function resetDatabasePassword(config: Config, confirmUser: string, docker?: Docker): Promise<void> {
  if (confirmUser !== config.DB_USER) throw new RecoveryError('Pass --confirm-user with the exact DB_USER to authorize this password reset.');
  const { sql, marker } = recoveryStatement(config.DB_USER, config.DB_PASSWORD);
  const client = docker ?? new Docker({ socketPath: config.DOCKER_SOCKET });
  const target = client.getContainer(config.POSTGRES_CONTAINER);
  const info = await target.inspect();
  const options = recoveryContainer(info);
  const dataMount = options.HostConfig!.Mounts![0];
  const hostSource = info.Mounts.find(mount => mount.Destination === dataMount.Target)!.Source;
  const exclusive = async () => {
    const running = await client.listContainers();
    if (running.some(container => container.Mounts?.some(mount =>
      (mount.Type === 'volume' && mount.Name === dataMount.Source) ||
      (mount.Source && hostSource && (mount.Source === hostSource ||
        mount.Source.startsWith(`${hostSource}/`) || hostSource.startsWith(`${mount.Source}/`)))))) {
      throw new RecoveryError('Another running container is using the Postgres data mount. Stop it before recovery.');
    }
  };
  await exclusive();
  const helper = await client.createContainer(options);
  try {
    // Refuse if another operator restarted the main server during preparation.
    if ((await target.inspect()).State.Running) throw new RecoveryError('Postgres restarted during recovery preparation. No reset attempted.');
    await exclusive();
    const result = await execute(client, helper, sql);
    // PostgreSQL standalone mode can exit zero even after an SQL error. Require
    // the actual NOTICE, not a marker merely echoed in an ERROR's SQL context.
    const notice = new RegExp(`(?:^|\\n)[^\\n]*\\bNOTICE:\\s+${marker}\\s*(?:\\r?\\n|$)`);
    if (result.code !== 0 || !notice.test(result.output)) {
      throw new RecoveryError('Password reset was not confirmed. The role may not exist or the data directory may be locked. Raw SQL output is suppressed to protect credentials.');
    }
  } finally {
    // Never delete volumes, remove PGDATA files, rewrite pg_hba.conf, or run initdb.
    try {
      if ((await helper.inspect()).State.Running) await helper.stop({ t: 30 });
      await helper.remove({ v: false });
    } catch {
      throw new RecoveryError('Recovery helper cleanup failed. Keep Postgres stopped and inspect containers labelled sorabase.maintenance=password-recovery before restarting.');
    }
  }
}
