import assert from 'node:assert/strict'
import { expect, type Locator, type Page } from '@playwright/test'

export async function verifyInsertSurfaces(page: Page, url: string, database: string, snapshot: (name: string) => Promise<unknown>) {
  const seeded = await page.request.post(`${url}/api/studio/sql`, {
    headers: { Origin: url },
    data: { database, sql: 'ALTER TABLE public.items ADD COLUMN enabled boolean, ADD COLUMN details jsonb;' },
  })
  assert.equal(seeded.ok(), true, await seeded.text())
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="items"]').click()
  async function checkPanel(panel: Locator, light: boolean) {
    await expect(panel).toBeVisible()
    const background = await panel.evaluate(element => getComputedStyle(element).backgroundColor)
    if (light) assert.equal(background, 'rgb(255, 255, 255)')
    else assert.notEqual(background, 'rgb(255, 255, 255)')
    const fields = panel.locator('input:not([type="checkbox"]), textarea, button[role="combobox"]')
    assert.ok(await fields.count() > 0)
    for (const field of await fields.all()) {
      const color = await field.evaluate(element => getComputedStyle(element).backgroundColor)
      if (light) assert.equal(color, 'rgb(255, 255, 255)')
      else assert.notEqual(color, 'rgb(255, 255, 255)')
      if (light && await field.isEnabled()) {
        await field.focus()
        const border = await field.evaluate(element => {
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')!
          context.fillStyle = getComputedStyle(element).borderTopColor
          context.fillRect(0, 0, 1, 1)
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        })
        assert.ok(Math.max(...border) - Math.min(...border) < 35, `Expected gray focus border, got ${border}`)
      }
    }
  }
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button').filter({ has: page.locator(theme === 'light' ? 'svg.lucide-sun' : 'svg.lucide-moon') }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const light = theme === 'light'
    await page.getByRole('button', { name: 'New table', exact: true }).click()
    const table = page.getByRole('dialog')
    await checkPanel(table, light)
    await table.getByPlaceholder('e.g. products', { exact: true }).fill('surface_preview')
    await snapshot(`insert-table-${theme}`)
    await table.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('menuitem', { name: /Insert column/ }).click()
    const column = page.getByRole('dialog').filter({ has: page.getByPlaceholder('column_name') })
    await checkPanel(column, light)
    await column.getByPlaceholder('column_name').fill('surface_preview')
    await snapshot(`insert-column-${theme}`)
    await column.getByRole('button', { name: 'Add foreign key', exact: true }).click()
    const foreignKey = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Add foreign key relationship/ }) })
    await checkPanel(foreignKey, light)
    for (const card of await foreignKey.locator('section.rounded-lg').all()) {
      const color = await card.evaluate(element => getComputedStyle(element).backgroundColor)
      if (light) assert.equal(color, 'rgb(255, 255, 255)')
    }
    await snapshot(`insert-foreign-key-${theme}`)
    await foreignKey.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(column.getByPlaceholder('column_name')).toHaveValue('surface_preview')
    await column.getByRole('button', { name: 'Cancel', exact: true }).click()

    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('menuitem', { name: /Insert row/ }).click()
    const row = page.getByRole('dialog')
    await checkPanel(row, light)
    await snapshot(`insert-row-${theme}`)
    await row.getByRole('button', { name: 'Cancel', exact: true }).click()
  }
  console.log('PASS: white insert table/column/row/FK panels and inputs, gray light-mode focus borders, preserved dark surfaces and nested draft/cancel behavior')
}
