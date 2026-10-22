import assert from 'node:assert/strict'
import { expect, type Locator, type Page, type Route } from '@playwright/test'
import { tablePath, type TableRows } from '../lib/api'

export async function verifyInsertSave(page: Page, url: string, database: string, snapshot: (name: string) => Promise<unknown>) {
  const rowPath = `${url}/api/studio${tablePath(database, 'public', 'items')}`
  const readRows = async () => {
    const response = await page.request.get(rowPath)
    assert.equal(response.ok(), true)
    return await response.json() as TableRows
  }
  const openInsert = async (kind: 'row' | 'column') => {
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('menuitem', { name: new RegExp(`^Insert ${kind}`) }).click()
    const panel = page.getByRole('dialog')
    await expect(panel).toBeVisible()
    return panel
  }
  // Hold a real successful response: the database has committed but the browser
  // has not received confirmation yet. No mocked success or auth bypass.
  async function submitHeld(panel: Locator, pattern: string, label: string, keepOpen = false) {
    let release!: () => void
    let written!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const committed = new Promise<void>(resolve => { written = resolve })
    let requests = 0
    const handler = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      requests++
      const response = await route.fetch()
      assert.equal(response.ok(), true, await response.text())
      written()
      await gate
      await route.fulfill({ response })
    }
    await page.route(pattern, handler)
    try {
      await panel.getByRole('button', { name: /^Save/ }).click()
      await committed
      const saving = panel.getByRole('button', { name: 'Saving…', exact: true })
      await expect(saving).toBeDisabled()
      await expect(saving).toHaveAttribute('aria-busy', 'true')
      await expect(saving.locator('[data-spinner="true"]')).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
      await expect(panel.locator('input').first()).toBeDisabled()
      await page.keyboard.press('Control+Enter')
      await page.keyboard.press('Control+Enter')
      await page.keyboard.press('Escape')
      await expect(panel).toBeVisible()
      assert.equal(requests, 1, 'Repeated keyboard saves must not issue duplicate writes')
      await snapshot(`${label}-saving`)
    } finally {
      release()
    }
    if (keepOpen) {
      await expect(panel.getByRole('button', { name: /^Save/ })).not.toHaveText('Saving…')
      await expect(panel).toBeVisible()
    } else {
      await expect(panel).toHaveCount(0)
    }
    await page.unroute(pattern, handler)
    assert.equal(requests, 1)
  }
  const toast = (text: string | RegExp) => page.locator('[data-studio-toast]').filter({ hasText: text }).last()

  await page.goto(`${url}/tables`)
  await page.getByRole('button', { name: 'New table', exact: true }).click()
  let panel = page.getByRole('dialog')
  await panel.getByPlaceholder('e.g. products', { exact: true }).fill('save_flow_table')
  await submitHeld(panel, '**/api/studio/sql', 'insert-table')
  await expect(toast('Table created')).toBeVisible()
  await expect(page.locator('[data-table-explorer-row="save_flow_table"]')).toBeVisible()

  // Rejected table creation retains the draft and permits a corrected retry.
  await page.getByRole('button', { name: 'New table', exact: true }).click()
  panel = page.getByRole('dialog')
  await panel.getByPlaceholder('e.g. products', { exact: true }).fill('save_flow_table')
  await panel.getByRole('button', { name: /^Save/ }).click()
  await expect(toast(/already exists/)).toBeVisible()
  await expect(panel.getByPlaceholder('e.g. products', { exact: true })).toHaveValue('save_flow_table')
  await expect(panel.getByRole('button', { name: /^Save/ })).toBeEnabled()
  await panel.getByPlaceholder('e.g. products', { exact: true }).fill('save_flow_retry')
  await submitHeld(panel, '**/api/studio/sql', 'insert-table-retry')

  await page.locator('[data-table-explorer-row="items"]').click()
  await expect(page.getByRole('checkbox', { name: 'Select row 1', exact: true })).toBeVisible()
  panel = await openInsert('column')
  await panel.getByPlaceholder('column_name').fill('save_flow_column')
  await submitHeld(panel, '**/api/studio/sql', 'insert-column')
  await expect(page.getByRole('columnheader', { name: /save_flow_column/ })).toBeVisible()
  assert.equal((await readRows()).columns.filter(column => column.name === 'save_flow_column').length, 1)

  panel = await openInsert('column')
  await panel.getByPlaceholder('column_name').fill('name')
  await panel.getByRole('button', { name: /^Save/ }).click()
  await expect(toast(/already exists/)).toBeVisible()
  await expect(panel.getByPlaceholder('column_name')).toHaveValue('name')
  await expect(panel.getByRole('button', { name: /^Save/ })).toBeEnabled()
  await panel.getByPlaceholder('column_name').fill('save_flow_more')
  await panel.getByRole('switch').last().click()
  await submitHeld(panel, '**/api/studio/sql', 'insert-column-create-more', true)
  await expect(panel.getByPlaceholder('column_name')).toHaveValue('')
  await expect(panel.getByRole('switch').last()).toHaveAttribute('aria-checked', 'true')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  panel = await openInsert('column')
  await expect(panel.getByRole('switch').last()).toHaveAttribute('aria-checked', 'false')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()

  panel = await openInsert('row')
  await panel.getByPlaceholder('Enter name...', { exact: true }).fill('saved exactly once')
  await submitHeld(panel, rowPath, 'insert-row')
  assert.equal((await readRows()).rows.filter(row => row.name === 'saved exactly once').length, 1)

  panel = await openInsert('row')
  await panel.getByPlaceholder('Enter name...', { exact: true }).fill('row retry draft')
  const rejectRow = async (route: Route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await route.fulfill({ status: 503, json: { error: 'Insert fixture rejected' } })
  }
  await page.route(rowPath, rejectRow)
  await panel.getByRole('button', { name: /^Save/ }).click()
  await expect(toast('Insert fixture rejected')).toBeVisible()
  await expect(panel.getByPlaceholder('Enter name...', { exact: true })).toHaveValue('row retry draft')
  await expect(panel.getByRole('button', { name: /^Save/ })).toBeEnabled()
  await page.unroute(rowPath, rejectRow)
  await panel.getByRole('switch').last().click()
  await submitHeld(panel, rowPath, 'insert-row-create-more', true)
  await expect(panel.getByPlaceholder('Enter name...', { exact: true })).toHaveValue('')
  await expect(panel.getByRole('switch').last()).toHaveAttribute('aria-checked', 'true')
  assert.equal((await readRows()).rows.filter(row => row.name === 'row retry draft').length, 1)
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()

  panel = await openInsert('row')
  await expect(panel.getByRole('switch').last()).toHaveAttribute('aria-checked', 'false')
  await panel.getByPlaceholder('Enter name...', { exact: true }).fill('saved despite refresh failure')
  const listPath = `${url}/api/studio/databases/${encodeURIComponent(database)}/tables`
  await page.route(listPath, route => route.fulfill({ status: 503, json: { error: 'Refresh fixture rejected' } }))
  await submitHeld(panel, rowPath, 'insert-row-refresh-failure')
  await expect(toast(/Changes saved, but the table could not be refreshed/)).toBeVisible()
  assert.equal((await readRows()).rows.filter(row => row.name === 'saved despite refresh failure').length, 1)
  await page.unroute(listPath)
  console.log('PASS: table/column/row saving spinners, single-flight Ctrl+Enter, close after commit, failure drafts/retry, explicit Create more and post-write refresh failure')
}
