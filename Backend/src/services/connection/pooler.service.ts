import type { Config } from '../../config.js';
import { HttpError } from '../../errors.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { DockerService } from '../docker/docker.js';
import { quoteIdentifier } from '../../db/socket.js';

/** PgBouncer is discovered on the same Compose project, never on a remote Docker host. */
export class PoolerService {
  constructor(private config: Config, private catalog: Catalog, private docker: DockerService) {}
  private async container() {
    const postgres = await this.docker.docker.getContainer(this.config.POSTGRES_CONTAINER).inspect();
    const project = postgres.Config.Labels?.['com.docker.compose.project'];
    if (!project) throw new HttpError(503, 'Postgres is not part of the managed Compose deployment');
    const containers = await this.docker.docker.listContainers({ filters: JSON.stringify({
      label: [`com.docker.compose.project=${project}`, 'com.docker.compose.service=pgbouncer'],
    }) });
    if (containers.length !== 1) throw new HttpError(503, 'Managed PgBouncer container is not running');
    return this.docker.docker.getContainer(containers[0].Id);
  }
  private async execute(script: string) {
    const container = await this.container();
    const exec = await container.exec({
      Cmd: ['node', '--input-type=module', '-e', script], AttachStdout: true, AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    if ((await exec.inspect()).ExitCode !== 0) throw new HttpError(503, 'PgBouncer configuration operation failed');
    return { container, output: Buffer.concat(chunks).toString() };
  }
  private async assertMain(database: string) {
    await this.catalog.assertDatabase(database);
    if (database !== this.config.DB_NAME) throw new HttpError(403, 'Pool configuration is available only on main');
  }
  async get(database: string) {
    await this.assertMain(database);
    const { output } = await this.execute(`import {readFile} from 'node:fs/promises';
      const text=await readFile('/etc/pgbouncer/pgbouncer.ini','utf8');
      const size=Number(/^default_pool_size\\s*=\\s*(\\d+)/m.exec(text)?.[1]);
      const limit=Number(/^max_client_conn\\s*=\\s*(\\d+)/m.exec(text)?.[1]);
      if(!Number.isInteger(size) || limit!==200) process.exit(1);
      console.log('POOL_SIZE='+size);`);
    const poolSize = Number(/POOL_SIZE=(\d+)/.exec(output)?.[1]);
    if (!Number.isInteger(poolSize)) throw new HttpError(503, 'Could not read PgBouncer pool size');
    return { poolSize, maxClientConnections: 200 };
  }
  async update(database: string, poolSize: number) {
    await this.assertMain(database);
    if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 80) throw new HttpError(400, 'Pool size must be between 1 and 80');
    return this.catalog.exclusive(async () => {
      const { container } = await this.execute(`import {readFile,writeFile,rename} from 'node:fs/promises';
        const dir='/etc/pgbouncer', file=dir+'/pgbouncer.ini';
        let text=await readFile(file,'utf8');
        if(!/^default_pool_size\\s*=\\s*\\d+/m.test(text)) process.exit(1);
        text=text.replace(/^default_pool_size\\s*=\\s*\\d+/m,'default_pool_size = ${poolSize}');
        await writeFile(dir+'/pool-size.tmp','${poolSize}',{mode:0o600});
        await rename(dir+'/pool-size.tmp',dir+'/pool-size');
        await writeFile(file+'.tmp',text,{mode:0o600}); await rename(file+'.tmp',file);`);
      await container.kill({ signal: 'SIGHUP' });
      return { poolSize, maxClientConnections: 200 };
    });
  }
  private async control(database: string, action: 'KILL' | 'RESUME') {
    // The admin console is reached inside its container over /tmp's Unix socket.
    // psql receives its password from the container environment, never argv/logs.
    await this.execute(`import {spawnSync} from 'node:child_process';
      function query(sql) {
        const result=spawnSync('psql',['-X','--no-password','--host','/tmp','--port','6432',
          '--username',process.env.DB_USER,'--dbname','pgbouncer','--tuples-only',
          '--no-align','--field-separator','\\t','--set','ON_ERROR_STOP=1','--command',sql],
          {env:{...process.env,PGPASSWORD:process.env.DB_PASSWORD},encoding:'utf8',timeout:15000,maxBuffer:1048576});
        if(result.error || result.status!==0) process.exit(1);
        return result.stdout;
      }
      const names=query('SHOW DATABASES').trim().split('\\n').map(line=>line.split('\\t')[0]);
      if(names.includes(${JSON.stringify(database)})) query(${JSON.stringify(`${action} ${quoteIdentifier(database)}`)});
    `);
  }
  async withDisconnected<T>(database: string, operation: () => Promise<T>): Promise<T> {
    await this.catalog.assertDatabase(database);
    let completed = false;
    try {
      // KILL disconnects both pooled clients and their server sockets, then pauses
      // only this database. Inactive wildcard entries need no disconnect.
      await this.control(database, 'KILL');
      const result = await operation();
      completed = true;
      return result;
    } finally {
      try { await this.control(database, 'RESUME'); }
      catch {
        throw new HttpError(503, completed ?
          'Operation completed, but PgBouncer could not resume this database. Resume it before retrying; do not repeat a completed reset.' :
          'Maintenance failed and PgBouncer could not resume this database. Check the pooler before retrying.');
      }
    }
  }
}
