import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifySqlExecutionFeedback(page: Page, url: string, database: string, setQuery: (sql: string) => Promise<void>) {
  await page.goto(`${url}/sql`)
  const run = page.getByTitle('Run query (Ctrl+Enter)')
  const status = page.locator('main pre[role="status"]')
  const execute = async (sql: string) => {
    await setQuery(sql)
    const response = page.waitForResponse(r => r.url() === `${url}/api/studio/sql` && r.request().method() === 'POST')
    await run.click()
    const result = await response
    await result.finished()
    await expect(run).toBeEnabled()
    return result
  }

  assert.ok((await execute(`
    SET search_path TO public;
    SELECT pg_catalog.set_config('search_path', '', false);
    CREATE TABLE public.sql_success_fixture(id integer PRIMARY KEY);
    ALTER TABLE public.sql_success_fixture ADD COLUMN label text NOT NULL DEFAULT 'new';
    COMMENT ON TABLE public.sql_success_fixture IS 'SQL success regression fixture';
  `)).ok())
  await expect(status).toHaveText('Query executed successfully')
  await expect(page.getByRole('columnheader', { name: 'output', exact: true })).toHaveCount(0)
  const raw = page.locator('details').filter({ hasText: 'Complete raw output (all statements and notices)' })
  await expect(raw).toHaveCount(0)

  assert.ok((await execute("INSERT INTO public.sql_success_fixture VALUES(1, 'returning value') RETURNING id, label;")).ok())
  await expect(page.getByRole('cell', { name: 'returning value', exact: true })).toBeVisible()
  assert.ok((await execute("UPDATE public.sql_success_fixture SET label='updated value' WHERE id=1;")).ok())
  await expect(status).toHaveText('Query executed successfully')
  assert.ok((await execute('SELECT id, label FROM public.sql_success_fixture;')).ok())
  await expect(page.getByRole('cell', { name: 'updated value', exact: true })).toBeVisible()
  const rows = await page.request.get(`${url}/api/studio/databases/${database}/tables/public/sql_success_fixture/rows`)
  assert.equal(rows.status(), 200)
  assert.equal((await rows.json()).rows[0].label, 'updated value')

  assert.equal((await execute('SELECT * FROM missing_sql_result_fixture;')).ok(), false)
  await expect(page.locator('main pre[role="alert"]')).toContainText('does not exist')
  assert.ok((await execute('DROP TABLE public.sql_success_fixture;')).ok())
  await expect(status).toHaveText('Query executed successfully')
  await expect(page.locator('[data-studio-toast]').filter({ hasText: 'Query executed successfully' }).last()).toBeVisible()
  console.log('PASS: DDL batches and UPDATE show success without raw-output section; RETURNING, SELECT and SQL errors preserved')
}
