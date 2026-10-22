import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyCreateTableColumns(page: Page, url: string, config: Config, snapshot: (name: string) => Promise<unknown>) {
  const query = (sql: string) => withDatabase(config, config.DB_NAME, client => client.query(sql))
  await query(`CREATE SCHEMA zz_create_table_reference;
    CREATE TABLE zz_create_table_reference.parents(id integer PRIMARY KEY, note text);
    INSERT INTO zz_create_table_reference.parents VALUES (7, 'reference record');`)
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="items"]').click()
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert column/ }).click()
  await expect(page.getByRole('button', { name: /Create enum|About data types/ })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  if (await page.locator('html').getAttribute('data-theme') !== 'light') {
    await page.getByRole('button').filter({ has: page.locator('svg.lucide-sun') }).click()
  }
  await page.getByRole('button', { name: 'New table', exact: true }).click()
  const parent = page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder('e.g. products', { exact: true }) })
  await parent.getByPlaceholder('e.g. products', { exact: true }).fill('create_grid_child')
  await expect(parent).not.toContainText('Realtime')
  await expect(parent).not.toContainText('About data types')
  await expect(parent.locator('[data-column-row]')).toHaveCount(2)
  await parent.getByRole('button', { name: 'Add column', exact: true }).click()
  await parent.getByRole('textbox', { name: 'Column name', exact: true }).nth(2).fill('parent_id')
  await parent.getByRole('combobox', { name: 'Type for parent_id', exact: true }).click()
  await page.getByRole('option', { name: 'int4 (integer)', exact: true }).click()
  await parent.getByRole('button', { name: 'Add column', exact: true }).click()
  await parent.getByRole('textbox', { name: 'Column name', exact: true }).nth(3).fill('labels')
  await parent.getByRole('button', { name: 'Settings for labels', exact: true }).click()
  await page.getByRole('checkbox', { name: /^Array/ }).check()
  await page.getByRole('checkbox', { name: /^Nullable/ }).uncheck()
  await page.keyboard.press('Control+Enter')
  assert.equal((await query("SELECT to_regclass('public.create_grid_child') AS relation")).rows[0].relation, null)
  await page.getByRole('button', { name: 'Close column settings', exact: true }).click()
  const grip = parent.getByRole('button', { name: 'Reorder labels', exact: true })
  await grip.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(parent.getByRole('textbox', { name: 'Column name', exact: true }).nth(2)).toHaveValue('labels')
  await page.keyboard.press('Alt+ArrowDown')
  await expect(parent.getByRole('textbox', { name: 'Column name', exact: true }).nth(3)).toHaveValue('labels')
  const row = parent.locator('[data-column-row]').filter({ has: page.locator('input[aria-label="Column name"][value="parent_id"]') })
  const boxes = await Promise.all([
    row.getByRole('textbox', { name: 'Column name', exact: true }).boundingBox(),
    row.getByRole('combobox', { name: 'Type for parent_id', exact: true }).boundingBox(),
    row.getByRole('textbox', { name: 'Default value for parent_id', exact: true }).boundingBox(),
    row.getByRole('checkbox', { name: 'Primary key parent_id', exact: true }).boundingBox(),
  ])
  const centers = boxes.map(box => { assert.ok(box); return box.y + box.height / 2 })
  assert.ok(Math.max(...centers) - Math.min(...centers) < 3, 'All column controls belong on the same horizontal row')
  await snapshot('create-table-compact-columns-light')

  let sqlRequests = 0
  page.on('request', request => {
    if (request.url() === `${url}/api/studio/sql` && request.method() === 'POST') sqlRequests++
  })
  const nested = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Add foreign key relationship/ }) })
  await parent.getByRole('button', { name: /Add foreign key relationship/ }).click()
  await nested.getByRole('combobox', { name: 'Select local source column', exact: true }).click()
  await page.getByRole('option', { name: 'parent_id', exact: true }).click()
  await nested.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(parent.getByPlaceholder('e.g. products', { exact: true })).toHaveValue('create_grid_child')
  await expect(row.getByRole('textbox', { name: 'Column name', exact: true })).toHaveValue('parent_id')

  async function setReference(column: 'id' | 'note') {
    await nested.getByRole('combobox', { name: 'Select a table to reference', exact: true }).click()
    await page.getByRole('option', { name: /zz_create_table_reference.*parents/ }).click()
    await nested.getByRole('combobox', { name: 'Select a referenced column', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(`^${column}(?:\\s|$)`) }).click()
    for (const label of ['On delete action', 'On update action']) {
      await nested.getByRole('combobox', { name: label, exact: true }).click()
      await page.getByRole('option', { name: 'CASCADE', exact: true }).click()
    }
  }
  await parent.getByRole('button', { name: 'Add foreign key for parent_id', exact: true }).click()
  await setReference('id')
  await snapshot('create-table-foreign-key-panel')
  await page.keyboard.press('Control+Enter')
  await expect(nested).toHaveCount(0)
  assert.equal(sqlRequests, 0, 'Child Save must only stage a mapping, never submit the parent table')
  await expect(parent.getByRole('button', { name: 'Edit foreign key for parent_id', exact: true })).toBeVisible()
  await parent.getByRole('button', { name: 'Settings for parent_id', exact: true }).click()
  await page.getByRole('button', { name: 'Remove foreign key mapping', exact: true }).click()
  await page.getByRole('button', { name: 'Close column settings', exact: true }).click()
  await expect(parent.getByRole('button', { name: 'Add foreign key for parent_id', exact: true })).toBeVisible()

  await parent.getByRole('button', { name: 'Add foreign key for parent_id', exact: true }).click()
  await setReference('note')
  await nested.getByRole('button', { name: /^Save/ }).click()
  const failed = page.waitForResponse(response => response.url() === `${url}/api/studio/sql` && response.request().method() === 'POST')
  await parent.getByRole('button', { name: /^Save/ }).click()
  assert.equal((await failed).ok(), false)
  await expect(parent.getByRole('button', { name: /^Save/ })).toBeEnabled()
  await expect(parent.getByPlaceholder('e.g. products', { exact: true })).toHaveValue('create_grid_child')
  assert.equal((await query("SELECT to_regclass('public.create_grid_child') AS relation")).rows[0].relation, null, 'Invalid FK must roll back the whole new table')
  await parent.getByRole('button', { name: 'Edit foreign key for parent_id', exact: true }).click()
  await setReference('id')
  await nested.getByRole('button', { name: /^Save/ }).click()
  await parent.getByRole('button', { name: /^Save/ }).click()
  await expect(parent).toHaveCount(0)
  await expect(page.locator('[data-table-explorer-row="create_grid_child"]')).toBeVisible()
  const fk = await query("SELECT confdeltype, confupdtype FROM pg_constraint WHERE contype='f' AND conrelid='public.create_grid_child'::regclass")
  assert.deepEqual(fk.rows, [{ confdeltype: 'c', confupdtype: 'c' }])
  const columns = await query("SELECT column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='create_grid_child' ORDER BY ordinal_position")
  assert.deepEqual(columns.rows.map(column => column.column_name), ['id', 'created_at', 'parent_id', 'labels'])
  assert.equal(columns.rows[3].udt_name, '_text')
  assert.equal(columns.rows[3].is_nullable, 'NO')
  await query("INSERT INTO public.create_grid_child(id,parent_id,labels) VALUES(1,7,ARRAY['one'])")
  await assert.rejects(query("INSERT INTO public.create_grid_child(id,parent_id,labels) VALUES(2,999,ARRAY['two'])"), /foreign key/i)
  await query('UPDATE zz_create_table_reference.parents SET id=8 WHERE id=7')
  assert.equal((await query('SELECT parent_id FROM public.create_grid_child WHERE id=1')).rows[0].parent_id, 8)
  await query('DELETE FROM zz_create_table_reference.parents WHERE id=8')
  assert.equal((await query('SELECT * FROM public.create_grid_child')).rowCount, 0)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByText('Desktop Only', { exact: true })).toBeVisible()
  await snapshot('create-table-mobile-guard')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-moon') }).click()
  await page.getByRole('button', { name: 'New table', exact: true }).click()
  assert.notEqual(await parent.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
  await snapshot('create-table-compact-columns-dark')
  await parent.getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS: compact column rows, settings/arrays/reorder, removed extras, nested FK staging/cancel/remove, atomic failure/retry, real CASCADE behavior and responsive themes')
}
