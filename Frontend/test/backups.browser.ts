import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { expect, type Locator, type Page } from '@playwright/test'
import { formatBytes } from '../lib/dashboard-metrics'

export async function verifyStorageAndBackups(page: Page, url: string, removeArchive: (id: string) => Promise<void>) {
  const palette = (header: Locator) => header.evaluate(element => {
    const root = document.documentElement
    const original = root.className
    const originalAttribute = root.getAttribute('data-theme')
    try {
      return ['light', 'dark'].map(theme => {
        root.classList.toggle('dark', theme === 'dark')
        root.setAttribute('data-theme', theme)
        const container = element.parentElement!
        const headerStyle = getComputedStyle(element)
        const containerStyle = getComputedStyle(container)
        return {
          theme,
          background: containerStyle.backgroundColor,
          border: containerStyle.borderColor,
          headerBackground: headerStyle.backgroundColor,
          headerBorder: headerStyle.borderBottomColor,
        }
      })
    } finally {
      root.className = original
      if (originalAttribute === null) root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', originalAttribute)
    }
  })
  await page.goto(`${url}/branches`)
  const branchPalette = await palette(page.getByText('Branch name', { exact: true }).locator('..'))
  const branchResponse = await page.request.get(`${url}/api/studio/branches`)
  assert.equal(branchResponse.status(), 200)
  const branches: { name: string; storage_bytes: number }[] = await branchResponse.json()
  assert.ok(branches.length > 0)
  for (const branch of branches) {
    assert.ok(branch.storage_bytes > 0)
    await expect(page.locator(`[data-branch-storage="${branch.name}"]`)).toHaveText(formatBytes(branch.storage_bytes))
  }
  await page.goto(`${url}/settings/backups`)
  await expect(page.getByRole('heading', { name: 'Database Backups' })).toBeVisible()
  assert.deepEqual(
    await palette(page.getByText('Backup name', { exact: true }).locator('..')),
    branchPalette,
    'Backup list backgrounds, headers and borders must match Branches in light and dark mode',
  )
  const list = async (): Promise<{ id: string; label: string; available: boolean }[]> => {
    const response = await page.request.get(`${url}/api/studio/backups`)
    assert.equal(response.status(), 200)
    return response.json()
  }
  const create = async (label: string) => {
    await page.getByRole('button', { name: 'Create backup', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Backup name', { exact: true }).fill(label)
    await dialog.getByRole('button', { name: 'Create backup', exact: true }).click()
    await expect(dialog).toHaveCount(0, { timeout: 30000 })
    await expect(page.getByRole('button', { name: `Actions for backup ${label}`, exact: true })).toBeVisible()
    return (await list()).find(backup => backup.label === label)!
  }
  const actions = (label: string) => page.getByRole('button', { name: `Actions for backup ${label}`, exact: true }).click()
  const backup = await create('Download browser snapshot')
  assert.ok(backup.id)
  assert.equal((await fetch(`${url}/api/studio/backups/${backup.id}/download`)).status, 401)
  await actions(backup.label)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download SQL dump', exact: true }).click()
  const download = await downloadEvent
  assert.equal(download.suggestedFilename(), `backup-${backup.id}.sql`)
  const file = await download.path()
  assert.ok(file)
  const sql = await readFile(file, 'utf8')
  assert.match(sql, /PostgreSQL database dump/)
  assert.match(sql, /CREATE TABLE public\.items/)
  assert.match(sql, /seed record/)
  await expect(page.locator('[data-studio-toast]').filter({ hasText: 'SQL dump downloaded' })).toBeVisible()
  const csrf = await page.request.delete(`${url}/api/studio/backups/${backup.id}`, {
    headers: { Origin: 'https://untrusted.invalid' }, data: { confirmBackupId: backup.id },
  })
  assert.equal(csrf.status(), 403)

  await actions(backup.label)
  await page.getByRole('menuitem', { name: 'Delete backup', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const confirm = dialog.getByRole('button', { name: 'Delete backup', exact: true })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel('Confirm backup ID', { exact: true }).fill(backup.id)
  await page.route(`**/api/studio/backups/${backup.id}`, route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Backup deletion failed"}',
  }))
  await confirm.click()
  await expect(page.locator('[data-studio-toast][role="alert"]').filter({ hasText: 'Backup deletion failed' })).toBeVisible()
  assert.ok((await list()).some(row => row.id === backup.id))
  await page.unroute(`**/api/studio/backups/${backup.id}`)
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  assert.equal((await list()).some(row => row.id === backup.id), false)
  await expect(page.locator('[data-studio-toast]').filter({ hasText: 'Backup deleted' })).toBeVisible()
  await page.reload()
  await expect(page.getByText('0 backups', { exact: true })).toBeVisible()

  // Missing files cannot be downloaded, but stale metadata can still be removed.
  const missing = await create('Missing archive snapshot')
  await removeArchive(missing.id)
  assert.equal((await page.request.get(`${url}/api/studio/backups/${missing.id}/download`)).status(), 404)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await actions(missing.label)
  await expect(page.getByRole('menuitem', { name: 'Download SQL dump', exact: true })).toBeDisabled()
  await page.getByRole('menuitem', { name: 'Delete backup', exact: true }).click()
  await dialog.getByLabel('Confirm backup ID', { exact: true }).fill(missing.id)
  await confirm.click()
  await expect(dialog).toHaveCount(0)
  assert.equal((await list()).length, 0)
  console.log('PASS: actual branch storage, SQL snapshot download, protected confirmed backup deletion, error recovery and missing-archive cleanup')
}
