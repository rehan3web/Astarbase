// Isolated end-to-end fixture: real Postgres + real Next + real API over Unix
// sockets. Only Docker exec is replaced by local psql/pg_dump/pg_restore binaries;
// no test adapter, credentials or auth bypass is included in the shipped app.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { createHmac, randomBytes } from 'node:crypto'
import { chromium, expect, type Browser } from '@playwright/test'
import { loadConfig, type Config } from '../../Backend/src/config'
import { createApp, createServices, type Services } from '../../Backend/src/index'
import { pushDatabase } from '../../Backend/src/db/push'
import { withDatabase, quoteIdentifier } from '../../Backend/src/db/socket'
import { startAdminListeners } from '../../Backend/src/services/system/listener.service'
import { verifyConnectDb } from './connect-db.browser'
import { verifyPrimaryKeyIcons } from './primary-key-icons.browser'
import { verifyForeignKeyPanel } from './foreign-key-panel.browser'
import { verifyTableFooter } from './table-footer.browser'
import { verifyLoadingStates } from './loading-states.browser'
import { verifyTableDefinition } from './table-definition.browser'
import { verifyServiceStatus } from './service-status.browser'
import { verifyTableSurfaces } from './table-surfaces.browser'
import { verifyTableRowCopy } from './table-row-copy.browser'
import { verifyInsertSurfaces } from './insert-surfaces.browser'
import { verifyBranchActions } from './branch-actions.browser'
import { verifySqlExports } from './sql-export.browser'
import { verifySqlLibrary } from './sql-library.browser'
import { verifyDashboardMetrics } from './dashboard-metrics.browser'
import { verifyQueryActivityUi } from './query-activity.browser'
import { verifyStorageAndBackups } from './backups.browser'
import { verifyBackupSurfaces } from './backup-surfaces.browser'
import { pipeline } from 'node:stream/promises'
import { verifyVisualizerCopy } from './visualizer-copy.browser'
import { verifySqlExecutionFeedback } from './sql-results.browser'
import { verifySqlScroll } from './sql-scroll.browser'
import { verifyDatabaseMaintenance } from './database-maintenance.browser'
import { verifyPoliciesUi } from './policies.browser'

