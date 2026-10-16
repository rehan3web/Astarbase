import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Services } from '../../Backend/src/services'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'
import { AdminStore } from '../../Backend/src/db/admin-store'

export async function verifyDashboardMetrics(page: Page, url: string, config: Config, services: Services) {
  await page.goto(url)
  const chart = page.getByRole('region', { name: 'Sync Activity', exact: true })
  await expect(chart.getByRole('img')).toHaveCount(1, { timeout: 15000 })
  for (const heading of ['Recorded telemetry', 'Recorded readings', 'Recorded Studio activity']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0)
  }
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByText('100% = one core', { exact: true })).toHaveCount(0)
  for (const name of ['1 hour', '24 hours', '7 days']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  const read = async () => {
    const response = await page.request.get(`${url}/api/studio/databases/${config.DB_NAME}/metrics?hours=24&limit=720`)
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
  assert.equal(first.activity.buckets.length, 1)
  const runs = first.activity.buckets.reduce((total: number, bucket: { runs: { succeeded: number; slow: number; failed: number } | null }) =>
    total + (bucket.runs ? bucket.runs.succeeded + bucket.runs.slow + bucket.runs.failed : 0), 0)
  assert.equal(runs, 2)
  await expect(page.getByRole('button', { name: 'Show run activity', exact: true })).toBeVisible()
  await expect(chart.getByRole('img')).toHaveCount(1)
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
  let nextHour
  try {
    assert.equal(reopened.metrics.latest(config.DB_NAME)?.sampledAt, updated.latest.sampledAt)
    nextHour = reopened.metrics.activity(config.DB_NAME, 24, Date.parse(first.activity.startAt) + 3600000)
    assert.equal(nextHour.buckets.length, 2)
  }
  finally { reopened.close() }

  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Refreshing…', { exact: true })).toHaveCount(0)
  await expect(chart.getByRole('img')).toHaveCount(1)
  await expect(page.getByText('Not exposed by API', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Activity metrics are not returned by the current admin API.', { exact: true })).toHaveCount(0)
  // Render a future time window using the same real persisted records, not invented activity.
  await page.route('**/metrics?*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ...updated, activity: nextHour }),
  }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart.getByRole('img')).toHaveCount(2)
  await expect(chart.getByRole('img').nth(1)).toHaveAttribute('aria-label', /No recorded observations/)
  await page.unroute('**/metrics?*')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart.getByRole('img')).toHaveCount(1)
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 960 })
    const card = page.getByRole('heading', { name: 'Compute CPU', exact: true }).locator('..')
    const badge = card.getByText('Shared Postgres container', { exact: true })
    const cardBox = await card.boundingBox(), badgeBox = await badge.boundingBox()
    assert.ok(cardBox && badgeBox && badgeBox.x >= cardBox.x && badgeBox.x + badgeBox.width <= cardBox.x + cardBox.width)
    assert.equal(await card.evaluate(el => el.scrollWidth <= el.clientWidth), true)
    assert.equal(await card.evaluate(el => {
      const style = getComputedStyle(el)
      const contentBottom = el.lastElementChild!.getBoundingClientRect().bottom
      const remaining = el.getBoundingClientRect().bottom - contentBottom
      return Math.abs(remaining - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth)) <= 1
    }), true)
    const barBox = await chart.getByRole('img').first().boundingBox()
    const plotBox = await chart.getByRole('img').first().locator('..').boundingBox()
    assert.ok(barBox && plotBox && barBox.width < plotBox.width / 10 && Math.abs(barBox.x - plotBox.x) < 2)
  }
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.route('**/metrics?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Metrics temporarily unavailable"}',
  }))
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toBeVisible()
  await expect(chart.getByRole('img')).toHaveCount(1)
  await page.unroute('**/metrics?*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toHaveCount(0)
  await expect(chart.getByRole('img')).toHaveCount(1)
  console.log('PASS: real PostgreSQL metrics, retained SQLite history, removed telemetry panels, progressive original-style bars, responsive badges and failure recovery')
}
