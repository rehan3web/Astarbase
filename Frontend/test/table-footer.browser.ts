import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyTableFooter(page: Page, url: string, config: Config, snapshot: (name: string) => Promise<unknown>) {
  await withDatabase(config, config.DB_NAME, client => client.query(`
    CREATE TABLE public.pagination_rows(id integer PRIMARY KEY, name text);
    INSERT INTO public.pagination_rows SELECT id, 'row ' || id FROM generate_series(1, 1101) id;
  `))
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="pagination_rows"]').click()
  const footer = page.locator('[data-table-footer]')
  const pageNumber = footer.getByLabel('Page number', { exact: true })
  const previous = footer.getByRole('button', { name: 'Previous page', exact: true })
  const next = footer.getByRole('button', { name: 'Next page', exact: true })
  const rowsButton = footer.getByRole('button', { name: 'Rows per page', exact: true })
  const bodyRows = page.locator('tbody tr')
  const firstId = (id: number) => expect(bodyRows.first().getByRole('cell', { name: String(id), exact: true })).toBeVisible()
  const theme = await page.evaluate(() => ({
    classes: document.documentElement.className, attribute: document.documentElement.getAttribute('data-theme'),
  }))
  try {
    await expect(bodyRows).toHaveCount(100)
    await expect(pageNumber).toHaveValue('1')
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()
    await expect(footer).toContainText('1,101 records')
    await expect(footer).toContainText('of 12')
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      document.documentElement.setAttribute('data-theme', 'light')
    })
    await rowsButton.click()
    const menu = page.getByRole('menu')
    await expect(menu).toHaveAttribute('data-side', 'top')
    await expect(menu.getByRole('menuitem')).toHaveCount(3)
    for (const size of [100, 500, 1000]) await expect(menu.getByText(`${size} rows`, { exact: true })).toBeVisible()
    await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await snapshot('table-footer-light-menu')
    await menu.getByText('500 rows', { exact: true }).click()
    await expect(bodyRows).toHaveCount(500)
    await expect(footer).toContainText('of 3')
    await next.click()
    await firstId(501)
    await expect(pageNumber).toHaveValue('2')
    await previous.click()
    await firstId(1)
    await rowsButton.click()
    await menu.getByText('1000 rows', { exact: true }).click()
    await expect(bodyRows).toHaveCount(1000)
    await pageNumber.fill('2')
    await pageNumber.press('Enter')
    await firstId(1001)
    await expect(bodyRows).toHaveCount(101)
    await expect(next).toBeDisabled()
    await expect(footer).toContainText('of 2')
    for (const value of ['999', '', 'abc']) {
      await pageNumber.fill(value)
      await pageNumber.press('Enter')
      await expect(pageNumber).toHaveValue('2')
    }
    await pageNumber.fill('0')
    await pageNumber.press('Enter')
    await firstId(1)
    await expect(pageNumber).toHaveValue('1')
    await next.click()
    await firstId(1001)
    await withDatabase(config, config.DB_NAME, client => client.query('DELETE FROM public.pagination_rows WHERE id >= 1001'))
    await page.getByTitle('Refresh data', { exact: true }).click()
    await expect(pageNumber).toHaveValue('1')
    await expect(bodyRows).toHaveCount(1000)
    await expect(next).toBeDisabled()
    await footer.getByRole('tab', { name: 'Definition', exact: true }).click()
    await expect(footer.getByRole('tab', { name: 'Definition', exact: true })).toHaveAttribute('aria-selected', 'true')
    await footer.getByRole('tab', { name: 'Definition', exact: true }).press('ArrowLeft')
    await expect(footer.getByRole('tab', { name: 'Data', exact: true })).toHaveAttribute('aria-selected', 'true')
    await firstId(1)
    await page.locator('[data-table-explorer-row="comments"]').click()
    await expect(footer).toContainText('0 records')
    await expect(pageNumber).toHaveValue('1')
    await expect(previous).toBeDisabled()
    await expect(next).toBeDisabled()
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
      document.documentElement.setAttribute('data-theme', 'dark')
    })
    await snapshot('table-footer-dark')
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(footer).toBeVisible()
    assert.ok(await footer.evaluate(element => element.scrollWidth <= element.clientWidth + 1))
    await snapshot('table-footer-desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByText('Desktop Only', { exact: true })).toBeVisible()
    await snapshot('table-footer-mobile-guard')
  } finally {
    await page.evaluate(theme => {
      document.documentElement.className = theme.classes
      if (theme.attribute === null) document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', theme.attribute)
    }, theme)
  }
  console.log('PASS: footer reference layout, upward rows menu, actual 100/500/1000 pagination, bounded page entry, empty states, shrinking-page recovery, Data/Definition tabs and existing mobile guard')
}
