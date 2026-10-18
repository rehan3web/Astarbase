import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'
import type { Config } from '../../Backend/src/config'

export async function verifyConnectDb(page: Page, url: string, config: Config) {
  await page.getByRole('link', { name: 'Connect', exact: true }).click()
  await expect(page).toHaveURL(`${url}/connect`)
  await expect(page.getByRole('heading', { name: 'ConnectDb', exact: true })).toBeVisible()
  const editor = page.getByRole('textbox', { name: 'Connection details', exact: true })
  await expect(editor).toHaveValue(/postgresql:.*\*{16}/)
  const originalTheme = await page.evaluate(() => ({
    className: document.documentElement.className,
    attribute: document.documentElement.getAttribute('data-theme'),
  }))
  try {
    for (const theme of ['light', 'dark']) {
      const colors = await page.locator('[data-connection-snippet]').evaluate((snippet, theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.setAttribute('data-theme', theme)
        const reference = document.createElement('div')
        reference.className = 'bg-surface-200'
        document.body.appendChild(reference)
        try {
          return {
            panel: getComputedStyle(snippet.closest('section')!).backgroundColor,
            snippet: getComputedStyle(snippet).backgroundColor,
            darkSnippet: getComputedStyle(reference).backgroundColor,
          }
        } finally { reference.remove() }
      }, theme)
      assert.equal(colors.panel, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgba(0, 0, 0, 0)')
      assert.equal(colors.snippet, theme === 'light' ? 'rgb(255, 255, 255)' : colors.darkSnippet)
      await page.screenshot({
        path: `../../generated-artifacts/ui-restoration/connect-db-${theme}.jpg`,
        fullPage: true,
      })
    }
  } finally {
    await page.evaluate(original => {
      document.documentElement.className = original.className
      if (original.attribute === null) document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', original.attribute)
    }, originalTheme)
  }
  const response = await page.request.get(`${url}/api/studio/databases/${config.DB_NAME}/connection`)
  assert.equal(response.status(), 200)
  assert.match(response.headers()['cache-control'], /no-store/)
  assert.equal(JSON.stringify(await response.json()).includes(config.DB_PASSWORD), false)
  await expect(page.getByLabel('Database password', { exact: true })).toHaveCount(0)
  await expect(page.getByText('The password is requested only when you choose to show it.', { exact: true })).toHaveCount(0)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const copyButton = page.getByRole('button', { name: 'Copy snippet', exact: true })
  const showButton = page.getByRole('button', { name: 'Show password', exact: true })
  await expect(page.locator('[data-connection-snippet]')).toContainText('Copy snippet')
  await expect(page.locator('[data-connection-snippet]')).toContainText('Show password')
  const copyBox = await copyButton.boundingBox(), showBox = await showButton.boundingBox(), editorBox = await editor.boundingBox()
  assert.ok(copyBox && showBox && editorBox && copyBox.y >= editorBox.y + editorBox.height && copyBox.x < showBox.x)
  // Same-host VPS installations may use HTTP, where navigator.clipboard is absent.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
  await copyButton.click()
  await expect(copyButton).toBeEnabled()
  await page.evaluate(() => Reflect.deleteProperty(navigator, 'clipboard'))
  const hiddenCopy = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  assert.equal(decodeURIComponent(hiddenCopy.password), config.DB_PASSWORD)
  await expect(editor).toHaveValue(/\*{16}/)
  await expect(showButton).toBeVisible()
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(editor).not.toHaveValue(/\*{16}/)
  const uri = new URL(await editor.inputValue())
  assert.equal(decodeURIComponent(uri.password), config.DB_PASSWORD)
  assert.equal(uri.pathname, `/${config.DB_NAME}`)
  assert.equal(uri.port, String(config.POSTGRES_PUBLIC_PORT))
  assert.equal(uri.hostname, new URL(url).hostname)
  await copyButton.click()
  await expect(copyButton).toBeEnabled()
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
  assert.equal(decodeURIComponent(copied.password), config.DB_PASSWORD)
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(editor).toHaveValue(/\*{16}/)
  await page.getByRole('tab', { name: 'Transaction Pooler', exact: true }).click()
  assert.ok((await editor.inputValue()).includes(`:${config.PGBOUNCER_PUBLIC_PORT}/`))
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(editor).not.toHaveValue(/\*{16}/)
  await page.getByRole('tab', { name: 'PSQL', exact: true }).click()
  await expect(editor).toHaveValue(/PGPASSWORD=.*\*{16}.*psql/)
  await page.getByRole('tab', { name: 'Parameters', exact: true }).click()
  await expect(editor).toHaveValue(/PGHOST=.*\nPGPORT=.*\nPGDATABASE=.*\nPGUSER=.*\nPGPASSWORD=.*\nPGSSLMODE=/)
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(editor).not.toHaveValue(/\*{16}/)
  assert.equal((await editor.inputValue()).includes(config.DB_PASSWORD), true)
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  const rejected = await page.request.post(`${url}/api/studio/databases/${config.DB_NAME}/connection/reveal`, {
    headers: { Origin: 'https://not-this-studio.example' }, data: {},
  })
  assert.equal(rejected.status(), 403)
  await page.route('**/connection/reveal', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}',
  }))
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeEnabled()
  await expect(editor).toHaveValue(/\*{16}/)
  await page.unroute('**/connection/reveal')
  await page.route('**/connection', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}',
  }))
  await page.reload()
  await expect(page.getByText('Connection details are unavailable', { exact: true })).toBeVisible()
  await page.unroute('**/connection')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(editor).toHaveValue(/\*{16}/)
  console.log('PASS: ConnectDb inline masking, attached snippet toolbar, real-password copy without revealing, four tabs, protected reveal/hide and recovery')
}
