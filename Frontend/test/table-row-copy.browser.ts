import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifyTableRowCopy(page: Page, url: string, database: string, snapshot: (name: string) => Promise<unknown>) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const seeded = await page.request.post(`${url}/api/studio/sql`, {
    headers: { Origin: url },
    data: { database, sql: `INSERT INTO public.items(name) VALUES ('a,"b"' || chr(10) || 'c''d'), (NULL);` },
  })
  assert.equal(seeded.ok(), true, await seeded.text())
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="items"]').click()
  await expect(page.getByRole('checkbox', { name: 'Select row 3', exact: true })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Select all rows', exact: true }).check()
  if (await page.locator('html').getAttribute('data-theme') !== 'light') {
    await page.getByRole('button').filter({ has: page.locator('svg.lucide-sun') }).click()
  }
  for (const name of ['Copy', 'Export']) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await button.hover()
    await expect(button).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Export as CSV', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Export as JSON', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await snapshot('selected-row-buttons-light')
  const expected = {
    CSV: `"id","name"\n"1","seed record"\n"2","a,""b""\nc'd"\n"3",""`,
    JSON: JSON.stringify([{ id: 1, name: 'seed record' }, { id: 2, name: 'a,"b"\nc\'d' }, { id: 3, name: null }], null, 2),
    SQL: `INSERT INTO "public"."items" ("id", "name") VALUES (1, 'seed record');\nINSERT INTO "public"."items" ("id", "name") VALUES (2, 'a,"b"\nc''d');\nINSERT INTO "public"."items" ("id", "name") VALUES (3, NULL);`,
  }
  for (const mode of ['native', 'missing', 'denied']) {
    for (const format of ['CSV', 'JSON', 'SQL'] as const) {
      await page.evaluate(() => navigator.clipboard.writeText('unchanged sentinel'))
      if (mode === 'missing') {
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
      } else if (mode === 'denied') {
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
          configurable: true, value: { writeText: Promise.reject.bind(Promise, new Error('Clipboard denied')) },
        }))
      }
      await page.getByRole('button', { name: 'Copy', exact: true }).click()
      await page.getByRole('menuitem', { name: `Copy as ${format === 'SQL' ? 'SQL INSERT' : format}`, exact: true }).click()
      await expect(page.locator('[data-studio-toast]').filter({ hasText: `Copied 3 selected rows as ${format}.` }).last()).toBeVisible()
      await page.evaluate(() => Reflect.deleteProperty(navigator, 'clipboard'))
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), expected[format])
      assert.equal(await page.locator('textarea[readonly]').count(), 0)
    }
  }
  await snapshot('selected-rows-copy')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: Boolean.bind(null, false) })
  })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy as JSON', exact: true }).click()
  await expect(page.locator('[data-studio-toast][role="alert"]').filter({ hasText: 'Clipboard unavailable' })).toBeVisible()
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    Reflect.deleteProperty(document, 'execCommand')
  })
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected.SQL)
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Copy as JSON', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected.JSON)
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-moon') }).click()
  for (const name of ['Copy', 'Export']) {
    const button = page.getByRole('button', { name, exact: true })
    assert.notEqual(await button.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
  }
  console.log('PASS: select-all CSV/JSON/SQL actual clipboard contents, HTTP fallback inside dropdown, denied API, failure and retry')
}
