import type { Config } from '../../config.js';
import { HttpError } from '../../errors.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { DockerService } from '../docker/docker.js';

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
}
