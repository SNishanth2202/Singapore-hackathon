import { test, expect, Page } from '@playwright/test'
const api = 'http://127.0.0.1:5010/api/v1/ranking'
async function close(page: Page) {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close details', exact: true }).click()
}
async function replayNext(page: Page) {
  await close(page)
  await page.getByRole('button', { name: 'Workflow checks', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Replay next event', exact: true }).click()
}
async function expectedWorklist(page: Page) {
  const salesperson = await page.getByRole('combobox', { name: 'Account owner' }).inputValue()
  return (await page.request.get(`${api}/queue?view=crm_plus_public&salesperson=${salesperson}`)).json()
}
async function showOpportunity(page: Page, id: string) {
  for (const person of ['aisha', 'daniel', 'priya']) {
    const queue = await (await page.request.get(`${api}/queue?salesperson=${person}`)).json()
    if (queue.items.some((row: { id: string }) => row.id === id)) {
      await close(page)
      await page.getByRole('combobox', { name: 'Account owner' }).selectOption(person)
      await expect(page.getByTestId(`opportunity-${id}`)).toBeVisible()
      return
    }
  }
  throw new Error(`Expected reference opportunity ${id} to be assigned to a salesperson`)
}

test.beforeEach(async ({ request }) => { expect((await request.post(`${api}/demo/reset`, { data: {} })).ok()).toBeTruthy() })
test('public discovery, CRM event, site verification and persisted queue work through the actual UI', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await page.goto('/lead-ranking/reference')
  await expect(page.getByRole('heading', { name: 'Lead Ranking', level: 1 })).toBeVisible()
  await expect(page.locator('tr[data-testid]')).toHaveCount((await expectedWorklist(page)).total)
  await expect(page.getByTestId('opportunity-O02')).toHaveCount(0)
  await expect(page.getByTestId('opportunity-O06')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Queue overview', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Replay next event', exact: true })).toHaveCount(0)
  await replayNext(page)
  await showOpportunity(page, 'O01')
  const etla = page.getByTestId('opportunity-O01')
  await expect(etla.locator('.lr-priority-status')).toHaveText('Normal priority')
  await close(page)
  await replayNext(page)
  await expect(etla.locator('.lr-priority-status')).toHaveText('Urgent')
  await expect(etla.locator('.lr-confidence strong')).toHaveText('80%')
  await close(page)
  await page.getByRole('button', { name: 'Inspect O01', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confidence', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Why this confidence' })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('8 of 10 reference scenarios retained the priority band.')).toBeVisible(); await close(page)
  await replayNext(page)
  const umc = await (await page.request.get(`${api}/queue`)).json()
  expect(umc.items.find((row: { id: string }) => row.id === 'O03').status).toBe('Resolve')
  await replayNext(page)
  await expect(etla.locator('.lr-action-status')).toHaveText('Pursue')
  await expect(etla.locator('.lr-priority-status')).toHaveText('Very urgent')
  await expect(etla.locator('.lr-confidence strong')).toHaveText('100%'); await close(page)
  await page.reload(); await showOpportunity(page, 'O01')
  await expect(etla.locator('.lr-action-status')).toHaveText('Pursue')
  const filter = page.getByRole('combobox', { name: 'Filter by status' })
  await expect(filter.locator('option')).toHaveText(['All urgency levels', 'Very urgent', 'Urgent', 'Normal priority', 'Low priority', 'Irrelevant'])
  await filter.selectOption('Very urgent')
  await expect(etla).toBeVisible()
  for (const badge of await page.locator('tr[data-testid] .lr-priority-status').all()) await expect(badge).toHaveText('Very urgent')
  await filter.selectOption('Irrelevant')
  await expect(page.getByRole('heading', { name: 'No matching leads' })).toBeVisible()
  await filter.selectOption('all')
  await page.locator('main').evaluate(el => el.scrollTo(0, 0))
  await page.screenshot({ path: '../.local/screenshots/desktop-verified.png', fullPage: true })
  await page.getByRole('button', { name: 'Inspect O01', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confidence', exact: true }).click()
  await page.screenshot({ path: '../.local/screenshots/confidence-details.png' })
  await close(page)
  await page.getByRole('button', { name: 'CRM only', exact: true }).click()
  await expect(etla.locator('.lr-discovery-note')).toBeVisible()
  await page.getByRole('button', { name: 'Deal value', exact: true }).click()
  const assigned = await expectedWorklist(page)
  await expect(page.locator('tr[data-testid]')).toHaveCount(assigned.total)
  await page.getByRole('button', { name: 'Compare evidence', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'What changes with evidence?' })).toBeVisible()
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(assigned.total)
  expect(errors).toEqual([])
})
test('source failure, unbounded confidence and healthy empty queue are visible controls', async ({ page }) => {
  await page.goto('/lead-ranking/reference')
  for (let i = 0; i < 2; i++) { await replayNext(page); await expect(page.getByRole('dialog')).toBeVisible(); await close(page) }
  await showOpportunity(page, 'O01')
  const assigned = await expectedWorklist(page)
  await page.getByRole('button', { name: 'Workflow checks', exact: true }).click()
  await page.getByRole('button', { name: /Fail public-source refresh/ }).click()
  await close(page)
  await expect(page.getByText('Public-source refresh failed · worklist preserved')).toBeVisible()
  await expect(page.locator('tr[data-testid]')).toHaveCount(assigned.total)
  await page.getByRole('button', { name: 'Workflow checks', exact: true }).click()
  await page.getByRole('button', { name: /Remove plausible bounds for ETLA/ }).click()
  await close(page)
  await expect(page.getByTestId('opportunity-O01').locator('.lr-insufficient')).toContainText('Insufficient')
  await page.getByRole('button', { name: 'Workflow checks', exact: true }).click()
  await page.getByRole('button', { name: /Load a healthy empty queue/ }).click()
  await close(page)
  await expect(page.getByRole('heading', { name: 'No leads to rank' })).toBeVisible()
  await expect(page.locator('tr[data-testid]')).toHaveCount(0)
})
test('mobile layout contains overflow, sources work, and keyboard closes and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/lead-ranking/reference')
  await expect(page.locator('tr[data-testid]')).toHaveCount((await expectedWorklist(page)).total)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: '../.local/screenshots/mobile-queue.png', fullPage: true })
  const guide = page.getByRole('button', { name: 'Workflow guide', exact: true })
  await guide.click(); await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(guide).toBeFocused()
  await page.getByRole('button', { name: 'Sources & CRM', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Public sources', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'CRM records', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download CRM records' })).toBeVisible()
})
test('customer-register failure discards the saved ranking instead of displaying unchecked cached leads', async ({ page }) => {
  let failureCode: string | null = null
  await page.route('**/api/v1/ranking/queue**', route => failureCode
    ? route.fulfill({ status: 503, json: { code: failureCode, message: 'Customer eligibility cannot be checked.' } })
    : route.continue())
  await page.goto('/lead-ranking/reference')
  await expect(page.locator('tr[data-testid]')).toHaveCount((await expectedWorklist(page)).total)
  expect(await page.evaluate(() => localStorage.getItem('ranking-last-crm_plus_public'))).toBeNull()
  failureCode = 'CUSTOMER_DATABASE_UNAVAILABLE'
  await page.getByRole('button', { name: 'Refresh queue', exact: true }).click()
  await expect(page.locator('tr[data-testid]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Lead ranking unavailable' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('ranking-last-crm_plus_public'))).toBeNull()
  // A cache saved before customer checks existed is unsafe even on an ordinary API outage.
  failureCode = 'API_UNAVAILABLE'
  await page.evaluate(() => localStorage.setItem('ranking-last-crm_plus_public', JSON.stringify({
    items: [{ id: 'O02', account: 'Micron Singapore' }], total: 1, view: 'crm_plus_public',
  })))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Lead ranking unavailable' })).toBeVisible()
  await expect(page.locator('tr[data-testid]')).toHaveCount(0)
})

