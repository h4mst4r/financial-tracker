import { expect, test } from '@playwright/test'

test('app shell loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Financial Tracker' })).toBeVisible()
})

test('health endpoint is reachable from the served build', async ({ request }) => {
  const response = await request.get('/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok' })
})
