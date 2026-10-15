import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatStartupFailure, startupStep, StartupFailure } from '../src/services/system/startup.service.js';
import { loadConfig } from '../src/config.js';

test('startup steps report the exact stage for synchronous and asynchronous failures', async () => {
  const messages: string[] = [];
  assert.equal(await startupStep('docker', () => 7, message => messages.push(message)), 7);
  assert.match(messages[0], /Docker Unix socket/);
  for (const operation of [
    () => { throw Object.assign(new Error('connect EACCES /var/run/docker.sock'), { code: 'EACCES' }); },
    async () => { throw Object.assign(new Error('connect EACCES /var/run/docker.sock'), { code: 'EACCES' }); },
  ]) {
    await assert.rejects(startupStep('docker', operation, () => {}), error => {
      assert.ok(error instanceof StartupFailure);
      assert.match(formatStartupFailure(error, {}), /Startup failed \[docker\] \(EACCES\).*connect EACCES/);
      return true;
    });
  }
});

test('startup diagnostics redact raw, encoded and escaped secrets without hiding the useful error', () => {
  const env = {
    DB_PASSWORD: 'private-password-$"\\quote',
    ADMIN_API_TOKEN: 'private-token-that-must-never-leak-000000',
    SESSION_SECRET: 'private-session-secret',
  };
  const raw = `${env.DB_PASSWORD} ${encodeURIComponent(env.DB_PASSWORD)} ${JSON.stringify(env.DB_PASSWORD).slice(1, -1)} ${env.ADMIN_API_TOKEN} ${env.SESSION_SECRET}`;
  const failure = new StartupFailure('docker', Object.assign(new Error(`Docker failure ${raw}`), { statusCode: 400 }));
  const output = formatStartupFailure(failure, env);
  for (const secret of Object.values(env)) assert.equal(output.includes(secret), false);
  assert.equal(output.includes(encodeURIComponent(env.DB_PASSWORD)), false);
  assert.match(output, /HTTP 400.*Docker failure/);
  assert.match(output, /Docker permissions\/API compatibility/);
  assert.doesNotMatch(formatStartupFailure(new Error('postgres://user:unknown-password@host/db Authorization: Bearer unknown-token'), {}), /unknown-password|unknown-token/);
});

test('invalid configuration shows field names and constraints, not submitted values', async () => {
  const env = { DB_NAME: 'project', DB_USER: 'project_admin', DB_PASSWORD: 'short-secret', ADMIN_API_TOKEN: 'too-short-token' };
  await assert.rejects(startupStep('configuration', () => loadConfig(env), () => {}), error => {
    const output = formatStartupFailure(error, env);
    assert.match(output, /Startup failed \[configuration\]/);
    assert.match(output, /DB_PASSWORD/);
    assert.match(output, /ADMIN_API_TOKEN/);
    assert.equal(output.includes(env.DB_PASSWORD), false);
    assert.equal(output.includes(env.ADMIN_API_TOKEN), false);
    return true;
  });
});

test('database authentication diagnostics explain existing-volume credentials without recommending data loss', () => {
  const output = formatStartupFailure(new StartupFailure('database', Object.assign(new Error('password authentication failed'), { code: '28P01' })), {});
  assert.match(output, /28P01/);
  assert.match(output, /Changing .env does not change credentials/);
  assert.match(output, /Do not delete volumes/);
  assert.doesNotMatch(output, /at formatStartupFailure/);
});
