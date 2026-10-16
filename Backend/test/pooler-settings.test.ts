import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from './helpers.js';
import { Catalog } from '../src/services/admin/catalog.service.js';
import { PoolerService } from '../src/services/connection/pooler.service.js';
import type { DockerService } from '../src/services/docker/docker.js';

test('pool settings use only the matching Compose container, reload once, reject branches and fixed-limit changes', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'astarbase-pool-settings-'));
  const options = { ...config, ADMIN_DATA_DIR: directory };
  const catalog = new Catalog(options);
  t.after(async () => { catalog.store.close(); await rm(directory, { recursive: true, force: true }); });
  catalog.store.addBranch('dev', 'branch_dev', 'main');
  catalog.exclusive = async operation => operation();
  const scripts: string[] = [], signals: string[] = [];
  let exitCode = 0, poolSize = 20;
  const container = {
    async exec({ Cmd }: { Cmd: string[] }) {
      assert.deepEqual(Cmd.slice(0, 3), ['node', '--input-type=module', '-e']);
      scripts.push(Cmd[3]);
      const saved = /default_pool_size = (\d+)/.exec(Cmd[3]);
      if (saved) poolSize = Number(saved[1]);
      return {
        async start() { return Readable.from([Buffer.from(`POOL_SIZE=${poolSize}\n`)]); },
        async inspect() { return { ExitCode: exitCode }; },
      };
    },
    async kill({ signal }: { signal: string }) { signals.push(signal); },
  };
  const docker = { docker: {
    getContainer(id: string) {
      if (id === config.POSTGRES_CONTAINER) return { async inspect() {
        return { Config: { Labels: { 'com.docker.compose.project': 'test-project' } } };
      } };
      assert.equal(id, 'matching-pooler');
      return container;
    },
    async listContainers({ filters }: { filters: string }) {
      assert.deepEqual(JSON.parse(filters), { label: [
        'com.docker.compose.project=test-project', 'com.docker.compose.service=pgbouncer',
      ] });
      return [{ Id: 'matching-pooler' }];
    },
  } } as unknown as DockerService;
  const pool = new PoolerService(options, catalog, docker);
  assert.deepEqual(await pool.get(config.DB_NAME), { poolSize: 20, maxClientConnections: 200 });
  assert.deepEqual(await pool.update(config.DB_NAME, 35), { poolSize: 35, maxClientConnections: 200 });
  assert.deepEqual(signals, ['SIGHUP']);
  assert.ok(scripts.some(script => script.includes("rename(dir+'/pool-size.tmp',dir+'/pool-size')")));
  await assert.rejects(pool.get('branch_dev'), /only on main/);
  await assert.rejects(pool.update('branch_dev', 20), /only on main/);
  await assert.rejects(pool.get('unknown'), /Managed database not found/);
  for (const size of [0, 81, 2.5, NaN]) await assert.rejects(pool.update(config.DB_NAME, size), /between 1 and 80/);
  const start = scripts.length;
  assert.equal(await pool.withDisconnected('branch_dev', async () => 'completed'), 'completed');
  assert.equal(scripts.length, start + 2);
  assert.ok(scripts[start].includes('KILL \\"branch_dev\\"'));
  assert.ok(scripts[start + 1].includes('RESUME \\"branch_dev\\"'));
  assert.ok(scripts[start].includes("'--host','/tmp'"));
  assert.ok(scripts[start].includes('PGPASSWORD:process.env.DB_PASSWORD'));
  assert.ok(scripts[start].includes('SHOW DATABASES'));
  assert.ok(scripts[start].includes('names.includes("branch_dev")'));
  await assert.rejects(pool.withDisconnected('branch_dev', async () => { throw new Error('injected operation failure'); }), /injected operation failure/);
  assert.ok(scripts.at(-1)!.includes('RESUME \\"branch_dev\\"'));
  await assert.rejects(pool.withDisconnected('unknown', async () => 1), /Managed database not found/);
  exitCode = 1;
  await assert.rejects(pool.get(config.DB_NAME), /configuration operation failed/);
  await assert.rejects(pool.withDisconnected('branch_dev', async () => 1), /could not resume/);
});
