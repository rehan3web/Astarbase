import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { projectDir } from '../src/config.js';

const script = path.join(projectDir, 'docker/postgres/network-policy.sh');
test('Postgres guard rejects admin over IPv4/IPv6 including replication and preserves original HBA rules by include', () => {
  const policy = execFileSync('sh', [script, 'example_admin', '/var/lib/postgresql/data'], { encoding: 'utf8' });
  assert.match(policy, /^local all "example_admin" scram-sha-256$/m);
  for (const database of ['all', 'replication']) {
    for (const address of ['0.0.0.0/0', '::/0']) {
      assert.ok(policy.includes(`host ${database} "example_admin" ${address} reject\n`));
    }
  }
  assert.match(policy, /include "\/var\/lib\/postgresql\/data\/pg_hba.conf"\n$/);
  assert.doesNotMatch(policy, /\btrust\b/);
  const entry = readFileSync(path.join(projectDir, 'docker/postgres/entrypoint.sh'), 'utf8');
  assert.ok(entry.includes('hba_file=$policy'));
  const compose = readFileSync(path.join(projectDir, 'docker-compose.yml'), 'utf8');
  assert.ok(compose.includes('./docker/postgres/network-policy.sh:/usr/local/bin/sorabase-network-policy.sh:ro'));
});

test('invalid policy inputs fail closed instead of generating injectable authentication rules', () => {
  for (const [user, data] of [['bad user', '/data'], ['admin\nhost all all all trust', '/data'],
    ['admin', 'relative'], ['admin', "/data'"]]) {
    assert.throws(() => execFileSync('sh', [script, user, data], { stdio: 'pipe' }));
  }
});
