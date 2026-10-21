import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifySqlScroll(page: Page, url: string, setQuery: (sql: string) => Promise<void>, snapshot: (name: string) => Promise<unknown>) {
  await page.goto(`${url}/sql`)
  await setQuery(`SELECT i AS id, repeat('wide-column-', 40) AS first_value,
    repeat('wide-column-', 40) AS second_value, repeat('wide-column-', 40) AS third_value,
    repeat('wide-column-', 40) AS fourth_value, 'last-row-' || i AS end_marker
    FROM generate_series(1, 1000) AS i;`)
  const response = page.waitForResponse(r => r.url() === `${url}/api/studio/sql` && r.request().method() === 'POST')
  await page.getByTitle('Run query (Ctrl+Enter)').click()
  assert.ok((await response).ok())
  const scroll = page.locator('[data-sql-results-scroll]')
  await expect(scroll.locator('tbody tr')).toHaveCount(1000)
  for (const size of [{ width: 1280, height: 600 }, { width: 1080, height: 640 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size)
    for (const expanded of [false, true]) {
      if (expanded) await page.getByTitle('Expand pane height', { exact: true }).click()
      // Wait for pane-height transitions and Monaco's responsive layout.
      await expect.poll(() => scroll.evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true)
      await scroll.evaluate(element => {
        element.scrollTop = element.scrollHeight
        element.scrollLeft = element.scrollWidth
      })
      const last = scroll.getByRole('cell', { name: 'last-row-1000', exact: true })
      await expect(last).toBeVisible()
      await expect.poll(() => scroll.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        const row = element.querySelector('tbody tr:last-child td:last-child')!.getBoundingClientRect()
        return row.bottom <= bounds.top + element.clientTop + element.clientHeight + 1
          && row.right <= bounds.left + element.clientLeft + element.clientWidth + 1
          && row.top >= bounds.top && row.left >= bounds.left
          && bounds.bottom <= window.innerHeight
          && Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <= 1
          && Math.abs(element.scrollWidth - element.clientWidth - element.scrollLeft) <= 1
      })).toBe(true)
      if (size.height === 600) await snapshot(`sql-scroll-bottom-${expanded ? 'expanded' : 'normal'}`)
      if (expanded) await page.getByTitle('Restore pane height', { exact: true }).click()
    }
  }
  console.log('PASS: 1000th row and rightmost column fully reachable at three viewport sizes, normal and expanded panes')
}
