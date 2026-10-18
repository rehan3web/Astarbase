import assert from 'node:assert/strict'
import { expect, type Locator, type Page } from '@playwright/test'

export async function verifyPrimaryKeyIcons(page: Page, url: string, snapshot: (name: string) => Promise<unknown>) {
  const verifyKey = async (icon: Locator, size = 14, scaled = false, labeled = false) => {
    await expect(icon).toBeVisible()
    for (const [name, value] of Object.entries({
      width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    })) await expect(icon).toHaveAttribute(name, value)
    if (labeled) {
      await expect(icon).toHaveAttribute('role', 'img')
      await expect(icon).not.toHaveAttribute('aria-hidden', 'true')
    } else {
      await expect(icon).toHaveAttribute('aria-hidden', 'true')
      await expect(icon).toHaveAttribute('stroke-width', '2')
    }
    assert.deepEqual(await icon.locator('path').evaluateAll(paths => paths.map(path => path.getAttribute('d'))), [
      'M12 12h10m-4 0v4m4-4v4',
    ])
    await expect(icon.locator('circle')).toHaveAttribute('cx', '7')
    await expect(icon.locator('circle')).toHaveAttribute('cy', '12')
    await expect(icon.locator('circle')).toHaveAttribute('r', '5')
    await expect(icon).toHaveCSS('transform', 'none')
    const points = await icon.evaluate(element => {
      const svg = element as SVGSVGElement
      const matrix = svg.getScreenCTM()!
      const path = svg.querySelector('path')!
      const projected = [new DOMPoint(7, 12), path.getPointAtLength(0), path.getPointAtLength(10)].map(point => {
        const result = point.matrixTransform(matrix)
        return { x: result.x, y: result.y }
      })
      return { head: projected[0], start: projected[1], end: projected[2] }
    })
    assert.ok(points.head.x < points.start.x && points.start.x < points.end.x)
    assert.ok(Math.abs(points.head.y - points.start.y) < 0.1)
    assert.ok(Math.abs(points.start.y - points.end.y) < 0.1)
    const bounds = await icon.boundingBox()
    assert.ok(bounds)
    if (!scaled) {
      assert.equal(bounds.width, size)
      assert.equal(bounds.height, size)
    }
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

  const selector = 'svg[data-primary-key-icon]'
  await verifyKey(page.locator('th').locator(selector))
  await snapshot('table-primary-key-icon')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert row/ }).click()
  await verifyKey(page.getByRole('dialog').locator(selector))
  await snapshot('insert-primary-key-icon')
  await page.keyboard.press('Escape')
  await page.locator('[data-table-footer]').getByRole('tab', { name: 'Definition', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'SQL definition', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New table', exact: true }).first().click()
  await verifyKey(page.getByRole('dialog').locator(selector), 12)
  await page.keyboard.press('Escape')
  await page.goto(`${url}/visualizer`)
  await expect(page.getByRole('img', { name: 'Primary key', exact: true }).first()).toBeVisible()
  for (const icon of await page.getByRole('img', { name: 'Primary key', exact: true }).all()) await verifyKey(icon, 14, true, true)
  await snapshot('horizontal-primary-keys-diagram')
  console.log('PASS: compact header logo and horizontal primary-key icons in table, Insert row, Insert table and visualizer; read-only SQL Definition view')
}
