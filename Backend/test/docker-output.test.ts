import assert from 'node:assert/strict';
import test from 'node:test';
import { dockerStdout } from '../src/services/docker/output.js';
import { PassThrough, Readable } from 'node:stream';
import { DockerService } from '../src/services/docker/docker.js';
import type { Config } from '../src/config.js';

function frame(channel: number, data: Buffer) {
  const header = Buffer.alloc(8);
  header[0] = channel; header.writeUInt32BE(data.length, 4);
  return Buffer.concat([header, data]);
}
async function collect(chunks: Buffer[], stderr = { text: '' }) {
  const result: Buffer[] = [];
  for await (const chunk of dockerStdout((async function* () { yield* chunks; })(), stderr)) result.push(chunk);
  return Buffer.concat(result);
}
test('Docker SQL stdout handles split headers, interleaved stderr and large exports', async () => {
  const wire = Buffer.concat([frame(1, Buffer.from('SELECT ')), frame(2, Buffer.from('warning')), frame(1, Buffer.from('42;'))]);
  const stderr = { text: '' };
  assert.equal((await collect([...wire].map(byte => Buffer.from([byte])), stderr)).toString(), 'SELECT 42;');
  assert.equal(stderr.text, 'warning');
  const large = Buffer.alloc(9 * 1024 * 1024, 65);
  assert.deepEqual(await collect([frame(1, large)]), large);
});
test('Docker SQL stdout rejects truncated frames and caps diagnostic output', async () => {
  const wire = frame(1, Buffer.from('SELECT 42;'));
  await assert.rejects(collect([wire.subarray(0, -1)]), /interrupted/);
  await assert.rejects(collect([wire.subarray(0, 5)]), /interrupted/);
  const stderr = { text: '' };
  await collect([frame(2, Buffer.alloc(100000, 65))], stderr);
  assert.equal(stderr.text.length, 65536);
});

test('Docker SQL export streams past 8 MiB, keeps response open and checks exit status', async () => {
  const docker = new DockerService({ DOCKER_SOCKET: '/tmp/test-docker.sock', POSTGRES_CONTAINER: 'fixture' } as Config);
  const payload = Buffer.alloc(9 * 1024 * 1024, 65);
  let exitCode = 0;
  Object.defineProperty(docker.docker, 'getContainer', { value: () => ({
    exec: async () => ({
      start: async () => Readable.from([frame(1, payload)]),
      inspect: async () => ({ ExitCode: exitCode }),
    }),
  }) });
  const output = new PassThrough();
  let bytes = 0;
  output.on('data', chunk => { bytes += chunk.length; });
  await docker.execTo(['pg_restore', '--file=-', 'test.dump'], output);
  assert.equal(bytes, payload.length);
  assert.equal(output.writableEnded, false);
  output.end();
  exitCode = 1;
  const failed = new PassThrough();
  failed.resume();
  await assert.rejects(docker.execTo(['pg_restore'], failed), /SQL export failed/);
  failed.destroy();
});
