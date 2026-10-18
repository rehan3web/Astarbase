import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyServiceStatus(page: Page, url: string, config: Config, snapshot: (name: string) => Promise<unknown>) {
  const group = page.getByRole('group', { name: 'Service health', exact: true })
  const postgres = group.locator('[aria-label^="PostgreSQL Engine:"]')
  const rls = group.locator('[aria-label^="Row Level Security:"]')
  const pooler = group.locator('[aria-label^="PgBouncer:"]')
  await expect(group).toBeVisible({ timeout: 30000 })
  await expect(postgres).toContainText('Active', { timeout: 30000 })
  await expect(rls).toContainText('Inactive')
  // This isolated fixture has real PostgreSQL but no Docker/PgBouncer daemon.
  await expect(pooler).toContainText('Inactive')
  const endpoint = `${url}/api/studio/databases/${config.DB_NAME}/metrics/status`
  const response = await page.request.get(endpoint)
  assert.equal(response.status(), 200)
  const body = await response.json()
  assert.equal(body.postgres.active, true)
  assert.equal(body.rls.active, false)
  assert.equal(body.pgbouncer.active, false)
  assert.ok(body.pgbouncer.error)
  for (const text of ['Version not exposed', 'Status not exposed', 'Policies not exposed', 'Pooler metrics not exposed']) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0)
  }
  assert.equal(await group.locator('[data-metric-card]').count(), 0)
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  await expect(refresh).toBeEnabled({ timeout: 30000 })
  await withDatabase(config, config.DB_NAME, client => client.query('ALTER TABLE public.items ENABLE ROW LEVEL SECURITY'))
  await refresh.click()
  await expect(rls).toContainText('Active')
  assert.equal((await (await page.request.get(endpoint)).json()).rls.active, true)
  await expect(refresh).toBeEnabled({ timeout: 30000 })
  await snapshot('compact-service-status-dark')
  await withDatabase(config, config.DB_NAME, client => client.query('ALTER TABLE public.items DISABLE ROW LEVEL SECURITY'))
  await refresh.click()
  await expect(rls).toContainText('Inactive')
  await expect(refresh).toBeEnabled({ timeout: 30000 })
  await page.route('**/metrics/status', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Status endpoint unavailable' }),
  }))
  await refresh.click()
  await expect(postgres).toContainText('Unavailable')
  await expect(rls).toContainText('Unavailable')
  await expect(pooler).toContainText('Unavailable')
  await expect(group.getByRole('alert')).toContainText('Status check failed')
  await page.unroute('**/metrics/status')
  await expect(refresh).toBeEnabled({ timeout: 30000 })
  await refresh.click()
  await expect(postgres).toContainText('Active')
  console.log('PASS: compact real PostgreSQL/RLS service statuses, absent PgBouncer, refresh, error and recovery')
}
