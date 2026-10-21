import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectDir } from '../src/config.js';

const realDocker = spawnSync('sh', ['-c', 'command -v docker'], { encoding: 'utf8' }).stdout.trim();
const composeAvailable = !!realDocker && spawnSync(realDocker, ['compose', 'version'], { stdio: 'ignore' }).status === 0;
const secretInputs = {
  db: 'test-db-$literal# "quote" \'single\' \\\\end\\',
  admin: 'test-admin-$(touch PWNED)-${HOME}-#-"\\',
};

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sorabase-installer-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  mkdirSync(path.join(root, 'Backend'));
  for (const file of ['setup.sh', '.env.example', 'docker-compose.yml']) {
    copyFileSync(path.join(projectDir, file), path.join(root, file));
  }
  const log = path.join(root, 'commands.jsonl');
  // Every daemon command is mocked. Only Compose config parsing reaches the
  // real CLI, which requires neither a daemon nor production credentials.
  writeFileSync(path.join(bin, 'docker'), `#!${process.execPath}
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args.includes('version') || args.includes('info')) process.exit(0);
if (args.includes('config')) {
  try { process.stdout.write(cp.execFileSync(process.env.REAL_DOCKER, args, { env: process.env })); }
  catch (e) { process.stderr.write(e.stderr || 'Invalid Compose configuration'); process.exit(1); }
} else if (args.includes('up')) {
  if (process.env.FAIL_UP) { console.error('mock healthcheck failure'); process.exit(1); }
} else if (args.includes('down')) {
  if (process.env.FAIL_DOWN) { console.error('mock removal failure'); process.exit(1); }
} else if (args.includes('port')) {
  console.log('0.0.0.0:' + (process.env.FAKE_PORT || '5000'));
} else if (args.includes('volume') && args.includes('ls')) {
  if (process.env.EXISTING_VOLUMES) console.log('sorabase_postgres-data');
} else { console.error('Unexpected mocked Docker command'); process.exit(1); }
`);
  chmodSync(path.join(bin, 'docker'), 0o700);
  writeFileSync(path.join(bin, 'hostname'), '#!/usr/bin/env bash\nprintf "198.51.100.42 10.0.0.1\\n"\n');
  chmodSync(path.join(bin, 'hostname'), 0o700);
  const environment = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, REAL_DOCKER: realDocker,
    DB_NAME: 'wrong_exported_database', DB_PASSWORD: 'wrong-exported-password',
    SESSION_SECRET: 'wrong-exported-session', COMPOSE_PROJECT_NAME: 'unrelated_project',
  };
  const run = (input: string, extra: Record<string, string> = {}, script = path.join(root, 'setup.sh')) => {
    const result = spawnSync('bash', [script], {
      cwd: tmpdir(), input, encoding: 'utf8', timeout: 30_000, env: { ...environment, ...extra },
    });
    assert.ifError(result.error);
    return { ...result, output: result.stdout + result.stderr };
  };
  const commands = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]) : [];
  const config = () => JSON.parse(execFileSync(realDocker, [
    '--host', 'unix:///var/run/docker.sock', 'compose', '--project-directory', root,
    '--env-file', path.join(root, '.env'), '-f', path.join(root, 'docker-compose.yml'),
    'config', '--format', 'json',
  ], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } }));
  const install = () => run(`1\nproject_db\nproject_admin\n${secretInputs.db}\nstudio_owner\nowner@example.test\n${secretInputs.admin}\n`);
  return { root, log, run, commands, config, install, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function standalone(f: ReturnType<typeof fixture>) {
  const directory = path.join(f.root, 'standalone');
  mkdirSync(directory);
  const script = path.join(directory, 'setup.sh');
  copyFileSync(path.join(f.root, 'setup.sh'), script);
  writeFileSync(path.join(f.root, 'bin/git'), `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(['git', ...args]) + '\\n');
if (process.env.FAIL_CLONE) {
  fs.mkdirSync(args.at(-1), { recursive: true });
  process.exit(1);
}
const destination = args.at(-1);
fs.mkdirSync(path.join(destination, 'Backend'), { recursive: true });
for (const file of ['docker-compose.yml', '.env.example'])
  fs.copyFileSync(path.join(${JSON.stringify(f.root)}, file), path.join(destination, file));
`);
  chmodSync(path.join(f.root, 'bin/git'), 0o700);
  return { directory, script, destination: path.join(directory, 'Sorabase') };
}

test('standalone install clones the fixed GitHub repository then reuses its saved configuration', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    const s = standalone(f);
    const result = f.run('1\n\n\nvalid-db-password-123\n\nowner@example.test\nvalid-admin-password\n', {}, s.script);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Downloading Sorabase from GitHub/);
    assert.match(result.output, /Sorabase Installed/);
    const env = readFileSync(path.join(s.destination, '.env'), 'utf8');
    const retry = f.run('1\n', {}, s.script);
    assert.equal(retry.status, 0, retry.output);
    assert.match(retry.output, /Using existing repository/);
    assert.equal(readFileSync(path.join(s.destination, '.env'), 'utf8'), env);
    const clones = f.commands().filter(args => args[0] === 'git');
    assert.equal(clones.length, 1);
    assert.deepEqual(clones[0].slice(0, -1), ['git', 'clone', '--depth', '1', '--branch', 'main', '--', 'https://github.com/rehan3web/Astarbase.git']);
    assert.ok(f.commands().filter(args => args.includes('up')).every(args => args.includes(s.destination)));
    const removed = f.run('2\nconfirm\n', {}, s.script);
    assert.equal(removed.status, 0, removed.output);
    assert.match(removed.output, /Sorabase Uninstalled/);
    assert.equal(existsSync(path.join(s.destination, '.env')), false);
    assert.equal(existsSync(s.script), true);
    assert.equal(f.commands().filter(args => args[0] === 'git').length, 1);
  } finally { f.clean(); }
});

