import { test, expect } from '@playwright/test'

const api = 'http://127.0.0.1:5010'
test('CRM opens its persisted account projection, original sources and linked account graph', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const list = await (await request.get(api + '/api/v1/crm/accounts')).json()
  expect(list.success).toBe(true)
  expect(list.data.accounts).toHaveLength(2)
  const account = list.data.accounts[0]
  const detail = (await (await request.get(api + '/api/v1/crm/accounts/' + encodeURIComponent(account.id))).json()).data
  await page.goto('/crm/records')
  await expect(page.getByRole('heading', { name: 'Customer CRM', exact: true, level: 1 })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(account.name) }).click()
  await expect(page.getByRole('heading', { name: account.name, exact: true, level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: account.name, exact: true, level: 1 })).toBeInViewport()
  await page.screenshot({ path: '../.local/screenshots/crm-account-detail-top.png', fullPage: true })
  await expect(page.getByRole('region', { name: 'Contacts', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Contracts', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Invoices', exact: true })).toBeVisible()
  const sources = page.getByRole('region', { name: 'Original customer records', exact: true })
  const source = detail.artifacts[0]
  const trigger = sources.getByRole('button').filter({ hasText: source.title })
  await trigger.click()
  const viewer = page.getByRole('region', { name: 'CRM source viewer', exact: true })
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('pre')).toHaveText(source.content)
  await expect(viewer.getByRole('link', { name: 'Download original', exact: true })).toHaveAttribute('href', api + source.downloadPath)
  const original = await request.get(api + source.downloadPath)
  expect(await original.text()).toBe(source.content)
  await viewer.getByRole('button', { name: 'Close source', exact: true }).click()
  await expect(viewer).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await page.screenshot({ path: '../.local/screenshots/crm-account-detail.png', fullPage: true })
  const graph = page.getByRole('link', { name: 'Open account graph', exact: true })
  await expect(graph).toHaveAttribute('href', '/graph?account=' + account.graphAccountId)
  await graph.click()
  await expect(page.getByRole('combobox', { name: 'Customer account', exact: true })).toHaveValue(account.graphAccountId)
  await page.getByRole('navigation', { name: 'Customer details', exact: true }).getByRole('button', { name: /Source artifacts/ }).click()
  const library = page.getByRole('complementary', { name: 'Source artifact library', exact: true })
  await expect(library.getByRole('button')).toHaveCount(detail.artifacts.length)
  await page.getByRole('combobox', { name: 'Customer account', exact: true }).selectOption('')
  await expect(library.getByRole('button')).toHaveCount(18)
  expect(errors).toEqual([])
})

test('CRM failure stays retryable without substituting account records', async ({ page }) => {
  await page.route('**/api/v1/crm/accounts', route => route.fulfill({ status: 503, json: { message: 'Storage unavailable' } }))
  await page.goto('/crm/records')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Meridian Logistics', exact: true })).toHaveCount(0)
})

test('client-side account navigation resets the content scroll, while graph query changes preserve it', async ({ page, request }) => {
  const accounts = (await (await request.get(api + '/api/v1/crm/accounts')).json()).data.accounts
  await page.goto('/crm/' + encodeURIComponent(accounts[0].id))
  const sources = page.getByRole('region', { name: 'Original customer records', exact: true })
  await sources.getByRole('button').first().click()
  await page.getByRole('region', { name: 'CRM source viewer', exact: true }).getByRole('button', { name: 'Close source', exact: true }).click()
  await expect.poll(() => page.getByRole('main').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  // Drive a client-side history transition without reloading the document, which would hide this regression.
  await page.evaluate(next => { window.history.pushState({}, '', next); window.dispatchEvent(new PopStateEvent('popstate')) }, '/crm/' + encodeURIComponent(accounts[1].id))
  await expect(page.getByRole('heading', { name: accounts[1].name, exact: true, level: 1 })).toBeInViewport()
  await expect.poll(() => page.getByRole('main').evaluate(element => element.scrollTop)).toBe(0)
  await page.screenshot({ path: '../.local/screenshots/crm-account-navigation-top.png', fullPage: true })
  await page.getByRole('link', { name: 'Open account graph', exact: true }).click()
  await page.getByRole('navigation', { name: 'Customer details', exact: true }).getByRole('button', { name: /Source artifacts/ }).click()
  await page.getByRole('main').evaluate(element => { element.scrollTop = 200 })
  await expect.poll(() => page.getByRole('main').evaluate(element => element.scrollTop)).toBe(200)
  await page.evaluate(next => { window.history.pushState({}, '', next); window.dispatchEvent(new PopStateEvent('popstate')) }, '/graph?tab=sources&account=' + encodeURIComponent(accounts[0].graphAccountId))
  await expect(page.getByRole('combobox', { name: 'Customer account', exact: true })).toHaveValue(accounts[0].graphAccountId)
  await expect.poll(() => page.getByRole('main').evaluate(element => element.scrollTop)).toBe(200)
})
