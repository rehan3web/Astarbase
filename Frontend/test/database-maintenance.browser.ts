import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Services } from '../../Backend/src/services/index'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyDatabaseMaintenance(page: Page, url: string, services: Services, config: Config,
  snapshot: (name: string) => Promise<unknown>) {
  // Only the Docker/PgBouncer boundary is adapted; reset and direct termination
  // still use the real authenticated API and disposable Postgres databases.
  services.pooler.withDisconnected = async (_database, operation) => operation()
  await services.branches.create('maintenance_dev', 'main')
  await services.branches.create('maintenance_child', 'maintenance_dev')
  const targets = [
    { name: 'main', database: config.DB_NAME },
    { name: 'maintenance_dev', database: 'branch_maintenance_dev' },
    { name: 'maintenance_child', database: 'branch_maintenance_child' },
  ]
  for (const { database } of targets) {
    await services.postgres.query(database, 'CREATE TABLE reset_check(id int); INSERT INTO reset_check VALUES(1)')
  }
  const credentials = new Map(await Promise.all(targets.map(async ({ database }) =>
    [database, await services.clientRoles.get(database)] as const)))
  for (const { name, database } of targets) {
    await page.goto(`${url}/settings/database`)
    await page.getByRole('button', { name: 'Active branch', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(`^${name}\\b`) }).click()
    await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toContainText(name)
    await expect(page.getByRole('button', { name: 'Delete database', exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Connection pool size', { exact: true })).toHaveCount(name === 'main' ? 1 : 0)
    const additional = await page.getByRole('heading', { name: 'Additional', exact: true }).boundingBox()
    const danger = await page.getByRole('heading', { name: 'Danger Zone', exact: true }).boundingBox()
    assert.ok(additional && danger && additional.y < danger.y)
    await withDatabase(config, database, async admin => {
      const pid = (await admin.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await page.getByRole('button', { name: 'Terminate connections', exact: true }).click()
      await expect(page.getByRole('dialog')).toContainText(database)
      await expect(page.getByRole('dialog')).toContainText('Unix admin connections')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.equal((await admin.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, pid)
      await page.getByRole('button', { name: 'Terminate connections', exact: true }).click()
      await snapshot(`${name}-terminate-connections-modal`)
      await page.getByRole('dialog').getByRole('button', { name: 'Terminate connections', exact: true }).click()
      await expect(page.locator('[data-studio-toast]').filter({ hasText: `Client connections for "${database}" terminated.` }).last()).toBeVisible()
      assert.equal((await admin.query('SELECT pg_backend_pid() AS pid')).rows[0].pid, pid)
    })
    const backup = await services.backups.create(database, 'Preserve before reset')
    const inventory = services.catalog.store.branches()
    const others = targets.filter(target => target.database !== database)
    const before = await Promise.all(others.map(target => services.tables.list(target.database)))
    await page.getByRole('button', { name: 'Reset database', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('All schema and data')
    await expect(page.getByRole('dialog')).toContainText(database)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal((await withDatabase(config, database, client => client.query('SELECT count(*)::int AS count FROM reset_check'))).rows[0].count, 1)
    await page.getByRole('button', { name: 'Reset database', exact: true }).click()
    await snapshot(`${name}-reset-database-modal`)
    await page.getByRole('dialog').getByRole('button', { name: 'Reset database', exact: true }).click()
    await expect(page.locator('[data-studio-toast]').filter({ hasText: `Database "${database}" reset.` }).last()).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
    assert.deepEqual(await services.tables.list(database), [])
    assert.deepEqual(services.catalog.store.branches(), inventory)
    assert.deepEqual(await services.clientRoles.get(database), credentials.get(database))
    assert.ok((await services.backups.list(database)).some(item => item.id === backup.id && item.available))
    for (let index = 0; index < others.length; index++) {
      assert.deepEqual(await services.tables.list(others[index].database), before[index])
    }
  }
  console.log('PASS: main/branch/child warning dialogs, cancel, selected-only full database reset, preserved passwords/backups and Unix admin sessions')
}