test('standalone failed download cleans temporary files and never starts Docker', () => {
  const f = fixture();
  try {
    const s = standalone(f);
    const result = f.run('1\n', { FAIL_CLONE: '1' }, s.script);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /GitHub download failed/);
    assert.equal(existsSync(s.destination), false);
    assert.equal(f.commands().some(args => args[0] !== 'git'), false);
    // A second attempt can clone again; no partial destination blocks it.
    const retry = f.run('1\n', { FAIL_CLONE: '1' }, s.script);
    assert.match(retry.output, /GitHub download failed/);
    assert.equal(f.commands().filter(args => args[0] === 'git').length, 2);
  } finally { f.clean(); }
});

test('standalone uninstall and Exit never clone; occupied download paths are not overwritten', () => {
  const f = fixture();
  try {
    const s = standalone(f);
    assert.equal(f.run('3\n', {}, s.script).status, 0);
    const missing = f.run('2\nconfirm\n', {}, s.script);
    assert.notEqual(missing.status, 0);
    assert.match(missing.output, /No existing Sorabase installation/);
    mkdirSync(s.destination);
    writeFileSync(path.join(s.destination, 'keep'), 'original');
    assert.notEqual(f.run('1\n', {}, s.script).status, 0);
    assert.equal(readFileSync(path.join(s.destination, 'keep'), 'utf8'), 'original');
    rmSync(s.destination, { recursive: true });
    symlinkSync(f.root, s.destination);
    assert.notEqual(f.run('1\n', {}, s.script).status, 0);
    assert.deepEqual(f.commands(), []);
  } finally { f.clean(); }
});

test('installer passes Bash syntax check; Exit never invokes Docker or writes .env', () => {
  execFileSync('bash', ['-n', path.join(projectDir, 'setup.sh')]);
  const f = fixture();
  try {
    const result = f.run('3\n');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Standard Install[\s\S]*Uninstall[\s\S]*Exit/);
    assert.equal(existsSync(path.join(f.root, '.env')), false);
    assert.deepEqual(f.commands(), []);
  } finally { f.clean(); }
});

