import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'
import type { Services } from '../../Backend/src/services'
import { withDatabase } from '../../Backend/src/db/socket'

export async function verifyTableDefinition(page: Page, url: string, config: Config, services: Services, snapshot: (name: string) => Promise<unknown>) {
  await withDatabase(config, config.DB_NAME, client => client.query(`
    CREATE TABLE public.definition_users (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name text NOT NULL,
      email text UNIQUE,
      age integer CHECK (age >= 0),
      created_at timestamptz DEFAULT now(),
      normalized text GENERATED ALWAYS AS (lower(name)) STORED,
      group_id integer REFERENCES public.items(id)
    );
    COMMENT ON TABLE public.definition_users IS '<b>literal</b> -- not HTML';
    CREATE INDEX definition_users_name_idx ON public.definition_users(name);
    CREATE TABLE public."literal*"(only_here integer);
    CREATE TABLE public.literal_other(keep_out integer);
  `))
  const endpoint = (database: string, table = 'definition_users') => `${url}/api/studio/databases/${encodeURIComponent(database)}/tables/public/${encodeURIComponent(table)}/definition`
  const response = await page.request.get(endpoint(config.DB_NAME))
  assert.equal(response.status(), 200)
  const original = await response.json()
  for (const pattern of [/CREATE TABLE public\.definition_users/, /PRIMARY KEY \(id\)/, /UNIQUE \(email\)/, /CHECK/, /GENERATED ALWAYS/, /STORED/, /DEFAULT now\(\)/, /REFERENCES public\.items/, /CREATE INDEX definition_users_name_idx/]) {
    assert.match(original.sql, pattern)
  }
  assert.equal(original.sql.includes('CREATE TABLE public.comments'), false)
  assert.equal((await page.request.get(endpoint(config.DB_NAME, 'missing_table'))).status(), 404)
  const literal = await (await page.request.get(endpoint(config.DB_NAME, 'literal*'))).json()
  assert.match(literal.sql, /CREATE TABLE public\."literal\*"/)
  assert.equal(literal.sql.includes('literal_other'), false)

  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="definition_users"]').click()
  const definitionTab = page.locator('[data-table-footer]').getByRole('tab', { name: 'Definition', exact: true })
  const code = page.getByRole('textbox', { name: 'SQL definition', exact: true })
  const openSql = page.getByRole('button', { name: 'Open in SQL Editor', exact: true })
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/tables/public/definition_users/definition', async route => {
    await pending
    await route.continue()
  }, { times: 1 })
  try {
    await definitionTab.click()
    await expect(page.getByRole('status', { name: 'Loading table definition', exact: true })).toBeVisible()
    await expect(openSql).toBeDisabled()
  } finally { release() }
  await expect(code).toBeVisible()
  await expect(code).toHaveAttribute('aria-readonly', 'true')
  await expect(code).toHaveAttribute('aria-multiline', 'true')
  assert.equal((await code.locator('[data-sql-line]').allTextContents()).join('\n'), original.sql)
  await expect(code.locator('[aria-hidden="true"]').first()).toHaveText('1')
  await expect(code.locator('b')).toHaveCount(0)
  await code.focus()
  await page.keyboard.type('should_not_change_SQL')
  assert.equal((await code.locator('[data-sql-line]').allTextContents()).join('\n'), original.sql)
  await expect(page.getByRole('heading', { name: /SQL Definition of definition_users/ })).toBeInViewport()
  await code.evaluate(element => (element as HTMLElement).blur())
  const themeButton = page.getByRole('button').filter({ has: page.locator('svg.lucide-sun') })
  const settleTheme = () => page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})))
  })
  await themeButton.click()
  await expect(code).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await settleTheme()
  await snapshot('table-sql-definition-light')
  await themeButton.click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await settleTheme()
  await snapshot('table-sql-definition-dark')

  await page.locator('[data-table-footer]').getByRole('tab', { name: 'Data', exact: true }).click()
  await page.route('**/tables/public/definition_users/definition', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Definition temporarily unavailable' }),
  }), { times: 1 })
  await definitionTab.click()
  await expect(page.getByTestId('definition-error')).toContainText('Definition temporarily unavailable')
  await expect(openSql).toBeDisabled()
  await page.getByTestId('retry-definition').click()
  await expect(code).toBeVisible()

  await services.branches.create('definition_branch')
  const branch = (await services.catalog.branches()).find(branch => branch.name === 'definition_branch')!
  await withDatabase(config, branch.database_name, client => client.query('ALTER TABLE public.definition_users ADD COLUMN branch_only text'))
  const branchDefinition = await (await page.request.get(endpoint(branch.database_name))).json()
  assert.match(branchDefinition.sql, /branch_only/)
  assert.equal((await (await page.request.get(endpoint(config.DB_NAME))).json()).sql.includes('branch_only'), false)
  await page.evaluate(() => localStorage.setItem('sorabase_selected_branch', 'definition_branch'))
  await page.goto(`${url}/tables`)
  await page.locator('[data-table-explorer-row="definition_users"]').click()
  await definitionTab.click()
  await expect(code).toContainText('branch_only')

  const existing = await page.request.post(`${url}/api/studio/sql/snippets`, {
    headers: { origin: url }, data: { name: 'Keep existing query', sql: 'SELECT 42;', visibility: 'private', folderId: null },
  })
  assert.equal(existing.ok(), true)
  const libraryBefore = await (await page.request.get(`${url}/api/studio/sql/library`)).json()
  const posts: string[] = []
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()) })
  await openSql.click()
  await expect(page).toHaveURL(`${url}/sql`)
  await expect(page.getByText('Definition of public.definition_users', { exact: true }).first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('sorabase_sql_editor_handoff'))).toBeNull()
  const libraryAfter = await (await page.request.get(`${url}/api/studio/sql/library`)).json()
  assert.deepEqual(libraryAfter, libraryBefore)
  assert.deepEqual(posts, [])
  console.log('PASS: actual table DDL with constraints/defaults/indexes, literal wildcard selection, read-only highlighted SQL, line numbers, error/retry, branch isolation and unsaved SQL editor handoff without execution or library changes')
}
