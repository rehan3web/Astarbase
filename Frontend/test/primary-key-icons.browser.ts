import assert from 'node:assert/strict'
import { expect, type Locator, type Page } from '@playwright/test'

export async function verifyPrimaryKeyIcons(page: Page, url: string, snapshot: (name: string) => Promise<unknown>) {
  const verifyKey = async (icon: Locator) => {
    await expect(icon).toBeVisible()
    for (const [name, value] of Object.entries({
      width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true',
    })) await expect(icon).toHaveAttribute(name, value)
    assert.deepEqual(await icon.locator('path').evaluateAll(paths => paths.map(path => path.getAttribute('d'))), [
      'm2 21 9.6-9.6',
      'm7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19',
    ])
    await expect(icon.locator('circle')).toHaveAttribute('cx', '15.5')
    await expect(icon.locator('circle')).toHaveAttribute('cy', '7.5')
    await expect(icon.locator('circle')).toHaveAttribute('r', '5.5')
    const bounds = await icon.boundingBox()
    assert.ok(bounds)
    assert.equal(bounds.width, 14)
    assert.equal(bounds.height, 14)
  }

  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="items"]').click()
  const logo = page.getByRole('link', { name: 'Sorabase Studio', exact: true }).locator('img')
  await expect(logo).toHaveAttribute('width', '22')
  await expect(logo).toHaveAttribute('height', '22')
  const logoBounds = await logo.boundingBox()
  assert.ok(logoBounds)
  assert.equal(logoBounds.width, 22)
  assert.equal(logoBounds.height, 22)

  const selector = 'svg:has(circle[cx="15.5"][cy="7.5"])'
  await verifyKey(page.locator('th').locator(selector))
  await snapshot('table-primary-key-icon')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert row/ }).click()
  await verifyKey(page.getByRole('dialog').locator(selector))
  await snapshot('insert-primary-key-icon')
  await page.keyboard.press('Escape')
  console.log('PASS: compact 22px header logo and exact 14px primary-key SVG in table headers and Insert form')
}
