import { test, expect, APIRequestContext } from '@playwright/test'
import type { CrmPortfolio, PortfolioDetail } from '../src/services/crm-portfolio.service'

const api = 'http://127.0.0.1:5010/api/v1/crm/portfolio'
async function overview(request: APIRequestContext): Promise<CrmPortfolio> {
  const response = await request.get(api)
  const body = await response.json()
  test.skip(body.code === 'CRM_SOURCE_NOT_CONFIGURED', 'Configure a private CRM source or saved view for this integration check.')
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  return body.data
}
test('dashboard and CRM use the connected account totals, filters, search and pagination', async ({ page, request }) => {
  const data = await overview(request)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Customer portfolio overview', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp('Customer accounts ' + data.metrics.accounts) })).toBeVisible()
  expect(await page.getByRole('region', { name: 'Customer portfolio overview', exact: true }).innerText()).not.toMatch(/\b(synthetic|demo|dummy|prototype|mock)\b/i)
  await page.screenshot({ path: '../.local/screenshots/crm-filled-dashboard.png', fullPage: true })
  await page.getByRole('link', { name: 'Explore customers', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Customer accounts ' + data.accounts.length, exact: true })).toBeVisible()
  if (data.accounts.length > 15) {
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('Page 2 of', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
  }
  await page.getByRole('combobox', { name: 'Account focus', exact: true }).selectOption('capacity')
  await expect(page.getByRole('heading', { name: 'Customer accounts ' + data.metrics.capacityAccounts, exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Sort accounts', exact: true }).selectOption('name')
  const alphabetic = data.accounts.filter(row => row.capacityCount > 0).sort((a, b) => a.name.localeCompare(b.name))
  await expect(page.getByRole('table').locator('tbody tr').first()).toContainText(alphabetic[0].name)
  const account = data.accounts.find(row => row.capacityCount > 0)!
  await page.getByRole('textbox', { name: 'Search customer accounts', exact: true }).fill(account.id)
  await expect(page.getByRole('heading', { name: 'Customer accounts 1', exact: true })).toBeVisible()
  const pendingExport = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export current view', exact: true }).click()
  const exportedView = await pendingExport
  const fs = await import('node:fs/promises')
  const exported = JSON.parse(await fs.readFile((await exportedView.path())!, 'utf8'))
  expect(exported.accounts.map((row: { id: string }) => row.id)).toEqual([account.id])
  await page.getByRole('link', { name: account.name, exact: true }).click()
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
  await page.screenshot({ path: '../.local/screenshots/crm-portfolio-account.png', fullPage: true })
  expect(errors).toEqual([])
})
test('account tabs, source references, relationship navigation and export stay bound to the selected account', async ({ page, request }) => {
  const data = await overview(request)
  const account = data.accounts.find(row => row.capacityCount > 0) ?? data.accounts[0]
  const detail = (await (await request.get(api + '/accounts/' + account.id)).json()).data as PortfolioDetail
  await page.goto('/crm/' + account.id)
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
  for (const [tab, heading] of [['Services & usage', 'Subscriptions and capacity'], ['Opportunities', 'Recorded sales opportunities'], ['Billing', 'Invoices ·'], ['Conversations', 'Recent customer conversations'], ['Relationships', 'Connected accounts']] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await expect(page.getByRole('tabpanel').getByRole('heading', { name: new RegExp(heading) })).toBeVisible()
  }
  if (detail.relationships.length) {
    const related = detail.relationships[0]
    await page.getByRole('tabpanel').getByRole('link').filter({ hasText: related.name }).first().click()
    await expect(page.getByRole('heading', { name: related.name, exact: true })).toBeVisible()
    await page.goto('/crm/' + account.id)
  }
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export account brief', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe(account.id + '-account-brief.json')
  const filename = await download.path()
  const fs = await import('node:fs/promises')
  const exported = JSON.parse(await fs.readFile(filename!, 'utf8'))
  expect(exported.account.id).toBe(account.id)
  expect(exported.provenance).toEqual(detail.provenance)
  await page.getByRole('button', { name: 'Refresh records', exact: true }).click()
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
})
test('portfolio failure is retryable and never displays another dataset as a substitute', async ({ page, request }) => {
  await overview(request)
  await page.route('**/api/v1/crm/portfolio*', route => route.fulfill({ status: 503, json: { success: false, code: 'CRM_SOURCE_UNAVAILABLE' } }))
  await page.goto('/crm')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.unroute('**/api/v1/crm/portfolio*')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Existing customer intelligence', exact: true })).toBeVisible()
})
test('customer portfolio remains usable on a phone-sized screen', async ({ page, request }) => {
  const data = await overview(request)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/crm')
  await expect(page.getByRole('heading', { name: 'Customer CRM', level: 1, exact: true })).toBeVisible()
  const account = data.accounts[0]
  await page.getByRole('textbox', { name: 'Search customer accounts', exact: true }).fill(account.id)
  await expect(page.getByRole('heading', { name: 'Customer accounts 1', exact: true })).toBeVisible()
  await page.getByRole('link', { name: account.name, exact: true }).click()
  await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  await page.screenshot({ path: '../.local/screenshots/crm-account-mobile.png', fullPage: true })
})
