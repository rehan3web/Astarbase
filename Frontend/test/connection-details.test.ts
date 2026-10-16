import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { formatConnection, type ConnectionMetadata } from '../lib/connection-details'

const metadata: ConnectionMetadata & { host: string } = {
  database: 'branch_dev', user: 'test_admin', host: 'db.example.com',
  directPort: 15432, poolerPort: 16432, sslMode: 'disable',
}
test('real direct/pooler URIs correctly encode credentials and bracket IPv6 addresses', () => {
  const password = "test@:/#%!$`\"'\\password"
  for (const host of ['db.example.com', '2001:db8::10', '[2001:db8::10]']) {
    for (const mode of ['connection-string', 'transaction-pooler'] as const) {
      const uri = new URL(formatConnection({ ...metadata, host }, password, mode))
      assert.equal(decodeURIComponent(uri.username), metadata.user)
      assert.equal(decodeURIComponent(uri.password), password)
      assert.equal(uri.port, mode === 'transaction-pooler' ? '16432' : '15432')
      assert.equal(uri.pathname, '/branch_dev')
      assert.equal(uri.searchParams.get('sslmode'), 'disable')
    }
  }
  for (const mode of ['connection-string', 'transaction-pooler', 'psql', 'parameters'] as const) {
    const value = formatConnection(metadata, null, mode)
    assert.ok(value.includes('****************'))
    assert.equal(value.includes(password), false)
  }
})

test('PSQL and env-style output preserve special passwords without shell interpolation', () => {
  const password = 'test"\'\\ $HOME `echo INJECTION` $(echo INJECTION) # @password'
  const env = formatConnection(metadata, password, 'parameters')
  const environment = JSON.parse(execFileSync('/bin/sh', ['-c',
    `set -a\n${env}\n${JSON.stringify(process.execPath)} -e 'console.log(JSON.stringify({password:process.env.PGPASSWORD,host:process.env.PGHOST,port:process.env.PGPORT}))'`,
  ], { encoding: 'utf8' }))
  assert.deepEqual(environment, { password, host: metadata.host, port: '15432' })
  const psql = formatConnection(metadata, password, 'psql').replace(' psql ', ' capture ')
  const captured = JSON.parse(execFileSync('/bin/sh', ['-c',
    `capture() { ${JSON.stringify(process.execPath)} -e 'console.log(JSON.stringify({password:process.env.PGPASSWORD,args:process.argv.slice(1)}))' -- "$@"; }\n${psql}`,
  ], { encoding: 'utf8' }))
  assert.equal(captured.password, password)
  assert.equal(captured.args.length, 1)
  assert.ok(captured.args[0].includes("host='db.example.com'"))
  assert.ok(captured.args[0].includes("dbname='branch_dev'"))
})
