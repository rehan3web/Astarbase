import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifyTableSurfaces(page: Page, url: string, snapshot: (name: string) => Promise<unknown>) {
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="items"]').click()
  const table = page.locator('table').first()
  await expect(table.getByRole('columnheader', { name: /name/ })).toBeVisible()
  const themeButton = page.getByRole('button').filter({ has: page.locator('svg.lucide-sun') })
  await themeButton.click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  const filter = page.getByPlaceholder('Filter by id, name', { exact: true })
  const search = page.getByPlaceholder('Search tables...', { exact: true })
  for (const element of [table.locator('thead'), page.locator('[data-table-toolbar]'), search]) {
    await expect(element).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    // Tailwind's shadow-none may compute as transparent zero-size layers.
    const shadow = await element.evaluate(node => getComputedStyle(node).boxShadow)
    assert.equal(shadow === 'none' || shadow
      .replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px', '')
      .replaceAll(', ', '') === '', true)
  }
  await expect(filter).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(filter).toHaveCSS('border-top-width', '0px')
  await expect(filter).toHaveCSS('border-radius', '0px')
  for (const cell of await table.locator('thead th').all()) {
    await expect(cell).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(cell).toHaveCSS('box-shadow', 'none')
  }
  await expect(page.getByPlaceholder(/ask ai/i)).toHaveCount(0)
  await filter.fill('seed record')
  await expect(table.getByRole('cell', { name: 'seed record', exact: true })).toBeVisible()
  await filter.fill('not_present_anywhere')
  await expect(table.getByRole('cell', { name: 'seed record', exact: true })).toHaveCount(0)
  await filter.fill('')
  await expect(table.getByRole('cell', { name: 'seed record', exact: true })).toBeVisible()
  await search.fill('comments')
  await expect(page.locator('[data-table-explorer-row="comments"]')).toBeVisible()
  await expect(page.locator('[data-table-explorer-row="items"]')).toHaveCount(0)
  await search.fill('')
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation =>
      animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
  })
  await snapshot('white-table-headers-and-search')
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-moon') }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  assert.notEqual(await table.locator('thead').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
  console.log('PASS: white shadow-free headers/search, no Ask AI placeholder, working filters and preserved dark mode')
}
