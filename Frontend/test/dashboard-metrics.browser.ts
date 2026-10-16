import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Services } from '../../Backend/src/services'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'
import { AdminStore } from '../../Backend/src/db/admin-store'

export async function verifyDashboardMetrics(page: Page, url: string, config: Config, services: Services) {
  await page.goto(url)
  const history = page.getByRole('table', { name: 'Persisted database metric readings, newest first', exact: true })
  await expect(history).toBeVisible({ timeout: 15000 })
  const read = async () => {
    const response = await page.request.get(`${url}/api/studio/databases/${config.DB_NAME}/metrics?hours=1&limit=720`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const first = await read()
  assert.ok(first.latest.databaseSizeBytes > 0)
  assert.equal(typeof first.latest.connections, 'number')
  assert.ok(first.latest.maxConnections > 0)
  assert.equal(first.computeScope, 'postgres-container')
  assert.equal(JSON.stringify(first).includes(config.DB_PASSWORD), false)
  assert.equal(first.events.some((event: { kind: string; status: string }) => event.kind === 'query' && event.status === 'error'), true)
  assert.equal(first.activity.buckets.length, 24)
  const runs = first.activity.buckets.reduce((total: number, bucket: { runs: { succeeded: number; slow: number; failed: number } | null }) =>
    total + (bucket.runs ? bucket.runs.succeeded + bucket.runs.slow + bucket.runs.failed : 0), 0)
  assert.equal(runs, 2)
  await expect(page.getByRole('button', { name: 'Show run activity', exact: true })).toBeVisible()
  const chart = page.getByRole('region', { name: 'Sync Activity', exact: true })
  await expect(chart.getByRole('img')).toHaveCount(24)
  await expect(chart.getByRole('img').last()).toHaveAttribute('aria-label', /Succeeded.*1.*Failed.*1/)
  await chart.getByRole('img').last().focus()
  await expect(chart.getByRole('tooltip')).toBeVisible()
  await page.getByRole('button', { name: 'Show row changes', exact: true }).click()
  await expect(page.getByText('Inserted', { exact: true })).toBeVisible()
  await expect(page.getByText('Updated', { exact: true })).toBeVisible()
  await expect(page.getByText('Deleted', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show run activity', exact: true }).click()
  await expect(page.getByText('Succeeded', { exact: true })).toBeVisible()
  await expect(page.getByText('Slow', { exact: true })).toBeVisible()
  // Real PostgreSQL work and real elapsed time produce the next sample.
  await withDatabase(config, config.DB_NAME, async client => {
    await client.query('INSERT INTO items(name) VALUES($1)', ['metrics test'])
    await client.query("DELETE FROM items WHERE name=$1", ['metrics test'])
    await client.query('SELECT pg_stat_force_next_flush()')
  })
  await new Promise(resolve => setTimeout(resolve, 1100))
  await services.metrics.collect(config.DB_NAME)
  const updated = await read()
  assert.equal(typeof updated.latest.transactionsPerSecond, 'number')
  assert.equal(typeof updated.latest.rowsChangedPerSecond, 'number')
  assert.ok(Date.parse(updated.latest.sampledAt) > Date.parse(first.latest.sampledAt))
  const reopened = new AdminStore(config)
  try { assert.equal(reopened.metrics.latest(config.DB_NAME)?.sampledAt, updated.latest.sampledAt) }
  finally { reopened.close() }

  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Refreshing…', { exact: true })).toHaveCount(0)
  await expect(history).toBeVisible()
  await expect(page.getByText('Not exposed by API', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Activity metrics are not returned by the current admin API.', { exact: true })).toHaveCount(0)
  for (const [label, hours] of [['1 hour', 1], ['7 days', 168], ['24 hours', 24]] as const) {
    const response = page.waitForResponse(r => r.url().includes(`/metrics?hours=${hours}&`) && r.status() === 200)
    await Promise.all([response, page.getByRole('button', { name: label, exact: true }).click()])
    await expect(history).toBeVisible()
  }
  await page.route('**/metrics?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Metrics temporarily unavailable"}',
  }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toBeVisible()
  await expect(history).toBeVisible()
  await page.unroute('**/metrics?*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toHaveCount(0)
  await expect(history).toBeVisible()
  console.log('PASS: real PostgreSQL metrics, SQLite persisted history, activity metadata, time ranges and failure recovery without synthetic values')
}
