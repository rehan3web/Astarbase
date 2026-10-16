import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectDir } from '../src/config.js';

const available = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' }).status === 0;
test('Compose alone loads root .env and wires all four services in dependency order', { skip: !available }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-compose-test-'));
  try {
    // No daemon or real credentials: `config` only validates/interpolates YAML.
    const token = 'compose-test-token-not-for-deployment-00000000';
    writeFileSync(path.join(dir, '.env'), [
      'DB_NAME=compose_project', 'DB_USER=compose_admin',
      'DB_PASSWORD=compose-test-password-0000', `ADMIN_API_TOKEN=${token}`,
      'SESSION_SECRET=compose-private-cookie-secret-not-for-deployment-0000',
      'ADMIN_USERNAME=compose_owner', 'ADMIN_EMAIL=owner@example.test',
      'ADMIN_PASSWORD=compose-login-password-not-for-deployment',
    ].join('\n'));
    const output = execFileSync('docker', ['--host', 'unix:///var/run/docker.sock', 'compose',
      '--project-directory', dir, '-f', path.join(projectDir, 'docker-compose.yml'), 'config', '--format', 'json'], {
      cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    const { services } = JSON.parse(output);
    assert.deepEqual(Object.keys(services).sort(), ['frontend', 'pgbouncer', 'postgres', 'studio']);
    assert.equal(services.postgres.environment.POSTGRES_DB, 'compose_project');
    assert.equal(services.studio.environment.AUTO_START_COMPOSE, 'false');
    assert.equal(services.frontend.environment.ADMIN_API_TOKEN, token);
    assert.notEqual(services.frontend.environment.SESSION_SECRET, token);
    assert.equal(services.studio.environment.ADMIN_USERNAME, 'compose_owner');
    assert.equal(services.frontend.environment.ADMIN_PASSWORD, undefined);
    assert.equal(services.studio.environment.DB_USER, 'compose_admin');
    assert.equal(services.frontend.depends_on.studio.condition, 'service_healthy');
    assert.equal(services.studio.depends_on.postgres.condition, 'service_healthy');
    assert.equal(services.studio.depends_on.pgbouncer.condition, 'service_healthy');
    assert.equal(services.frontend.environment.ADMIN_SOCKET_PATH, '/var/run/astarbase/admin.sock');
    assert.ok(services.frontend.volumes.some((v: { target: string }) => v.target === '/var/run/astarbase'));
    assert.ok(services.studio.volumes.some((v: { target: string }) => v.target === '/var/run/astarbase'));
    assert.equal(services.frontend.volumes.some((v: { target: string }) => v.target === '/var/run/docker.sock'), false);
    assert.ok(services.studio.build.dockerfile.endsWith('Backend/dockerfile'));
    assert.ok(services.frontend.build.dockerfile.endsWith('Frontend/dockerfile'));
    for (const name of ['postgres', 'pgbouncer']) assert.equal(services[name].ports[0].host_ip, '0.0.0.0');
    assert.equal(services.frontend.ports[0].host_ip, '0.0.0.0');
    assert.equal(services.frontend.ports[0].published, '5000');
    assert.equal(services.studio.ports[0].host_ip, '127.0.0.1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
