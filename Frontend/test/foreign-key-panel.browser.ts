import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import type { Services } from '../../Backend/src/services'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyForeignKeyPanel(
  page: Page, url: string, config: Config, services: Services,
  snapshot: (name: string) => Promise<unknown>,
) {
  const query = (sql: string, database = config.DB_NAME) =>
    withDatabase(config, database, client => client.query(sql))
  await query(`CREATE SCHEMA zz_fk_reference;
    CREATE TABLE zz_fk_reference.parents(id integer PRIMARY KEY, code text UNIQUE, note text);
    INSERT INTO zz_fk_reference.parents VALUES(7, 'A', 'not unique');
    CREATE TABLE public.fk_source(id integer PRIMARY KEY, label text);
    INSERT INTO public.fk_source VALUES(1, 'source row');`)
  const isolated = await services.branches.create('fk_isolated')
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="fk_source"]').click()
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert column/ }).click()
  const parent = page.locator('[role="dialog"]').filter({ has: page.getByPlaceholder('column_name') })
  await parent.getByPlaceholder('column_name').fill('parent_code')

  const openPanel = async () => {
    await parent.getByRole('button', { name: /Add foreign key|Edit foreign key/ }).click()
    const panel = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Add foreign key relationship/ }) })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('combobox', { name: /schema/i })).toHaveCount(0)
    return panel
  }
  const columnExists = async (name: string, database = config.DB_NAME) =>
    (await query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='fk_source' AND column_name='${name}'`, database)).rowCount! > 0

  let panel = await openPanel()
  await expect(panel.getByRole('button', { name: /^Save/ })).toBeDisabled()
  await page.keyboard.press('Control+Enter')
  assert.equal(await columnExists('parent_code'), false)
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(parent.getByPlaceholder('column_name')).toHaveValue('parent_code')
  panel = await openPanel()

  const selectTarget = async (column: string) => {
    await panel.getByRole('combobox', { name: /table.*reference/i }).click()
    await page.getByRole('option', { name: /zz_fk_reference.*parents/ }).click()
    await panel.getByRole('combobox', { name: /referenced column/i }).click()
    await page.getByRole('option', { name: new RegExp(`^${column}(?:\\s|$)`) }).click()
  }
  await selectTarget('code')
  for (const label of [/on delete/i, /on update/i]) {
    await panel.getByRole('combobox', { name: label }).click()
    await page.getByRole('option', { name: 'CASCADE', exact: true }).click()
  }
  await snapshot('foreign-key-side-panel')
  await page.keyboard.press('Control+Enter')
  await expect(panel).toHaveCount(0)
  assert.equal(await columnExists('parent_code'), false, 'Child Save must stage, not submit the parent')
  await expect(parent.getByText(/zz_fk_reference.*parents/)).toBeVisible()
  await parent.getByRole('button', { name: /^Save/ }).click()
  await expect(parent).toHaveCount(0)
  assert.equal(await columnExists('parent_code'), true)
  assert.equal(await columnExists('parent_code', isolated.database_name), false)
  const constraint = await query(`SELECT confdeltype, confupdtype FROM pg_constraint
    WHERE contype='f' AND conrelid='public.fk_source'::regclass AND confrelid='zz_fk_reference.parents'::regclass`)
  assert.equal(constraint.rows[0]?.confdeltype, 'c')
  assert.equal(constraint.rows[0]?.confupdtype, 'c')
  await query(`UPDATE public.fk_source SET parent_code='A' WHERE id=1`)
  await assert.rejects(query(`UPDATE public.fk_source SET parent_code='missing' WHERE id=1`), /foreign key/i)
  await query(`UPDATE zz_fk_reference.parents SET code='B' WHERE id=7`)
  assert.equal((await query(`SELECT parent_code FROM public.fk_source WHERE id=1`)).rows[0].parent_code, 'B')
  await query(`DELETE FROM zz_fk_reference.parents WHERE id=7`)
  assert.equal((await query(`SELECT * FROM public.fk_source`)).rowCount, 0)

  // An invalid reference must not leave the new column behind.
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert column/ }).click()
  await parent.getByPlaceholder('column_name').fill('bad_link')
  panel = await openPanel()
  await selectTarget('note')
  await panel.getByRole('button', { name: /^Save/ }).click()
  await parent.getByRole('button', { name: /^Save/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: /no unique constraint/i }).first()).toBeVisible()
  assert.equal(await columnExists('bad_link'), false)
  await expect(parent.getByPlaceholder('column_name')).toHaveValue('bad_link')
  await page.keyboard.press('Escape')
  console.log('PASS: nested foreign-key panel, direct cross-schema table selection, staged/cancelled drafts, Ctrl+Enter isolation, atomic persistence, real FK enforcement/cascades and branch isolation')
}
