import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import type { Services } from '../../Backend/src/services'
import { withDatabase } from '../../Backend/src/db/socket'
import { buildPolicySql } from '../components/policies/policy-sql'
import type { PolicyCommand } from '../components/policies/rls-types'

export async function verifyPoliciesUi(page: Page, url: string, services: Services, config: Config, snapshot: (name: string) => Promise<unknown>) {
  await withDatabase(config, config.DB_NAME, c => c.query(`CREATE TABLE public.rls_browser(id int PRIMARY KEY,tenant_id int);
    INSERT INTO public.rls_browser VALUES(1,1),(2,2)`))
  await services.branches.create('rls_branch')
  await services.branches.create('rls_child', 'rls_branch')
  const state = async (database = config.DB_NAME) => (await services.policies.list(database)).tables.find(table => table.name === 'rls_browser')!
  const dialog = page.getByRole('dialog')
  const sql = dialog.getByRole('textbox', { name: 'Policy SQL', exact: true })
  const source = (name: string, command: PolicyCommand = 'SELECT', predicate = 'tenant_id=1') => buildPolicySql({
    name, command, mode: 'PERMISSIVE', roles: ['astarbase_main'],
    usingExpression: command === 'INSERT' ? null : predicate,
    checkExpression: command === 'SELECT' || command === 'DELETE' ? null : predicate,
  }, 'public', 'rls_browser')
  const command = async (value: string) => {
    await dialog.getByRole('combobox', { name: 'Policy command', exact: true }).click()
    await page.getByRole('option', { name: value, exact: true }).click()
  }
  const confirm = async (name: string) => {
    await page.getByRole('button', { name, exact: true }).first().click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name, exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  const save = async () => {
    await dialog.getByRole('button', { name: 'Save policy', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await page.goto(`${url}/policies?schema=public&table=rls_browser`)
  await expect(page.getByRole('combobox', { name: 'Policy table' })).toContainText('public.rls_browser')
  await expect(page.getByText('Database roles', { exact: true })).toHaveCount(0)
  await expect(page.getByText('RLS enabled', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add RLS policy', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Enable RLS', exact: true }).first().click()
  await expect(dialog.getByRole('heading', { name: 'Enable Row Level Security', exact: true })).toBeVisible()
  await snapshot('rls-enable-warning')
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await state()).enabled, false)
  await confirm('Enable RLS')
  assert.equal((await state()).enabled, true)
  await confirm('Force RLS')
  assert.equal((await state()).forced, true)
  await page.getByRole('button', { name: 'Add RLS policy', exact: true }).click()
  const bounds = await dialog.boundingBox()
  assert.ok(bounds && Math.abs(bounds.x + bounds.width - 1440) < 3, 'Editor opens against the right viewport edge')
  await sql.fill(source('tenant_read'))
  await sql.blur()
  await expect(dialog.getByLabel('Policy name', { exact: true })).toHaveValue('tenant_read')
  await expect(dialog.getByRole('combobox', { name: 'Policy command', exact: true })).toContainText('SELECT')
  // Invalid edits remain intact and cannot be silently replaced by a dropdown.
  await sql.fill('CREATE POLICY unfinished')
  await command('DELETE')
  await expect(sql).toHaveValue('CREATE POLICY unfinished')
  await expect(dialog.getByRole('alert')).toContainText('Expected ON')
  await expect(dialog.getByRole('button', { name: 'Save policy', exact: true })).toBeDisabled()
  await sql.fill(source('tenant_read'))
  await sql.blur()
  await snapshot('rls-create-policy')
  await save()
  assert.equal((await state()).policies[0].command, 'SELECT')
  assert.deepEqual((await state()).policies[0].roles, ['astarbase_main'])
  await page.getByRole('button', { name: 'Edit policy tenant_read', exact: true }).click()
  await sql.fill(source('tenant_read', 'SELECT', 'nonexistent_rls_column=1'))
  await dialog.getByRole('button', { name: 'Save policy', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('does not exist')
  await expect(sql).toContainText('nonexistent_rls_column')
  assert.equal((await state()).policies[0].name, 'tenant_read')
  await sql.fill(source('tenant_all', 'ALL'))
  await sql.blur()
  await dialog.getByRole('combobox', { name: 'Policy mode', exact: true }).click()
  await page.getByRole('option', { name: 'Restrictive', exact: true }).click()
  await expect(sql).toHaveValue(/AS RESTRICTIVE/)
  await dialog.getByRole('button', { name: 'Target roles', exact: true }).click()
  await page.getByRole('checkbox', { name: 'PUBLIC', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(sql).toHaveValue(/TO .*PUBLIC/)
  await save()
  assert.equal((await state()).policies[0].mode, 'RESTRICTIVE')
  for (const cmd of ['INSERT', 'UPDATE', 'DELETE'] as const) {
    await page.getByRole('button', { name: 'Add RLS policy', exact: true }).click()
    await sql.fill(source(`ui_${cmd.toLowerCase()}`, 'ALL'))
    await sql.blur()
    await command(cmd)
    if (cmd === 'INSERT') await expect(sql).not.toHaveValue(/USING/)
    if (cmd === 'DELETE') await expect(sql).not.toHaveValue(/WITH CHECK/)
    await save()
  }
  await snapshot('rls-policy-list-dark')
  await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light') })
  await snapshot('rls-policy-list-light')
  await page.getByRole('button', { name: 'Add RLS policy', exact: true }).click()
  await snapshot('rls-sql-panel-light')
  await page.setViewportSize({ width: 390, height: 844 })
  await snapshot('rls-sql-panel-mobile')
  const mobileBounds = await dialog.boundingBox()
  assert.ok(mobileBounds && mobileBounds.width <= 390 && mobileBounds.x >= -1)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.getByRole('button', { name: 'Delete policy ui_delete', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await state()).policies.length, 4)
  await page.getByRole('button', { name: 'Delete policy ui_delete', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete policy', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  assert.equal((await state()).policies.length, 3)
  for (const name of ['rls_branch', 'rls_child']) {
    await page.getByRole('button', { name: 'Active branch', exact: true }).click()
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
    await expect(page.getByRole('combobox', { name: 'Policy table' })).toContainText('public.rls_browser')
    await expect(page.getByText('No policies defined', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add RLS policy', exact: true })).toHaveCount(0)
    assert.equal((await state(`branch_${name}`)).enabled, false)
    await confirm('Enable RLS')
    await page.getByRole('button', { name: 'Add RLS policy', exact: true }).click()
    await sql.fill(source(`${name}_only`, 'SELECT', 'tenant_id=2'))
    await save()
    assert.equal((await state(`branch_${name}`)).policies.length, 1)
    assert.equal((await state()).policies.length, 3)
    await confirm('Disable RLS')
    assert.equal((await state(`branch_${name}`)).enabled, false)
  }
  console.log('PASS: SQL side panel, valid/invalid SQL, synced command/mode/roles, CRUD, enable-first warning, responsive themes and main/branch/child isolation')
}
