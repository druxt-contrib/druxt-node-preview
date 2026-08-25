const { test, expect } = require('@playwright/test')

const DRUPAL = process.env.DRUPAL_URL
const LOGIN = process.env.DRUPAL_LOGIN_LINK
const STATIC = process.env.FRONTEND_STATIC_URL
const DRUXT = process.env.FRONTEND_DRUXT_URL

// Unique markers per run, so a stale preview can never satisfy an assertion.
const RUN = Date.now().toString(36)
const EDITED = `Alpha edited ${RUN}`
const ADDED = `Brand new ${RUN}`

test.beforeAll(() => {
  for (const [name, value] of [['DRUPAL_URL', DRUPAL], ['DRUPAL_LOGIN_LINK', LOGIN], ['FRONTEND_STATIC_URL', STATIC]]) {
    if (!value) throw new Error(`${name} must be set. Use test/e2e/run.sh or export it.`)
  }
})

/**
 * Logs in, edits the article without saving, and opens the preview.
 *
 * Edits the first paragraph to a unique marker and adds a brand new
 * paragraph, so the previews can only pass when unsaved data flows.
 */
const editAndPreview = async (page) => {
  // The session comes from the shared storage state (test/e2e/global-setup.js).
  await page.goto(`${DRUPAL}/node/1/edit`)
  await page.locator('input[name="field_body[0][subform][field_text][0][value]"]').fill(EDITED)
  await page.getByRole('button', { name: 'Add Text' }).click()
  const added = page.locator('input[name="field_body[2][subform][field_text][0][value]"]')
  await added.waitFor()
  await added.fill(ADDED)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page).toHaveURL(/node\/preview/)
}

/** Picks a frontend on the preview bar and returns the iframe locator. */
const pickFrontend = async (page, label) => {
  const select = page.locator('select[name="frontend"]')
  await select.selectOption({ label })
  // The select auto submits through a Drupal behavior. On a freshly loaded
  // page the behavior may not be attached yet, so submit explicitly when the
  // navigation does not happen on its own.
  await expect(page)
    .toHaveURL(/frontend=/, { timeout: 3000 })
    .catch(() => select.evaluate((el) => el.form.requestSubmit()))
  await expect(page).toHaveURL(/frontend=/)
  return page.frameLocator('iframe')
}

test.describe('static frontend', () => {
  test('renders the unsaved paragraphs', async ({ page }) => {
    await editAndPreview(page)
    const frame = await pickFrontend(page, 'E2E Frontends: Static')

    await expect(frame.locator('#status')).toHaveClass(/ok/)
    await expect(frame.locator('h1')).toHaveText('E2E Preview test')
    await expect(frame.locator('.para').nth(0)).toHaveText(EDITED)
    await expect(frame.locator('.para').nth(1)).toHaveText('Beta (saved)')
    await expect(frame.locator('.para').nth(2)).toHaveText(ADDED)
  })

  test('the teaser view mode reaches the frontend', async ({ page }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Frontends: Static')

    await page.locator('select[name="view_mode"]').selectOption('teaser')
    await expect(page).toHaveURL(/preview\/[0-9a-f-]+\/teaser/)
    // The frontend selection survives the view mode switch.
    await expect(page).toHaveURL(/frontend=/)

    const frame = page.frameLocator('iframe')
    await expect(frame.locator('#vm')).toHaveText('teaser')
    // The static frontend renders a single paragraph in teaser.
    await expect(frame.locator('.para')).toHaveCount(1)
    await expect(frame.locator('.para')).toHaveText(EDITED)
  })

  test('the Drupal option falls back to the core preview', async ({ page }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Frontends: Static')
    await page.locator('select[name="frontend"]').selectOption({ label: '- Drupal -' })
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.locator('body')).toContainText(EDITED)
  })
})

test.describe('druxt frontend', () => {
  test.skip(!DRUXT, 'FRONTEND_DRUXT_URL is not set')

  test('renders the unsaved paragraphs through DruxtEntity', async ({ page }) => {
    await editAndPreview(page)
    const frame = await pickFrontend(page, 'E2E Frontends: Druxt')

    const root = frame.locator('.druxt-node-preview')
    await expect(root).toHaveAttribute('data-entity-type', 'node--e2e_article')
    await expect(root).toContainText(EDITED)
    await expect(root).toContainText(ADDED)
  })

  test('the view mode reaches the Druxt page', async ({ page }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Frontends: Druxt')
    await page.locator('select[name="view_mode"]').selectOption('teaser')

    const frame = page.frameLocator('iframe')
    await expect(frame.locator('.druxt-node-preview')).toHaveAttribute('data-view-mode', 'teaser')
  })
})
