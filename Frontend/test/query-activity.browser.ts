import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

// Backend log ingestion is exercised with real PostgreSQL/PgBouncer in the
// backend suite. Here only collection health is varied; chart counts/history
// still come from real API executions and real database telemetry.
export async function verifyQueryActivityUi(page: Page, url: string, database: string, snapshot: (name: string) => Promise<unknown>) {
  const executed = await page.request.post(`${url}/api/studio/sql`, {
    headers: { Origin: url }, data: { database, sql: 'SELECT 123 AS activity_fixture;' },
  })
  assert.equal(executed.status(), 200)
  let status = 'active'
  const message = 'Query activity collection unavailable. Check PostgreSQL activity logging, the Unix socket and admin storage.'
  await page.route(/\/metrics\?/, async route => {
    const response = await route.fetch()
    const data = await response.json()
    data.activity.monitoring = {
      source: 'postgres-logs', status, since: new Date().toISOString(),
      lastCollectedAt: new Date().toISOString(), message: status === 'active' ? null : message,
    }
    await route.fulfill({ response, json: data })
  })
  await page.goto(url)
  const chart = page.locator('section[aria-labelledby="sync-activity-title"]')
  await expect(chart).toContainText('All database clients')
  await expect(chart).toContainText('1 recorded runs')
  await expect(chart.getByRole('status')).toHaveCount(0)
  await snapshot('query-activity-all-clients')
  status = 'unavailable'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveText(message)
  await expect(chart).toContainText('Database-wide monitoring')
  await page.getByRole('button', { name: 'Show row changes', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show run activity', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveText(message)
  status = 'active'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart).toContainText('All database clients')
  await expect(chart.getByRole('status')).toHaveCount(0)
  await page.unroute(/\/metrics\?/)
  console.log('PASS: database-wide activity source, real run count, unavailable warning and recovery, unchanged Runs/Rows controls')
}
