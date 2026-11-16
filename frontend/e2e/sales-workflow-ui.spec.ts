import { expect, test } from '@playwright/test'

test('test-provider email workflow moves through review, approval, reply and follow-up in the browser', async ({ page }) => {
  await page.goto('/sales')
  await expect(page.getByRole('heading', { name: 'Sales Outreach & Intervention', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Prepare workflow walkthrough' }).click()
  await expect(page.getByRole('status')).toContainText('Workflow activity is retained for review')

  const company = page.locator('a[href="/sales/companies/synthetic%3Amerlion-logistics"]')
  await expect(company).toBeVisible()
  await company.click()

  await expect(page.getByRole('button', { name: 'Company selected' })).toBeDisabled()

  await page.getByPlaceholder('Contact name').fill('Test Contact')
  await page.getByPlaceholder('Contact email').fill('test.contact@example.invalid')
  await page.getByPlaceholder('Role / buying unit').fill('Technology Lead')
  await page.getByPlaceholder('How was this contact verified?').fill('Isolated test record')
  await page.locator('section').filter({ hasText: 'Verified contact and outreach review' }).locator('select').selectOption('RECORDED_CONSENT')
  await page.getByRole('button', { name: /(?:Save|Update) verified contact/ }).click()

  await page.getByRole('button', { name: 'Create initial email draft' }).click()
  await expect(page.getByLabel('Email subject')).not.toBeEmpty()
  await page.getByRole('button', { name: 'Approve email' }).click()
  await page.getByRole('button', { name: 'Send via configured provider' }).click()
  await expect(page.getByText(/Provider accepted at/)).toBeVisible()

  const reply = page.getByPlaceholder('Paste a reply for a local synthetic simulation...')
  await reply.fill('We are interested in a discovery call next week. Please share suitable times.')
  await page.getByRole('button', { name: 'Analyze simulated reply' }).click()
  await expect(page.locator('strong').filter({ hasText: 'REPLY RECEIVED' }).first()).toBeVisible()

  const requested = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
  await page.locator('input[type="datetime-local"]').fill(requested)
  await page.getByRole('button', { name: 'Schedule follow-up' }).click()
  await expect(page.getByRole('status')).toContainText('Follow-up scheduled')
  await expect(page.getByRole('heading', { name: 'Full company activity history' })).toBeVisible()
})
