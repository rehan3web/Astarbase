import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifyBackupSurfaces(page: Page, url: string, snapshot: (name: string) => Promise<unknown>) {
  for (const theme of ['light', 'dark']) {
    await page.goto(`${url}/branches`)
    const branchButton = page.getByRole('button', { name: 'Create branch', exact: true })
    await expect(branchButton).toBeVisible()
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button').filter({ has: page.locator(theme === 'light' ? 'svg.lucide-sun' : 'svg.lucide-moon') }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const colors = await branchButton.evaluate(element => ({
      background: getComputedStyle(element).backgroundColor,
      foreground: getComputedStyle(element).color,
    }))
    const branchBackground = await page.getByRole('region', { name: 'Branch list', exact: true })
      .evaluate(element => getComputedStyle(element).backgroundColor)
    await page.goto(`${url}/settings/backups`)
    const list = page.getByRole('region', { name: 'Backups list', exact: true })
    await expect(list).toBeVisible()
    if (await page.locator('html').getAttribute('data-theme') !== theme) {
      await page.getByRole('button').filter({ has: page.locator(theme === 'light' ? 'svg.lucide-sun' : 'svg.lucide-moon') }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(list).toHaveCSS('background-color', branchBackground)
    const button = page.getByRole('button', { name: 'Create backup', exact: true })
    await expect(button).toHaveCSS('background-color', colors.background)
    await expect(button).toHaveCSS('color', colors.foreground)
    const search = page.getByRole('textbox', { name: 'Search backups', exact: true })
    const icon = search.locator('..').locator('svg.lucide-search')
    await expect(icon).toBeVisible()
    const inputBox = (await search.boundingBox())!
    const iconBox = (await icon.boundingBox())!
    assert.ok(iconBox.x > inputBox.x && iconBox.x + iconBox.width < inputBox.x + inputBox.width)
    assert.ok(iconBox.y >= inputBox.y && iconBox.y + iconBox.height <= inputBox.y + inputBox.height)
    for (const element of [list, button, search]) {
      const shadow = await element.evaluate(node => getComputedStyle(node).boxShadow)
      assert.ok(shadow === 'none' || shadow.replaceAll('rgba(0, 0, 0, 0) 0px 0px 0px 0px', '').replaceAll(', ', '') === '', shadow)
    }
    if (theme === 'light') {
      for (const element of [page.locator('[data-backups-page]'), list, list.locator(':scope > div').first(), search]) {
        await expect(element).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      }
    } else {
      assert.notEqual(branchBackground, 'rgb(255, 255, 255)')
    }
    await button.click()
    const dialog = page.getByRole('dialog')
    const submit = dialog.getByRole('button', { name: 'Create backup', exact: true })
    await expect(submit).toHaveCSS('background-color', colors.background)
    await expect(submit).toHaveCSS('color', colors.foreground)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await snapshot(`backups-surfaces-${theme}`)
  }
  console.log('PASS: Backups matches Branches palette, has no raised shadows, shows search icon inside input and uses primary create buttons in both themes')
}