test('Standard Install copies defaults, safely preserves special input, creates independent secrets and waits for health', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    const result = f.install();
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Sorabase Installed/);
    assert.match(result.output, /Studio IP : http:\/\/198\.51\.100\.42:5000/);
    const { name, services } = f.config();
    assert.equal(name, 'sorabase');
    assert.equal(services.postgres.environment.POSTGRES_DB, 'project_db');
    assert.equal(services.postgres.environment.POSTGRES_USER, 'project_admin');
    // Compose's canonical config output re-escapes literal $ as $$ so it can be
    // loaded again. That serialization is not the value passed to containers.
    assert.equal(services.postgres.environment.POSTGRES_PASSWORD.replaceAll('$$', '$'), secretInputs.db);
    assert.equal(services.studio.environment.ADMIN_USERNAME, 'studio_owner');
    assert.equal(services.studio.environment.ADMIN_EMAIL, 'owner@example.test');
    assert.equal(services.studio.environment.ADMIN_PASSWORD.replaceAll('$$', '$'), secretInputs.admin);
    const interpolation = execFileSync(realDocker, [
      '--host', 'unix:///var/run/docker.sock', 'compose', '--project-directory', f.root,
      '--env-file', path.join(f.root, '.env'), '-f', path.join(f.root, 'docker-compose.yml'),
      'config', '--environment',
    ], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } });
    assert.ok(interpolation.split('\n').includes(`DB_PASSWORD=${secretInputs.db}`));
    assert.ok(interpolation.split('\n').includes(`ADMIN_PASSWORD=${secretInputs.admin}`));
    assert.match(services.studio.environment.ADMIN_API_TOKEN, /^[a-f0-9]{64}$/);
    assert.match(services.frontend.environment.SESSION_SECRET, /^[a-f0-9]{64}$/);
    assert.notEqual(services.studio.environment.ADMIN_API_TOKEN, services.frontend.environment.SESSION_SECRET);
    assert.equal(statSync(path.join(f.root, '.env')).mode & 0o777, 0o600);
    assert.equal(existsSync(path.join(f.root, 'PWNED')), false);
    assert.equal(existsSync(path.join(f.root, '.sorabase-setup.lock')), false);
    for (const value of [secretInputs.db, secretInputs.admin, services.studio.environment.ADMIN_API_TOKEN, services.frontend.environment.SESSION_SECRET]) {
      assert.equal(result.output.includes(value), false);
      assert.equal(readFileSync(f.log, 'utf8').includes(value), false);
    }
    const up = f.commands().find(args => args.includes('up'))!;
    assert.ok(up.includes('--build') && up.includes('--wait') && up.includes('-d'));
    assert.ok(up.includes('--wait-timeout') && up.includes('600'));
    assert.equal(up[1], 'unix:///var/run/docker.sock');
  } finally { f.clean(); }
});

test('invalid fields retry without accepting bad input, then valid input installs', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    const result = f.run('1\nBAD DB\nvalid_db\nbad-user\nvalid_admin\nshort\nvalid-db-password-123\nx\nvalid_owner\nbad-email\nowner@example.test\nshort\nvalid-admin-password\n');
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Database password must be at least 16/);
    assert.match(result.output, /Admin password must be 12-256/);
    assert.match(result.output, /Enter a valid admin email/);
    assert.equal(f.config().services.postgres.environment.POSTGRES_DB, 'valid_db');
  } finally { f.clean(); }
});

test('failed startup retains .env; retry reuses secrets and reports actual mapped port', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    const result = f.run('1\n\n\nvalid-db-password-123\n\nowner@example.test\nvalid-admin-password\n', { FAIL_UP: '1' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.output, /Sorabase Installed/);
    assert.match(result.output, /Configuration and data have been preserved/);
    const before = readFileSync(path.join(f.root, '.env'), 'utf8');
    writeFileSync(path.join(f.root, '.env'), before.replace('STUDIO_PORT=5000', 'STUDIO_PORT=5050'));
    const retry = f.run('1\n', { FAKE_PORT: '5050' });
    assert.equal(retry.status, 0, retry.output);
    assert.match(retry.output, /Reusing it/);
    assert.match(retry.output, /http:\/\/198\.51\.100\.42:5050/);
    assert.equal(readFileSync(path.join(f.root, '.env'), 'utf8'), before.replace('STUDIO_PORT=5000', 'STUDIO_PORT=5050'));
    assert.equal(f.commands().some(args => args.includes('down')), false);
  } finally { f.clean(); }
});

