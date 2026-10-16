import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import type { Config } from '../../config.js';

export class DockerService {
  readonly docker: Docker;
  constructor(private config: Config) {
    this.docker = new Docker({ socketPath: config.DOCKER_SOCKET });
  }

  async ready(): Promise<void> {
    await this.docker.ping();
    const info = await this.docker.getContainer(this.config.POSTGRES_CONTAINER).inspect();
    if (!info.State.Running) throw new Error('Postgres container is not running');
  }

  async stats() {
    // Separate short timeout: never apply this to long-running dump/restore execs.
    const client = new Docker({ socketPath: this.config.DOCKER_SOCKET, timeout: 8000 });
    return client.getContainer(this.config.POSTGRES_CONTAINER).stats({ stream: false });
  }

  async exec(command: string[], timeoutMs = 300000, maxBytes = 8 * 1024 * 1024): Promise<{ stdout: string; stderr: string }> {
    const container = this.docker.getContainer(this.config.POSTGRES_CONTAINER);
    const exec = await container.exec({
      Cmd: command,
      User: 'postgres',
      Env: [`PGPASSWORD=${this.config.DB_PASSWORD}`, `PGHOST=${this.config.PG_SOCKET_DIR}`,
        `PGUSER=${this.config.DB_USER}`, `PGOPTIONS=-c statement_timeout=${this.config.SQL_TIMEOUT_MS}`],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const out = new PassThrough();
    const err = new PassThrough();
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          stream.destroy();
          reject(new Error('Docker operation timed out; inspect the container before retrying'));
        }, timeoutMs);
        const finish = (error?: Error) => {
          clearTimeout(timer);
          error ? reject(error) : resolve();
        };
        const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            stream.destroy();
            finish(new Error('Query output exceeds 8 MiB; use LIMIT or export a backup'));
          } else { chunks.push(chunk); }
        };
        out.on('data', collect(stdout));
        err.on('data', collect(stderr));
        stream.once('error', finish);
        stream.once('end', () => finish());
        this.docker.modem.demuxStream(stream, out, err);
      });
    } finally { stream.destroy(); out.destroy(); err.destroy(); }
    const result = await exec.inspect();
    const output = { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
    if (result.ExitCode !== 0) throw new Error(output.stderr.trim() || `Container command failed (${result.ExitCode})`);
    return output;
  }
}
