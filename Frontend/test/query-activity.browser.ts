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
  await expect(chart).not.toContainText('All database clients')
  await expect(chart).not.toContainText('recorded runs in')
  await expect(chart).not.toContainText('bins observed')
  await expect(chart).not.toContainText('Slow ≥')
  await expect(chart).not.toContainText('gaps are intentionally left empty')
  await expect(chart.getByRole('img', { name: /Succeeded 1, Slow 0, Failed 0/ })).toHaveCount(1)
  await expect(chart.getByRole('status')).toHaveCount(0)
  await snapshot('query-activity-all-clients')
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button').filter({ has: page.locator(theme === 'light' ? 'svg.lucide-sun' : 'svg.lucide-moon') }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await chart.getByRole('img').first().hover()
    const tooltip = chart.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('Succeeded:')
    const background = await tooltip.evaluate(element => getComputedStyle(element).backgroundColor)
    if (theme === 'light') assert.equal(background, 'rgb(255, 255, 255)')
    else {
      const reference = await chart.getByRole('group', { name: 'Activity metric' }).evaluate(element => getComputedStyle(element).backgroundColor)
      assert.equal(background, reference)
    }
    await snapshot(`query-activity-tooltip-${theme}`)
    await page.getByRole('heading', { name: 'Sync Activity' }).hover()
  }
  status = 'unavailable'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveText(message)
  await expect(chart).not.toContainText('Database-wide monitoring')
  await page.getByRole('button', { name: 'Show row changes', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveCount(0)
  await expect(chart).not.toContainText('bins observed')
  await expect(chart).not.toContainText('gaps are intentionally left empty')
  await page.getByRole('button', { name: 'Show run activity', exact: true }).click()
  await expect(chart.getByRole('status')).toHaveText(message)
  status = 'active'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(chart).not.toContainText('All database clients')
  await expect(chart.getByRole('status')).toHaveCount(0)
  await page.unroute(/\/metrics\?/)
  console.log('PASS: activity summaries removed, real run count/tooltips preserved, monitoring warning and recovery, working Runs/Rows controls')
}