test.afterAll(async ({ request }) => { await request.post(`${api}/demo/reset`, { data: {} }) })

test('missing-key popup connects without browser key storage; AI urgency and percentage explain themselves', async ({ page, request }) => {
  const base = await (await request.get(`${api}/queue`)).json()
  const meta = await (await request.get(`${api}/demo`)).json()
  const fakeKey = 'sk-browser-test-placeholder-only'
  let connected = false
  await page.route('**/api/v1/ranking/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/llm/session')) {
      expect(route.request().method()).toBe('POST')
      expect(route.request().postDataJSON()).toEqual({ apiKey: fakeKey })
      connected = true
      return route.fulfill({ json: { configured: true, source: 'session', model: 'test-model' } })
    }
    if (url.pathname.endsWith('/demo')) return route.fulfill({ json: { ...meta, rankingMode: 'llm', openAi: { configured: connected, source: connected ? 'session' : null, model: 'test-model' } } })
    if (url.pathname.endsWith('/queue')) return route.fulfill({ json: {
      ...base,
      llm: { mode: connected ? 'llm' : 'rules_preview', status: connected ? 'ready' : 'needs_key', model: 'test-model',
        code: connected ? null : 'OPENAI_KEY_REQUIRED', error: connected ? null : 'Connect an OpenAI API key to assess these leads.', evaluatedAt: new Date().toISOString() },
      items: base.items.map((r: any) => ({ ...r, priorityStatus: 'Urgent',
        assessment: { pending: !connected, model: connected ? 'test-model' : null, evaluatedAt: new Date().toISOString(),
          reason: 'The purchasing window supports timely action.', urgencyReasons: ['Short purchasing window', 'High ticket contract'],
          confidenceReasons: ['Reliable official source', 'Recent buyer confirmation'], evidenceIds: [r.evidence[0].id] },
        rankingConfidence: { ...r.rankingConfidence, method: 'llm_assessment', score: connected ? 73 : null, reason: 'Official evidence and recent CRM facts support this urgency.', scenarios: [], scenarioCount: 0 },
      })),
    } })
    return route.continue()
  })
  await page.goto('/lead-ranking/reference')
  const dialog = page.getByRole('dialog', { name: 'Connect AI' })
  await expect(dialog).toBeVisible()
  const input = dialog.getByLabel('OpenAI API key', { exact: true })
  await expect(input).toHaveAttribute('type', 'password')
  await input.fill(fakeKey)
  await dialog.getByRole('button', { name: 'Connect and assess leads', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const row = page.locator('tr[data-testid]').first()
  await expect(page.getByRole('columnheader', { name: 'SCORE', exact: true })).toHaveCount(0)
  await expect(page.locator('.lr-priority-score')).toHaveCount(0)
  await expect(row.locator('.lr-confidence strong')).toHaveText('73%')
  await row.getByRole('button', { name: 'Urgent', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toContainText('Short purchasing window')
  await expect(page.getByRole('tooltip')).toContainText('High ticket contract')
  await row.getByRole('button', { name: '73%', exact: true }).focus()
  await expect(page.getByRole('tooltip')).toContainText('Reliable official source')
  for (const reason of await page.getByRole('tooltip').locator('li').allTextContents()) expect(reason.split(/\s+/).length).toBeGreaterThanOrEqual(2)
  await page.keyboard.press('Escape'); await expect(page.getByRole('tooltip')).toHaveCount(0)
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))
  expect(storage).not.toContain(fakeKey)
  await page.setViewportSize({ width: 390, height: 844 })
  await row.getByRole('button', { name: '73%', exact: true }).scrollIntoViewIfNeeded()
  await row.getByRole('button', { name: '73%', exact: true }).click()
  await expect(page.getByRole('tooltip')).toBeVisible()
  const bounds = await page.getByRole('tooltip').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
})


test('lead ranking uses the shared app shell, keeps dashboard home and redirects older links', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Singtel Scout — Sales Intelligence', level: 1 })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  await navigation.getByRole('link', { name: 'Lead Ranking', exact: true }).click()
  await expect(page).toHaveURL(/\/lead-ranking$/)
  await expect(page.getByRole('heading', { name: 'Lead Ranking', level: 1 })).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Lead Ranking', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'Research settings' })).toBeVisible()
  await navigation.getByRole('link', { name: 'Company Intelligence', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Company Intelligence', level: 1 })).toBeVisible()
  await page.screenshot({ path: '../.local/screenshots/shared-app-companies.png' })
  await page.goto('/opportunities')
  await expect(page).toHaveURL(/\/lead-ranking$/)
  await expect(page.getByRole('heading', { name: 'Lead Ranking', level: 1 })).toBeVisible()
})