async function main() {
const run = promisify(execFile)
const dir = await mkdtemp(path.join(tmpdir(), 'sorabase-ui-test-'))
const pgSocket = path.join(dir, 'pg')
const backups = path.join(dir, 'backups')
const socketPath = path.join(dir, 'admin.sock')
const data = path.join(dir, 'pgdata')
const token = randomBytes(32).toString('hex')
const signingSecret = randomBytes(32).toString('hex')
const loginPassword = randomBytes(24).toString('hex')
const config = {
  ...loadConfig({
    DB_NAME: 'ui_project', DB_USER: 'ui_admin', DB_PASSWORD: randomBytes(24).toString('hex'),
    ADMIN_API_TOKEN: token, ADMIN_DATA_DIR: path.join(dir, 'admin'), AUTO_START_COMPOSE: 'false',
    ADMIN_USERNAME: 'studio_owner', ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: loginPassword,
  }),
  PG_SOCKET_DIR: pgSocket, BACKUP_DIR: backups,
} as Config
let pgStarted = false
let listeners: Awaited<ReturnType<typeof startAdminListeners>> | undefined
let services: Services | undefined
let next: ChildProcess | undefined
let browser: Browser | undefined
let logs = ''
const url = 'http://127.0.0.1:5100'
try {
  await mkdir(pgSocket); await mkdir(backups)
  await run('initdb', ['-D', data, '-U', config.DB_USER, '-A', 'trust', '--no-locale'])
  await run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-k ${pgSocket} -h '' -p 5432`, '-w', 'start'])
  pgStarted = true
  await withDatabase(config, 'postgres', client => client.query(`CREATE DATABASE ${quoteIdentifier(config.DB_NAME)}`))
  services = createServices(config)
  await services.auth.initialize()
  services.postgres.docker.exec = async command => {
    const [exe, ...args] = command
    assert.ok(['psql', 'pg_dump', 'pg_restore', 'stat', 'rm', 'find'].includes(exe))
    const result = await run(exe, args, { env: { ...process.env, PGHOST: pgSocket, PGUSER: config.DB_USER, PGPASSWORD: config.DB_PASSWORD }, maxBuffer: 8 * 1024 * 1024 })
    return { stdout: result.stdout, stderr: result.stderr }
  }
  services.postgres.docker.execTo = async (command, destination) => {
    assert.equal(command[0], 'pg_restore')
    const process = spawn(command[0], command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
    const done = new Promise<void>((resolve, reject) => {
      process.on('error', reject)
      process.on('exit', code => code === 0 ? resolve() : reject(new Error('pg_restore failed')))
    })
    process.stderr.resume()
    await Promise.all([pipeline(process.stdout, destination, { end: false }), done])
  }
  await pushDatabase(config, services.catalog.store)
  await services.clientRoles.initialize()
  await withDatabase(config, config.DB_NAME, client => client.query(`
    CREATE TABLE items(id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,name text);
    CREATE TABLE comments(id integer PRIMARY KEY,item_id integer REFERENCES items(id));
    INSERT INTO items(name) VALUES('seed record');
  `))
  listeners = await startAdminListeners(createApp(config, services), 0, socketPath)
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '5100'], {
    cwd: process.cwd(),
    env: { ...process.env, ADMIN_API_TOKEN: token, SESSION_SECRET: signingSecret, ADMIN_SOCKET_PATH: socketPath, STUDIO_COOKIE_SECURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  next.stdout?.on('data', chunk => { logs += chunk.toString() })
  next.stderr?.on('data', chunk => { logs += chunk.toString() })
  for (let i = 0; i < 100; i++) {
    if (next.exitCode !== null) throw new Error(`Next startup failed: ${logs}`)
    try { if ((await fetch(`${url}/api/session`)).ok) break } catch {}
    if (i === 99) throw new Error('Next did not become ready')
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  assert.equal((await fetch(`${url}/api/studio/branches`)).status, 401)
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.emulateMedia({ colorScheme: 'dark' })
  const screenshots = path.resolve(process.cwd(), '../../generated-artifacts/ui-restoration')
  await mkdir(screenshots, { recursive: true })
  const snapshot = (name: string) => page.screenshot({ path: path.join(screenshots, `${name}.jpg`), fullPage: true })
  async function setQuery(query: string) {
    const editor = page.getByRole('textbox', { name: 'SQL query', exact: true })
    await expect(editor).toBeAttached({ timeout: 45000 })
    await editor.focus()
    await page.keyboard.press('Control+A')
    await page.keyboard.insertText(query)
  }
  const toasts = page.locator('[data-studio-toast]')
  async function expectToast(text: string | RegExp, error = false) {
    const toast = toasts.filter({ hasText: text }).last()
    await expect(toast).toBeVisible({ timeout: 30000 })
    if (error) await expect(toast).toHaveAttribute('role', 'alert')
    return toast
  }
  async function clearToasts() {
    while (await toasts.count()) await toasts.first().getByRole('button').click()
  }
  async function createToastTable(name: string) {
    await page.getByRole('button', { name: 'New table', exact: true }).click()
    await page.getByPlaceholder('e.g. products', { exact: true }).fill(name)
    await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
  }
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  await page.goto(url)
  await expect(page.getByLabel('Admin token', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
  const loginForm = page.locator('.sora-auth__form-wrap')
  const loginPanel = page.locator('.sora-auth__right')
  const formBox = await loginForm.boundingBox()
  const panelBox = await loginPanel.boundingBox()
  assert.ok(formBox && panelBox)
  assert.ok(Math.abs(formBox.y + formBox.height / 2 - panelBox.y - panelBox.height / 2) < 2, 'Login form must be vertically centered')
  const loginColor = await page.getByRole('button', { name: 'Login', exact: true }).evaluate(button => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = 'var(--brand-500)'
    button.appendChild(probe)
    const primary = getComputedStyle(probe).backgroundColor
    probe.remove()
    return { actual: getComputedStyle(button).backgroundColor, primary }
  })
  assert.equal(loginColor.actual, loginColor.primary)
  await expect(page.getByText('The Open Source alternative to Supabase and Neon.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sorabase on GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/sorabase/sorabase')
  await expect(page.getByRole('link', { name: 'Sorabase on X', exact: true })).toHaveAttribute('href', 'https://x.com/sorabase_tech')
  await expect(page.getByRole('button', { name: /SSO|Google|GitHub|Passkey/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Create an account|Lost your password/i })).toHaveCount(0)
  await page.getByLabel('Password', { exact: true }).fill('visibility-check')
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password')
  await page.getByLabel('Password', { exact: true }).fill('')
  await snapshot('password-login')
  const tokenAttempt = await page.request.post(`${url}/api/session`, {
    headers: { Origin: url }, data: { token },
  })
  assert.equal(tokenAttempt.status(), 400)
  assert.equal((await page.request.get(`${url}/api/studio/branches`)).status(), 401)
  await page.getByLabel('Email or username', { exact: true }).fill('studio_owner')
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expectToast('Invalid username/email or password', true)
  await expect(page.locator('.sora-auth__form-wrap').getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.sora-auth__error')).toHaveCount(0)
  await snapshot('login-error-toast-only')
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(loginPassword)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  if (process.env.STUDIO_LOGIN_LAYOUT_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    const loginCookie = (await page.context().cookies()).find(cookie => cookie.name === 'sorabase_session')
    assert.ok(loginCookie?.httpOnly)
    assert.equal(loginCookie?.sameSite, 'Strict')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()
    await page.getByLabel('Email or username', { exact: true }).fill('OWNER@EXAMPLE.TEST')
    await page.getByLabel('Password', { exact: true }).fill(loginPassword)
    await page.getByRole('button', { name: 'Login', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    assert.equal((await page.request.get(`${url}/api/studio/branches`)).status(), 200)
    assert.deepEqual(browserErrors, [])
    console.log('PASS: split login layout, social links only, password visibility, invalid credentials, username/email login, logout and HttpOnly session')
    return
  }
  if (process.env.STUDIO_QUERY_ACTIVITY_ONLY === '1' || process.env.STUDIO_UI_CLEANUP_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyQueryActivityUi(page, url, config.DB_NAME, snapshot)
    if (process.env.STUDIO_UI_CLEANUP_ONLY === '1') await verifyTableRowCopy(page, url, config.DB_NAME, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_BACKUP_SURFACES_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyBackupSurfaces(page, url, snapshot)
    await verifyStorageAndBackups(page, url, id => services!.postgres.removeDump(id))
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_SQL_RESULTS_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifySqlExecutionFeedback(page, url, config.DB_NAME, setQuery)
    await snapshot('sql-success')
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_SQL_SCROLL_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifySqlScroll(page, url, setQuery, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_BRANCH_ACTIONS_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyBranchActions(page, url, services, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_INSERT_SURFACES_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyInsertSurfaces(page, url, config.DB_NAME, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_TABLE_ROW_COPY_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyTableRowCopy(page, url, config.DB_NAME, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_TABLE_SURFACES_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyTableSurfaces(page, url, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_VISUALIZER_COPY_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifyVisualizerCopy(page, url, config.DB_NAME)
    await snapshot('visualizer-clean-toolbar')
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_SQL_EXPORT_ONLY === '1') {
    await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible({ timeout: 30000 })
    await verifySqlExports(page, url, setQuery, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  if (process.env.STUDIO_SERVICE_STATUS_ONLY === '1') {
    await verifyServiceStatus(page, url, config, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toBeVisible()
  await snapshot('home')
  await expect(page).toHaveTitle('Sorabase Studio')
  const brandedHome = page.getByRole('link', { name: 'Sorabase Studio', exact: true })
  await expect(brandedHome).toBeVisible()
  await expect(brandedHome.locator('img')).toHaveAttribute('src', '/sorabase-logo.png')
  assert.equal(await brandedHome.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth > 0), true)
  await expect(page.getByRole('heading', { name: 'Sorabase', exact: true })).toBeVisible()
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })
  assert.equal(await signOut.evaluate(button => Boolean(button.closest('aside'))), true)
  const signOutBox = await signOut.boundingBox()
  const settingsBox = await page.locator('aside a[href="/settings"]').boundingBox()
  assert.ok(signOutBox && settingsBox && signOutBox.y > settingsBox.y)
  await expect(page.getByText(/\d+ tables · \d+ relationships/)).toHaveCount(0)
  assert.equal(await page.locator('aside').getByText('Documentation', { exact: true }).count(), 0)
  const cookie = (await page.context().cookies()).find(c => c.name === 'sorabase_session')
  assert.ok(cookie?.httpOnly)
  assert.equal(cookie?.value.includes(token), false)
  assert.equal(cookie?.value.includes(loginPassword), false)
  assert.equal(cookie?.sameSite, 'Strict')
  const payload = cookie!.value.split('.')[0]
  const forged = `${payload}.${createHmac('sha256', token).update(`studio-session:${payload}`).digest('base64url')}`
  await page.context().addCookies([{ ...cookie!, value: forged }])
  assert.equal((await page.request.get(`${url}/api/studio/branches`)).status(), 401)
  await page.context().addCookies([cookie!])
  assert.equal((await page.request.get(`${url}/api/studio/branches`)).status(), 200)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()
  await page.getByLabel('Email or username', { exact: true }).fill('OWNER@EXAMPLE.TEST')
  await page.getByLabel('Password', { exact: true }).fill(loginPassword)
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toBeVisible()
  console.log('PASS: username and email password login, failed password, rejected token login, HttpOnly sessions, logout and unauthenticated proxy rejection')
  assert.equal((await page.request.get(`${url}/api/studio/branches`)).status(), 200)
  assert.equal((await page.request.get(`${url}/api/studio/auth/status`)).status(), 404)
  const csrf = await page.request.post(`${url}/api/session`, {
    headers: { Origin: 'https://untrusted.invalid' }, data: { identifier: 'studio_owner', password: loginPassword },
  })
  assert.equal(csrf.status(), 403)
  if (process.env.STUDIO_AUTH_ONLY === '1') {
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_DEFINITION_ONLY === '1') {
    await verifyTableDefinition(page, url, config, services, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_LOADING_ONLY === '1') {
    await verifyLoadingStates(page, url, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_FOOTER_ONLY === '1') {
    await verifyTableFooter(page, url, config, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_FOREIGN_KEYS_ONLY === '1') {
    await verifyForeignKeyPanel(page, url, config, services, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_ICONS_ONLY === '1') {
    await verifyPrimaryKeyIcons(page, url, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_CONNECT_ONLY === '1') {
    const mainClient = await services.clientRoles.get(config.DB_NAME)
    await verifyConnectDb(page, url, { ...config, DB_USER: mainClient.user, DB_PASSWORD: mainClient.password })
    await snapshot('connect-db')
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_RLS_ONLY === '1') {
    await verifyPoliciesUi(page, url, services, config, snapshot)
    assert.deepEqual(browserErrors, [])
    return
  }

  if (process.env.STUDIO_BRANCH_DROPDOWN_ONLY === '1') {
    await services.branches.create('dropdown_parent')
    await page.goto(`${url}/branches`)
    for (const entry of ['page', 'header'] as const) {
      if (entry === 'page') {
        await page.getByRole('button', { name: 'Create branch', exact: true }).click()
      } else {
        await page.getByRole('button', { name: 'Active branch', exact: true }).click()
        await page.getByRole('button', { name: 'Create new branch', exact: true }).click()
      }
      const dialog = page.getByRole('dialog')
      const parent = dialog.getByRole('combobox', { name: 'Parent database', exact: true })
      assert.equal(await parent.evaluate(element => element.tagName), 'BUTTON')
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => {
          document.documentElement.classList.remove('light', 'dark')
          document.documentElement.classList.add(theme)
        }, theme)
        await parent.click()
        await expect(page.getByRole('listbox')).toBeVisible()
        if (theme === 'light') {
          assert.equal(await page.getByRole('listbox').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)')
        }
        await snapshot(`branch-parent-${entry}-${theme}`)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeVisible()
      }
      await parent.focus()
      await page.keyboard.press('ArrowDown')
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.getByRole('option', { name: entry === 'page' ? /^dropdown_parent ·/ : /^main ·/ }).click()
      await expect(parent).toContainText(entry === 'page' ? 'dropdown_parent' : 'main')
      await dialog.getByLabel('New branch name', { exact: true }).fill(`dropdown_${entry}`)
      await dialog.getByRole('button', { name: 'Create branch', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      assert.equal(services.catalog.store.branch(`dropdown_${entry}`)?.parent_name, entry === 'page' ? 'dropdown_parent' : 'main')
    }
    assert.deepEqual(browserErrors, [])
    console.log('PASS: both branch creation entry points use shared styled dropdowns, white/light and dark menus, keyboard selection and real parent selection')
    return
  }

  if (process.env.STUDIO_SETTINGS_ONLY === '1') {
    // Docker is unavailable in this isolated browser fixture. Pooler Docker
    // discovery/write/reload is covered separately; this adapter tests the UI/API.
    let poolSize = 20
    services.pooler.get = async database => {
      assert.equal(database, config.DB_NAME)
      return { poolSize, maxClientConnections: 200 }
    }
    services.pooler.update = async (database, size) => {
      assert.equal(database, config.DB_NAME)
      poolSize = size
      return { poolSize, maxClientConnections: 200 }
    }
    await page.goto(`${url}/settings/database`)
    await expect(page.getByText('Studio preferences', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Passwords and network secrets remain server-managed/)).toHaveCount(0)
    const poolInput = page.getByLabel('Connection pool size', { exact: true })
    await expect(poolInput).toHaveValue('20')
    await expect(page.getByLabel('Max client connections', { exact: true })).toHaveValue('200')
    await expect(page.getByLabel('Max client connections', { exact: true })).toBeDisabled()
    await poolInput.fill('35')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expectToast('Connection pool size saved')
    await page.reload()
    await expect(poolInput).toHaveValue('35')
    await snapshot('main-database-settings')
    await page.getByRole('button', { name: 'Reset database password', exact: true }).click()
    const passwordInput = page.getByLabel('New database password', { exact: true })
    const resetButton = page.getByRole('button', { name: 'Reset password', exact: true })
    await expect(passwordInput).toHaveValue('')
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await expect(resetButton).toBeDisabled()
    await passwordInput.fill('short')
    await expect(resetButton).toBeDisabled()
    await page.getByRole('button', { name: 'Generate a password', exact: true }).click()
    await expect(passwordInput).toHaveValue(/^[A-Za-z0-9_-]{32}$/)
    const manualMainPassword = 'chosen-main-client-password'
    await passwordInput.fill(manualMainPassword)
    await snapshot('reset-password-modal')
    await resetButton.click()
    await expectToast('Database password reset. Use Connect to reveal the new password.')
    assert.equal((await services.clientRoles.get(config.DB_NAME)).password, manualMainPassword)
    const mainCredential = await services.clientRoles.get(config.DB_NAME)
    for (const [name, parent] of [['settings_dev', 'main'], ['settings_child', 'settings_dev']]) {
      await services.branches.create(name, parent)
      // Reload gets the latest inventory through the real authenticated API.
      await page.reload()
      await page.getByRole('button', { name: 'Active branch', exact: true }).click()
      await page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
      await expect(poolInput).toHaveCount(0)
      const database = `branch_${name}`
      const before = await services.clientRoles.get(database)
      assert.equal(before.user, name)
      await page.getByRole('button', { name: 'Reset database password', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toBeDisabled()
      await expect(passwordInput).toHaveValue('')
      await page.getByRole('button', { name: 'Generate a password', exact: true }).click()
      const generated = await passwordInput.inputValue()
      assert.match(generated, /^[A-Za-z0-9_-]{32}$/)
      const desired = parent === 'main' ? 'chosen-branch-client-password' : generated
      await passwordInput.fill(desired)
      await page.getByRole('button', { name: 'Reset password', exact: true }).click()
      await expectToast('Database password reset. Use Connect to reveal the new password.')
      const after = await services.clientRoles.get(database)
      assert.notEqual(after.password, before.password)
      assert.equal(after.password, desired)
      assert.deepEqual(await services.clientRoles.get(config.DB_NAME), mainCredential)
      await snapshot(`${name}-settings`)
      const response = await page.request.post(`${url}/api/studio/databases/${database}/connection/reveal`, {
        headers: { Origin: url }, data: {},
      })
      assert.equal((await response.json()).password, after.password)
      await page.getByRole('button', { name: 'Reset database password', exact: true }).click()
      await expect(passwordInput).toHaveValue('')
      await passwordInput.fill('cancelled-password-change')
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.deepEqual(await services.clientRoles.get(database), after)
    }
    await verifyDatabaseMaintenance(page, url, services, config, snapshot)
    await page.setViewportSize({ width: 390, height: 844 })
    await snapshot('mobile-database-settings')
    assert.deepEqual(browserErrors, [])
    console.log('PASS: main-only pool controls, fixed 200 clients, supplied reset modal, custom main/branch passwords, optional child password generation, cancellation and selected-database isolation')
    return
  }

  if (process.env.STUDIO_EXPLORER_ONLY === '1') {
    await page.goto(`${url}/tables`)
    const explorer = page.locator('aside').filter({ has: page.getByPlaceholder('Search tables...') })
    for (const name of ['items', 'comments']) {
      const row = explorer.locator(`[data-table-explorer-row="${name}"]`)
      await expect(row).toHaveText(name)
      assert.deepEqual(await row.evaluate(element => {
        const style = getComputedStyle(element)
        return { animation: style.animationName, transition: style.transitionDuration }
      }), { animation: 'none', transition: '0s' })
      await row.click()
      await expect(row.getByRole('button', { name: `Actions for ${name}`, exact: true })).toBeVisible()
      await expect(explorer.getByRole('button', { name: /^Actions for / })).toHaveCount(1)
      const otherName = name === 'items' ? 'comments' : 'items'
      const otherRow = explorer.locator(`[data-table-explorer-row="${otherName}"]`)
      await otherRow.hover()
      await expect(otherRow.locator('button')).toBeHidden()
      await row.getByRole('button', { name: `Actions for ${name}`, exact: true }).click()
      const menu = page.getByRole('menu')
      await expect(menu).toBeVisible()
      assert.deepEqual(await menu.evaluate(element => {
        const style = getComputedStyle(element)
        return { animation: style.animationName, transition: style.transitionDuration }
      }), { animation: 'none', transition: '0s' })
      await expect(page.getByRole('menuitem', { name: 'Edit table', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await explorer.locator('[data-table-explorer-row="items"]').click()
    await explorer.getByRole('button', { name: 'Actions for items', exact: true }).click()
    const darkBackground = await page.getByRole('menu').evaluate(element => getComputedStyle(element).backgroundColor)
    await page.keyboard.press('Escape')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.evaluate(() => localStorage.setItem('studio-theme', 'light'))
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/light/)
    await explorer.locator('[data-table-explorer-row="items"]').click()
    await explorer.getByRole('button', { name: 'Actions for items', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.getByRole('menuitem', { name: 'Export data', exact: true }).hover()
    await expect(page.getByRole('menu')).toHaveCount(2)
    for (const menu of await page.getByRole('menu').all()) {
      await expect(menu).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    }
    await snapshot('light-dropdown')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.evaluate(() => localStorage.setItem('studio-theme', 'dark'))
    await page.reload()
    await explorer.locator('[data-table-explorer-row="items"]').click()
    await explorer.getByRole('button', { name: 'Actions for items', exact: true }).click()
    await expect(page.getByRole('menu')).toHaveCSS('background-color', darkBackground)
    await page.keyboard.press('Escape')
    console.log('PASS: light dropdowns and submenus are exactly #FFFFFF; dark background unchanged')
    await snapshot('table-explorer')
    assert.deepEqual(browserErrors, [])
    console.log('PASS: only the selected table has three-dot actions, including on hover; no row counts or click/menu animations')
    return
  }

  await verifyVisualizerCopy(page, url, config.DB_NAME)
  await snapshot('visualizer-copy')
  if (process.env.STUDIO_VISUALIZER_ONLY === '1') {
    assert.deepEqual(browserErrors, [])
    return
  }

  await verifyStorageAndBackups(page, url, id => services!.postgres.removeDump(id))
  await snapshot('backup-actions')
  if (process.env.STUDIO_BACKUPS_ONLY === '1') {
    assert.deepEqual(browserErrors, [])
    return
  }

  await page.goto(`${url}/sql`)
  await setQuery('SELECT 42 AS answer;')
  await page.getByTitle('Run query (Ctrl+Enter)').click()
  await expect(page.getByRole('cell', { name: '42', exact: true })).toBeVisible()
  await expectToast(/query.*(executed|completed)|SQL.*(executed|completed)/i)
  await snapshot('sql')
  await setQuery('SELECT * FROM no_such_table;')
  await page.getByTitle('Run query (Ctrl+Enter)').click()
  await expectToast(/no_such_table.*does not exist/, true)
  console.log('PASS: SQL results and actual SQL error rendering')
  await verifySqlExecutionFeedback(page, url, config.DB_NAME, setQuery)
  await verifyDashboardMetrics(page, url, config, services)
  await snapshot('dashboard-metrics')
  if (process.env.STUDIO_METRICS_ONLY === '1') {
    assert.deepEqual(browserErrors, [])
    return
  }
  await page.goto(`${url}/sql`)
  await verifySqlLibrary(page, url, setQuery)
  await snapshot('sql-library')
  if (process.env.STUDIO_SQL_LIBRARY_ONLY === '1') {
    assert.deepEqual(browserErrors, [])
    return
  }

  await page.goto(`${url}/tables`)
  await page.getByText('items', { exact: true }).first().click()
  await expect(page.getByText('seed record', { exact: true })).toBeVisible()
  await page.getByText('seed record', { exact: true }).dblclick()
  await page.locator('td input').fill('edited from browser')
  await page.locator('td input').press('Enter')
  await expectToast(/Row (updated|saved)/)
  await expect(page.getByText('edited from browser', { exact: true })).toBeVisible()
  await withDatabase(config, config.DB_NAME, async client => {
    assert.equal((await client.query('SELECT name FROM items WHERE id=1')).rows[0].name, 'edited from browser')
  })
  console.log('PASS: table reads and browser cell edits persisted in real Postgres')

  await snapshot('tables')
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert row/ }).click()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expectToast('Row inserted')
  await withDatabase(config, config.DB_NAME, async client => assert.equal((await client.query('SELECT count(*)::int AS count FROM items')).rows[0].count, 2))
  const inserted = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '2', exact: true }) })
  await inserted.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Delete 1 row', exact: true }).click()
  await page.getByRole('dialog', { name: 'Confirm Deletion' }).getByRole('button', { name: 'Delete 1 row', exact: true }).click()
  await expectToast('Selected rows deleted')
  await withDatabase(config, config.DB_NAME, async client => assert.equal((await client.query('SELECT count(*)::int AS count FROM items')).rows[0].count, 1))
  console.log('PASS: default-valued row insert and selected-row deletion')

  await clearToasts()
  await createToastTable('toast_table')
  await expectToast(/Table.*created/)
  await withDatabase(config, config.DB_NAME, async client => {
    assert.equal((await client.query("SELECT to_regclass('public.toast_table') AS name")).rows[0].name, 'toast_table')
  })
  await clearToasts()
  await expect(toasts).toHaveCount(0)
  await createToastTable('toast_table')
  await expectToast(/already exists/, true)
  await expect(toasts.filter({ hasText: /Table.*created/ })).toHaveCount(0)
  if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await clearToasts()
  await page.getByRole('button', { name: 'Actions for toast_table', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit table', exact: true }).click()
  await page.locator('#edit-table-name').fill('toast_renamed')
  await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
  await expectToast(/Table.*(updated|renamed)/)
  await withDatabase(config, config.DB_NAME, async client => {
    assert.equal((await client.query("SELECT to_regclass('public.toast_renamed') AS name")).rows[0].name, 'toast_renamed')
  })
  await clearToasts()
  await page.getByText('toast_renamed', { exact: true }).first().click()
  await page.getByRole('button', { name: 'Insert', exact: true }).click()
  await page.getByRole('menuitem', { name: /Insert column/ }).click()
  await page.getByPlaceholder('column_name', { exact: true }).fill('toast_column')
  await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
  await expectToast(/Column.*created/)
  await expect(page.getByRole('columnheader', { name: /toast_column/ })).toBeVisible()
  await clearToasts()
  await page.getByRole('columnheader', { name: /toast_column/ }).getByRole('button').first().click()
  await page.getByRole('menuitem', { name: 'Edit column', exact: true }).click()
  await page.getByPlaceholder('column_name', { exact: true }).fill('toast_column_updated')
  await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
  await expectToast(/Column.*updated/)
  await clearToasts()
  await page.getByRole('columnheader', { name: /toast_column_updated/ }).getByRole('button').first().click()
  await page.getByRole('menuitem', { name: 'Delete column', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete column', exact: true }).click()
  await expectToast(/Column.*deleted/)
  await withDatabase(config, config.DB_NAME, async client => {
    assert.equal((await client.query("SELECT 1 FROM information_schema.columns WHERE table_name='toast_renamed' AND column_name LIKE 'toast_column%'")).rowCount, 0)
  })
  await clearToasts()
  await page.getByRole('button', { name: 'Actions for toast_renamed', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete table', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
  const deletedToast = await expectToast(/Table.*deleted/)
  await snapshot('table-deleted-toast')
  await expect(deletedToast).toHaveCount(0, { timeout: 15000 })
  await withDatabase(config, config.DB_NAME, async client => {
    assert.equal((await client.query("SELECT to_regclass('public.toast_renamed') AS name")).rows[0].name, null)
  })
  console.log('PASS: original-style table/column CRUD toasts, real DB changes, failed create without false success, dismissal and automatic expiry')

  await page.goto(`${url}/visualizer`)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await snapshot('visualizer')
  await clearToasts()
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Auto layout', exact: true }).click()
  await expect(toasts).toHaveCount(4)
  await clearToasts()
  console.log('PASS: rapid actions keep a bounded, individually dismissible original-style toast stack')
  console.log('PASS: real schema tables and foreign-key relationship')

  await page.goto(`${url}/branches`)
  await page.getByRole('button', { name: 'Actions for main', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Rename tag', exact: true }).click()
  await page.getByLabel('Branch tag', { exact: true }).fill('Live production')
  await page.getByRole('button', { name: 'Save tag', exact: true }).click()
  await expectToast('Branch tag updated')
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toContainText('Live production')
  assert.equal(services.catalog.store.branch('main')?.tag, 'Live production')
  await page.getByRole('button', { name: 'Create branch', exact: true }).click()
  await page.getByLabel('New branch name', { exact: true }).fill('dev')
  await page.getByLabel('Environment tag', { exact: true }).fill('staging')
  await page.getByRole('button', { name: 'Create branch', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Actions for dev', exact: true })).toBeVisible({ timeout: 30000 })
  await expectToast(/Branch.*dev.*created/)
  assert.equal(services.catalog.store.branch('dev')?.tag, 'staging')
  await expect(page.getByText('staging', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Active branch', exact: true }).click()
  const branchSearch = page.getByPlaceholder('Search branches...', { exact: true })
  await branchSearch.fill('staging')
  await expect(page.getByRole('option', { name: /^main/ })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /^dev/ })).toBeVisible()
  await branchSearch.fill('')
  await page.keyboard.press('Escape')
  await clearToasts()
  await page.getByRole('button', { name: 'Actions for dev', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit tag', exact: true }).click()
  await page.getByLabel('Branch tag', { exact: true }).fill('release/v1')
  await page.route('**/api/studio/branches/dev', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Tag update temporarily unavailable' }),
  }), { times: 1 })
  await page.getByRole('button', { name: 'Save tag', exact: true }).click()
  await expectToast('Tag update temporarily unavailable', true)
  await expect(page.getByRole('dialog', { name: 'Edit branch tag', exact: true })).toBeVisible()
  await expect(page.getByLabel('Branch tag', { exact: true })).toHaveValue('release/v1')
  await expect(toasts.filter({ hasText: 'Branch tag updated' })).toHaveCount(0)
  assert.equal(services.catalog.store.branch('dev')?.tag, 'staging')
  await page.getByRole('button', { name: 'Save tag', exact: true }).click()
  await expectToast('Branch tag updated')
  assert.equal(services.catalog.store.branch('dev')?.tag, 'release/v1')
  await page.reload()
  await expect(page.getByText('release/v1', { exact: true })).toBeVisible()
  await snapshot('branches')
  await page.getByRole('button', { name: 'Active branch', exact: true }).click()
  await page.getByRole('option', { name: /^dev/ }).click()
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toContainText('release/v1')
  console.log('PASS: SQLite branch tags create/edit/main editing, tag search, shared header updates, reload persistence, and failed-save recovery')
  await page.goto(`${url}/sql`)
  await setQuery("UPDATE items SET name='dev only' WHERE id=1;")
  await page.getByTitle('Run query (Ctrl+Enter)').click()
  await expect(page.locator('main pre[role="status"]')).toHaveText('Query executed successfully')
  await expect(page.getByText('Complete raw output (all statements and notices)')).toHaveCount(0)
  await withDatabase(config, config.DB_NAME, async client => assert.equal((await client.query('SELECT name FROM items WHERE id=1')).rows[0].name, 'edited from browser'))
  console.log('PASS: branch creation, shared branch selection and database isolation')

  await page.goto(`${url}/backups`)
  await expect(page).toHaveURL(`${url}/settings/backups`)
  await expect(page.getByRole('link', { name: 'Backups', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/backups"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Create backup', exact: true }).click()
  await page.getByLabel('Backup name', { exact: true }).fill('Browser snapshot')
  await page.getByRole('button', { name: 'Create backup', exact: true }).click()
  await expect(page.getByText('Browser snapshot', { exact: true })).toBeVisible({ timeout: 30000 })
  await expectToast(/Backup.*Browser snapshot.*created/)
  await snapshot('backups')
  await withDatabase(config, 'branch_dev', client => client.query("UPDATE items SET name='after backup' WHERE id=1"))
  await page.getByRole('button', { name: 'Actions for backup Browser snapshot', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Restore backup', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Restore backup', exact: true })).toBeDisabled()
  await page.getByLabel('Confirm restore database', { exact: true }).fill('branch_dev')
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click()
  await expectToast('Backup restored into branch_dev. Clients must reconnect.')
  assert.equal(services.catalog.store.branch('dev')?.tag, 'release/v1')
  await withDatabase(config, 'branch_dev', async client => assert.equal((await client.query('SELECT name FROM items WHERE id=1')).rows[0].name, 'dev only'))
  console.log('PASS: pg_dump archive creation, restore confirmation and real restoration')

  await page.goto(`${url}/branches`)
  await page.getByRole('button', { name: 'Actions for dev', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Pull / refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh branch', exact: true })).toBeDisabled()
  await page.getByLabel('Confirm branch database', { exact: true }).fill('branch_dev')
  await page.getByRole('button', { name: 'Refresh branch', exact: true }).click()
  await expectToast('Branch "dev" refreshed from its parent. Clients must reconnect.')
  assert.equal(services.catalog.store.branch('dev')?.tag, 'release/v1')
  await withDatabase(config, 'branch_dev', async client => assert.equal((await client.query('SELECT name FROM items WHERE id=1')).rows[0].name, 'edited from browser'))
  console.log('PASS: branch refresh confirmation and parent data restored')
  await page.getByRole('button', { name: 'Actions for dev', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit tag', exact: true }).click()
  await page.getByLabel('Branch tag', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save tag', exact: true }).click()
  await expectToast('Branch tag removed')
  assert.equal(services.catalog.store.branch('dev')?.tag, null)
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).not.toContainText('release/v1')

  await page.goto(`${url}/settings/database`)
  await expect(page.getByText('Studio preferences', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Connection pool size', { exact: true })).toHaveCount(0)
  const previousPassword = (await services.clientRoles.get('branch_dev')).password
  await page.getByRole('button', { name: 'Reset database password', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toBeDisabled()
  await page.getByLabel('New database password', { exact: true }).fill('chosen-branch-client-password')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expectToast('Database password reset. Use Connect to reveal the new password.')
  assert.notEqual((await services.clientRoles.get('branch_dev')).password, previousPassword)
  await snapshot('settings')
  await page.getByRole('button', { name: 'Active branch', exact: true }).click()
  await page.getByRole('button', { name: 'Create new branch', exact: true }).click()
  await page.getByLabel('New branch name', { exact: true }).fill('tagged_header')
  await page.getByLabel('Environment tag', { exact: true }).fill('preview')
  await page.getByRole('dialog').getByRole('button', { name: 'Create branch', exact: true }).click()
  await expectToast(/Branch.*tagged_header.*created/)
  assert.equal(services.catalog.store.branch('tagged_header')?.tag, 'preview')
  assert.equal(services.catalog.store.branch('tagged_header')?.parent_name, 'dev')
  await page.getByRole('button', { name: 'Active branch', exact: true }).click()
  await page.getByRole('option', { name: /^tagged_header/ }).click()
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toContainText('preview')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Active branch', exact: true })).toContainText('preview')
  await page.getByRole('button', { name: 'Active branch', exact: true }).click()
  await snapshot('branch-tags-switcher')
  await page.keyboard.press('Escape')
  console.log('PASS: tag removal and header-switcher creation persist real tags and preserve parent selection')
  await page.goto(`${url}/branches`)
  await page.getByRole('button', { name: 'Actions for dev', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete branch', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Delete branch', exact: true })).toBeDisabled()
  await page.getByLabel('Confirm branch database', { exact: true }).fill('branch_dev')
  await page.getByRole('dialog').getByRole('button', { name: 'Delete branch', exact: true }).click()
  await expectToast('Endpoint not found', true)
  await expect(toasts.filter({ hasText: /Branch.*dev.*deleted/ })).toHaveCount(0)
  await withDatabase(config, 'postgres', async client => {
    assert.equal((await client.query("SELECT 1 FROM pg_database WHERE datname='branch_dev'")).rowCount, 1)
  })
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  console.log('PASS: unsupported branch-delete API shows an error toast, never a false success or data removal')
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible()
  assert.deepEqual(browserErrors, [])
  console.log('PASS: SQLite settings, sign-out, and no browser page errors')
} finally {
  await browser?.close()
  if (next && next.exitCode === null) {
    const exit = new Promise(resolve => next!.once('exit', resolve))
    next.kill('SIGTERM')
    await exit
  }
  await listeners?.close()
  services?.close()
  if (pgStarted) await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
  await rm(dir, { recursive: true, force: true })
}
}
main().catch(error => { console.error(error); process.exitCode = 1 })
