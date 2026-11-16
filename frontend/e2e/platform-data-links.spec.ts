import { test, expect } from '@playwright/test'

test('company detail renders linked DB opportunities and opens its canonical sales account', async ({ page }) => {
  const id = '0123456789abcdef01234567', salesId = 'synthetic:linked-account'
  await page.route('**/api/v1/companies/' + id, route => route.fulfill({ json: { success: true, data: {
    _id: id, companyName: 'Linked account', country: 'Singapore', industry: 'Technology', salesCompanyId: salesId,
    createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', signals: [],
    opportunities: [{ _id: 'opp-linked', potentialService: 'Cybersecurity', priority: 'HIGH', status: 'OPEN', confidenceScore: 0.8, createdAt: '2026-11-10T00:00:00Z' }],
  } } }))
  await page.route('**/api/v1/ai/analyses/latest**', route => route.fulfill({ json: { success: true, data: null } }))
  await page.goto('/companies/' + id)
  await expect(page.getByRole('heading', { name: 'Linked account', exact: true })).toBeVisible()
  await expect(page.getByText('Cybersecurity', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open sales workflow', exact: true })).toHaveAttribute('href', '/sales/companies/' + encodeURIComponent(salesId))
  await expect(page.getByRole('link', { name: 'Open conversation', exact: true })).toHaveAttribute('href', '/ai-management/companies/' + encodeURIComponent(salesId))
  await page.screenshot({ path: '../.local/screenshots/company-linked-opportunities.png', fullPage: true })
})

test('opportunity rows show the account name and navigate using scalar company and sales IDs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const id = '0123456789abcdef01234567', salesId = 'synthetic:linked-account'
  await page.route('**/api/v1/opportunities**', route => route.fulfill({ json: { success: true, data: [{
    _id: 'opp-linked', companyId: id, companyName: 'Linked account', salesCompanyId: salesId, potentialService: 'Cybersecurity',
    priority: 'HIGH', status: 'OPEN', confidenceScore: 0.8, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z',
  }], meta: { total: 1, page: 1, limit: 25 } } }))
  await page.goto('/service-opportunities')
  await expect(page.getByRole('link', { name: 'Linked account', exact: true })).toHaveAttribute('href', '/companies/' + id)
  await expect(page.getByRole('link', { name: 'Open sales workflow', exact: true })).toHaveAttribute('href', '/sales/companies/' + encodeURIComponent(salesId))
  expect(errors).toEqual([])
})

test('company and opportunity failures show recovery instead of substituting unrelated records', async ({ page }) => {
  await page.route('**/api/v1/companies**', route => route.fulfill({ status: 503, json: { message: 'Storage unavailable' } }))
  await page.goto('/companies')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(page.getByText('TechVision Pte Ltd', { exact: true })).toHaveCount(0)
  await page.route('**/api/v1/opportunities**', route => route.fulfill({ status: 503, json: { message: 'Storage unavailable' } }))
  await page.goto('/service-opportunities')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(page.getByText('Singtel Smart IoT', { exact: true })).toHaveCount(0)
})