test('uninstall requires exact confirmation and deletes only project resources and local runtime data', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    assert.equal(f.install().status, 0);
    for (const dir of ['data', 'backups']) {
      mkdirSync(path.join(f.root, 'Backend', dir));
      writeFileSync(path.join(f.root, 'Backend', dir, 'test-data'), 'fixture');
    }
    writeFileSync(path.join(f.root, 'source-kept.txt'), 'not runtime data');
    const declined = f.run('2\nCONFIRM\n');
    assert.equal(declined.status, 0, declined.output);
    assert.match(declined.output, /Nothing was removed/);
    assert.equal(existsSync(path.join(f.root, '.env')), true);
    assert.equal(f.commands().some(args => args.includes('down')), false);
    const confirmed = f.run('2\nconfirm\n');
    assert.equal(confirmed.status, 0, confirmed.output);
    assert.match(confirmed.output, /Sorabase Uninstalled/);
    assert.equal(existsSync(path.join(f.root, '.env')), false);
    assert.equal(existsSync(path.join(f.root, 'Backend/data')), false);
    assert.equal(existsSync(path.join(f.root, 'Backend/backups')), false);
    assert.equal(existsSync(path.join(f.root, 'source-kept.txt')), true);
    assert.equal(existsSync(path.join(f.root, 'setup.sh')), true);
    const down = f.commands().find(args => args.includes('down'))!;
    assert.ok(down.includes('--volumes') && down.includes('--rmi') && down.includes('all'));
    assert.equal(down[1], 'unix:///var/run/docker.sock');
    assert.equal(f.commands().some(args => args.includes('prune')), false);
  } finally { f.clean(); }
});

test('failed uninstall preserves local data and configuration for recovery', { skip: !composeAvailable }, () => {
  const f = fixture();
  try {
    assert.equal(f.install().status, 0);
    mkdirSync(path.join(f.root, 'Backend/data'));
    writeFileSync(path.join(f.root, 'Backend/data/keep'), 'fixture');
    const result = f.run('2\nconfirm\n', { FAIL_DOWN: '1' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.output, /Sorabase Uninstalled/);
    assert.equal(existsSync(path.join(f.root, '.env')), true);
    assert.equal(existsSync(path.join(f.root, 'Backend/data/keep')), true);
  } finally { f.clean(); }
});

test('missing .env with existing data/volumes refuses a fresh install; missing uninstall config deletes nothing', () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, 'Backend/data'));
    writeFileSync(path.join(f.root, 'Backend/data/keep'), 'fixture');
    assert.notEqual(f.run('1\n').status, 0);
    assert.equal(existsSync(path.join(f.root, '.env')), false);
    assert.notEqual(f.run('1\n', { EXISTING_VOLUMES: '1' }).status, 0);
    const result = f.run('2\nconfirm\n');
    assert.notEqual(result.status, 0);
    assert.equal(f.commands().some(args => args.includes('up') || args.includes('down')), false);
    assert.equal(existsSync(path.join(f.root, 'Backend/data/keep')), true);
  } finally { f.clean(); }
});

test('symbolic links and concurrent setup are rejected before touching Docker', () => {
  const f = fixture();
  try {
    symlinkSync(path.join(f.root, '.env.example'), path.join(f.root, '.env'));
    assert.notEqual(f.run('1\n').status, 0);
    assert.deepEqual(f.commands(), []);
    rmSync(path.join(f.root, '.env'));
    symlinkSync(tmpdir(), path.join(f.root, 'Backend/data'));
    assert.notEqual(f.run('2\nconfirm\n').status, 0);
    assert.deepEqual(f.commands(), []);
    unlinkSync(path.join(f.root, 'Backend/data'));
    mkdirSync(path.join(f.root, '.sorabase-setup.lock'));
    assert.notEqual(f.run('1\n').status, 0);
    assert.deepEqual(f.commands(), []);
  } finally { f.clean(); }
});
