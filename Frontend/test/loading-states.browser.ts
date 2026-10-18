import assert from 'node:assert/strict'
import { expect, type Page } from '@playwright/test'

export async function verifyLoadingStates(page: Page, url: string, snapshot: (name: string) => Promise<unknown>) {
  const releases: Array<() => void> = []
  const hold = async (pattern: string | RegExp) => {
    let entered = false
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    releases.push(release)
    await page.route(pattern, async route => {
      entered = true
      await pending
      await route.continue()
    }, { times: 1 })
    return { release, wait: () => expect.poll(() => entered, { timeout: 15000 }).toBe(true) }
  }
  const grayLoader = async (label: string) => {
    const status = page.getByRole('status', { name: label, exact: true })
    await expect(status).toBeVisible()
    assert.equal(await status.evaluate(element => {
      const svg = element.matches('svg') ? element : element.querySelector('svg')
      return svg?.matches('[data-spinner]') && svg.classList.contains('text-foreground-muted')
    }), true)
  }
  const cardTitles = ['Database Size', 'Connections', 'Compute CPU', 'RAM Usage']
  const checkCards = async (pending: boolean) => {
    for (const title of cardTitles) {
      const card = page.locator('[data-metric-card]').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      if (pending) {
        await expect(card).toHaveAttribute('aria-busy', 'true')
        await expect(card.locator('[data-skeleton]').first()).toBeVisible()
      } else {
        await expect(card).not.toHaveAttribute('aria-busy', 'true')
        await expect(card.locator('[data-skeleton]')).toHaveCount(0)
      }
    }
    const chart = page.getByRole('region', { name: 'Sync Activity', exact: true })
    if (pending) await grayLoader('Loading sync activity')
    else await expect(chart.locator('[data-spinner]')).toHaveCount(0)
  }
  const metricsPattern = '**/api/studio/databases/*/metrics?*'
  try {
    await page.clock.install()
    const bootstrap = await hold('**/api/studio/branches')
    const metrics = await hold(metricsPattern)
    await page.goto(url)
    await bootstrap.wait()
    await grayLoader('Loading live databases')
    await expect(page.getByText('Connecting to backend', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry connection', exact: true })).toHaveCount(0)
    await snapshot('studio-bootstrap-gray-spinner')
    bootstrap.release()
    await metrics.wait()
    await checkCards(true)
    await snapshot('dashboard-initial-skeletons')
    metrics.release()
    await checkCards(false)

    for (let attempt = 0; attempt < 2; attempt++) {
      const refresh = await hold(metricsPattern)
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await refresh.wait()
      await checkCards(true)
      if (attempt === 0) await snapshot('dashboard-refresh-skeletons')
      refresh.release()
      await checkCards(false)
    }
    const automatic = await hold(metricsPattern)
    await page.clock.fastForward(30_000)
    await automatic.wait()
    await checkCards(true)
    automatic.release()
    await checkCards(false)

    await page.route(metricsPattern, route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Metrics temporarily unavailable' }),
    }), { times: 1 })
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toBeVisible()
    await checkCards(false)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Metrics temporarily unavailable' })).toHaveCount(0)
    await checkCards(false)

    const schema = await hold('**/api/studio/databases/*/schema')
    await page.goto(`${url}/visualizer`)
    await schema.wait()
    await grayLoader('Loading schema visualizer')
    await snapshot('visualizer-gray-spinner')
    schema.release()
    await expect(page.getByRole('status', { name: 'Loading schema visualizer', exact: true })).toHaveCount(0)

    const branches = await hold('**/api/studio/branches')
    await page.goto(`${url}/branches`)
    await branches.wait()
    await grayLoader('Loading live databases')
    branches.release()
    await page.getByRole('button', { name: 'Actions for main', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Edit tag', exact: true }).click()
    await page.getByRole('textbox', { name: 'Branch tag', exact: true }).fill('loading-check')
    const branchReload = await hold('**/api/studio/branches')
    await page.getByRole('button', { name: 'Save tag', exact: true }).click()
    await branchReload.wait()
    const branchList = page.locator('[role="region"][aria-label="Loading branches"]')
    await expect(branchList).toHaveAttribute('aria-busy', 'true')
    await expect(branchList.locator('[data-spinner]')).toBeVisible()
    branchReload.release()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Branch list', exact: true })).not.toHaveAttribute('aria-busy', 'true')

    const backupsPattern = /\/api\/studio\/(?:databases\/[^/]+\/)?backups(?:\?|$)/
    const backups = await hold(backupsPattern)
    await page.goto(`${url}/settings/backups`)
    await backups.wait()
    await grayLoader('Loading backups')
    backups.release()
    await expect(page.getByRole('status', { name: 'Loading backups', exact: true })).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const table = await hold('**/api/studio/databases/*/tables/*/*/rows?*')
    await page.goto(`${url}/tables`)
    await table.wait()
    await grayLoader('Loading tables')
    const circle = page.getByRole('status', { name: 'Loading tables', exact: true }).locator('circle')
    await expect(circle).toHaveAttribute('stroke-dasharray', '0.5 1')
    await expect(page.getByRole('status', { name: 'Loading tables', exact: true }).locator('svg')).toHaveCSS('transform', 'none')
    await page.clock.fastForward(1000)
    await expect(circle).toHaveAttribute('stroke-dasharray', '0.5 1')
    await snapshot('table-gray-spinner-reduced-motion')
    table.release()
    await expect(page.getByLabel('Page number', { exact: true })).toBeVisible()

    await page.route('**/api/studio/branches', route => route.fulfill({
      status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Backend unavailable for loading check' }),
    }), { times: 1 })
    await page.goto(url)
    await expect(page.getByRole('alert').filter({ hasText: 'Backend unavailable for loading check' })).toBeVisible()
    await expect(page.locator('[data-spinner]')).toHaveCount(0)
    const retry = await hold('**/api/studio/branches')
    await page.getByRole('button', { name: 'Retry connection', exact: true }).click()
    await retry.wait()
    await grayLoader('Loading live databases')
    retry.release()
    await expect(page.getByRole('heading', { name: 'Database Size', exact: true })).toBeVisible()
    await checkCards(false)
  } finally {
    for (const release of releases) release()
  }
  console.log('PASS: gray bootstrap/page loaders, four-card skeletons on initial/repeated/automatic refresh, chart masking, error/retry recovery, branch reload, visualizer/backups/table loads and reduced motion')
}
