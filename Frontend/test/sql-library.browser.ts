import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

type Library = {
  folders: { id: string; name: string; visibility: string }[]
  snippets: { id: string; name: string; sql: string; visibility: string; folderId: string | null; isFavorite: boolean }[]
}
export async function verifySqlLibrary(page: Page, url: string, setQuery: (sql: string) => Promise<void>) {
  const sidebar = page.locator('aside').filter({ has: page.getByPlaceholder('Search queries...') })
  const read = async (): Promise<Library> => {
    const response = await page.request.get(`${url}/api/studio/sql/library`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const change = async (action: () => Promise<unknown>): Promise<Library> => {
    const response = page.waitForResponse(r => r.url().includes('/api/studio/sql/') &&
      ['POST', 'PATCH', 'DELETE'].includes(r.request().method()))
    const [result] = await Promise.all([response, action()])
    assert.ok(result.ok(), await result.text())
    // Let React apply the successful mutation before the next UI action.
    await expect(page.getByText('Updating snippet library…', { exact: true })).toHaveCount(0)
    return result.json()
  }
  const menu = async (name: string) => sidebar.getByText(name, { exact: true }).first().click({ button: 'right' })
  const save = () => page.getByTitle('Save query (Ctrl+S)').click()

  await expect(page.getByText('Loading saved snippets…', { exact: true })).toHaveCount(0)
  // Metadata actions must also persist the initial scratch document without Save.
  for (const action of ['Add to favorites', 'Share with team']) {
    await setQuery('SELECT 123 AS scratch_metadata;')
    await menu('Untitled query')
    const created = await change(() => page.getByRole('button', { name: action, exact: true }).click())
    const snippet = created.snippets.find(s => s.sql.includes('scratch_metadata'))!
    assert.ok(snippet, 'Metadata action must create a SQLite snippet')
    assert.equal(snippet.isFavorite, action === 'Add to favorites')
    assert.equal(snippet.visibility, action === 'Share with team' ? 'shared' : 'private')
    await page.reload()
    await expect(page.getByText('Loading saved snippets…', { exact: true })).toHaveCount(0)
    await expect(sidebar.getByText('Untitled query', { exact: true }).first()).toBeVisible()
    assert.deepEqual((await read()).snippets.find(s => s.id === snippet.id), snippet)
    const deleted = await page.request.delete(`${url}/api/studio/sql/snippets/${snippet.id}`, { headers: { Origin: url } })
    assert.equal(deleted.status(), 200)
    await page.reload()
    await expect(page.getByText('Loading saved snippets…', { exact: true })).toHaveCount(0)
    await expect(sidebar.getByText('Untitled query', { exact: true }).first()).toBeVisible()
  }

  await setQuery('SELECT 314159 AS saved_snippet;')
  // A failed initial metadata save must not claim success or discard the draft.
  await page.route('**/api/studio/sql/snippets', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Metadata save unavailable"}',
  }))
  await menu('Untitled query')
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click()
  await expect(page.locator('[data-studio-toast][role="alert"]').filter({ hasText: 'Metadata save unavailable' })).toBeVisible()
  assert.equal((await read()).snippets.length, 0)
  await expect(page.locator('.view-lines')).toContainText('314159')
  await page.unroute('**/api/studio/sql/snippets')
  await menu('Untitled query')
  await page.getByRole('button', { name: 'Rename', exact: true }).click()
  await sidebar.getByRole('textbox').last().fill('Saved browser SQL')
  let library = await change(() => sidebar.getByRole('textbox').last().press('Enter'))
  const firstId = library.snippets.find(s => s.sql.includes('314159'))!.id
  assert.equal(library.snippets.find(s => s.id === firstId)?.name, 'Saved browser SQL')
  await menu('Saved browser SQL')
  library = await change(() => page.getByRole('button', { name: 'Add to favorites', exact: true }).click())
  assert.equal(library.snippets.find(s => s.id === firstId)?.isFavorite, true)
  await menu('Saved browser SQL')
  library = await change(() => page.getByRole('button', { name: 'Share with team', exact: true }).click())
  assert.equal(library.snippets.find(s => s.id === firstId)?.visibility, 'shared')

  await page.reload()
  await expect(sidebar.getByText('Saved browser SQL', { exact: true }).first()).toBeVisible()
  await sidebar.getByText('Saved browser SQL', { exact: true }).first().click()
  await expect(page.locator('.view-lines')).toContainText('314159')
  assert.equal((await read()).snippets.find(s => s.id === firstId)?.isFavorite, true)
  await menu('Saved browser SQL')
  library = await change(() => page.getByRole('button', { name: 'Make private', exact: true }).click())
  assert.equal(library.snippets.find(s => s.id === firstId)?.visibility, 'private')
  await menu('Saved browser SQL')
  library = await change(() => page.getByRole('button', { name: 'Remove from favorites', exact: true }).click())
  assert.equal(library.snippets.find(s => s.id === firstId)?.isFavorite, false)

  // A failed save must retain the editor draft and never change the stored SQL.
  await setQuery('SELECT 271828 AS retry_draft;')
  await page.route('**/api/studio/sql/snippets/*', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Library temporarily unavailable"}' })
    : route.continue())
  await save()
  await expect(page.locator('[data-studio-toast][role="alert"]').filter({ hasText: 'Library temporarily unavailable' })).toBeVisible()
  await expect(page.locator('.view-lines')).toContainText('271828')
  assert.match((await read()).snippets.find(s => s.id === firstId)!.sql, /314159/)
  await page.unroute('**/api/studio/sql/snippets/*')
  library = await change(save)
  assert.match(library.snippets.find(s => s.id === firstId)!.sql, /271828/)

  for (const [visibility, label, name] of [
    ['private', 'Create new folder', 'Private browser folder'],
    ['shared', 'Create shared folder', 'Shared browser folder'],
  ] as const) {
    await page.getByRole('button', { name: 'Create new query or folder', exact: true }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input').fill(name)
    library = await change(() => dialog.getByRole('button', { name: 'Save', exact: true }).click())
    assert.equal(library.folders.find(f => f.name === name)?.visibility, visibility)
  }
  await page.reload()
  await expect(sidebar.getByText('Saved browser SQL', { exact: true }).first()).toBeVisible()
  // Shared is collapsed by default in the original sidebar.
  if (!(await sidebar.getByText('Shared browser folder', { exact: true }).isVisible())) {
    await sidebar.getByText('SHARED', { exact: true }).click()
  }
  await expect(sidebar.getByText('Shared browser folder', { exact: true })).toBeVisible()
  await menu('Shared browser folder')
  library = await change(() => page.getByRole('button', { name: 'Create new snippet', exact: true }).click())
  const folder = library.folders.find(f => f.name === 'Shared browser folder')!
  const child = library.snippets.find(s => s.folderId === folder.id)!
  assert.equal(child.visibility, 'shared')
  await setQuery('SELECT 99 AS shared_folder_query;')
  library = await change(save)
  assert.match(library.snippets.find(s => s.id === child.id)!.sql, /99/)
  await menu('Shared browser folder')
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click()
  library = await change(() => page.getByRole('dialog').getByRole('button', { name: /^Delete/ }).click())
  assert.equal(library.snippets.find(s => s.id === child.id)?.folderId, null)
  await menu('Untitled query')
  await page.getByRole('button', { name: 'Delete query', exact: true }).click()
  library = await change(() => page.getByRole('dialog').getByRole('button', { name: /^Delete/ }).click())
  assert.equal(library.snippets.some(s => s.id === child.id), false)
  await page.getByRole('button', { name: 'Create new query or folder', exact: true }).click()
  library = await change(() => page.getByRole('menuitem', { name: 'Create new snippet', exact: true }).click())
  assert.equal(library.snippets.length, 2)
  await page.reload()
  assert.equal((await read()).snippets.length, 2)
  console.log('PASS: SQLite SQL saves/reload, rename, favorites, private/shared, failed-save draft retention, folders, new snippets and safe deletion')
}
