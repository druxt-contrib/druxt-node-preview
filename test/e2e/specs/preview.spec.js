const { test, expect } = require('@playwright/test')

const DRUPAL = process.env.DRUPAL_URL
const LOGIN = process.env.DRUPAL_LOGIN_LINK
const STATIC = process.env.FRONTEND_STATIC_URL
const DRUXT = process.env.FRONTEND_DRUXT_URL

// Unique markers per run, so a stale preview can never satisfy an assertion.
const RUN = Date.now().toString(36)
const EDITED = `Alpha edited ${RUN}`
const ADDED = `Brand new ${RUN}`

// Consumer Node Preview's preview screen: a Frontend tab with the frame, its
// Frontend, Layout and View mode selects, and a Drupal tab.
const FRAME = '[data-consumer-node-preview-frame]'
const TARGETS = '[data-consumer-node-preview-target]'
const LAYOUTS = '[data-consumer-node-preview-layout]'
const VIEW_MODES = '[data-consumer-node-preview-view-mode]'

test.beforeAll(() => {
  for (const [name, value] of [
    ['DRUPAL_URL', DRUPAL],
    ['DRUPAL_LOGIN_LINK', LOGIN],
    ['FRONTEND_STATIC_URL', STATIC],
  ]) {
    if (!value)
      throw new Error(`${name} must be set. Use test/e2e/run.sh or export it.`)
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
  await page
    .locator('input[name="field_body[0][subform][field_text][0][value]"]')
    .fill(EDITED)
  await page.getByRole('button', { name: 'Add Text' }).click()
  const added = page.locator(
    'input[name="field_body[2][subform][field_text][0][value]"]'
  )
  await added.waitFor()
  await added.fill(ADDED)
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page).toHaveURL(/node\/preview/)
  // The screen's script marks the screen once its handlers are attached.
  // Before that, a changed select does nothing.
  await page
    .locator('[data-consumer-node-preview][data-once~="consumer-node-preview"]')
    .waitFor()
}

/**
 * Picks a frontend in the Frontend tab and returns the frame locator.
 *
 * The screen swaps the frame for a new one on each change, so the frame is
 * found again by its attribute, once its address is the picked frontend's.
 */
const pickFrontend = async (page, label, frontend) => {
  await page.locator(TARGETS).selectOption({ label })
  await expect
    .poll(() => frameUrl(page).then((url) => url && url.origin))
    .toBe(new URL(frontend).origin)
  return page.frameLocator(FRAME)
}

/** Returns the frame's address as a URL, or null before it has one. */
const frameUrl = async (page) => {
  const src = await page.locator(FRAME).getAttribute('src')
  return src ? new URL(src) : null
}

test.describe('static frontend', () => {
  test('renders the unsaved paragraphs', async ({ page }) => {
    await editAndPreview(page)
    const frame = await pickFrontend(page, 'E2E Static', STATIC)

    await expect(frame.locator('#status')).toHaveClass(/ok/)
    await expect(frame.locator('h1')).toHaveText('E2E Preview test')
    await expect(frame.locator('.para')).toHaveCount(3)
    await expect(frame.locator('.para').nth(0)).toHaveText(EDITED)
    await expect(frame.locator('.para').nth(1)).toHaveText('Beta (saved)')
    await expect(frame.locator('.para').nth(2)).toHaveText(ADDED)
  })

  test('the teaser view mode reaches the frontend', async ({ page }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Static', STATIC)

    await page.locator(VIEW_MODES).selectOption('teaser')
    await expect(page).toHaveURL(/preview\/[0-9a-f-]+\/teaser/)
    // The frontend stays picked across the view mode switch.
    await expect
      .poll(() =>
        frameUrl(page).then(
          (url) => url && [url.origin, url.searchParams.get('vm')]
        )
      )
      .toEqual([new URL(STATIC).origin, 'teaser'])

    const frame = page.frameLocator(FRAME)
    await expect(frame.locator('#vm')).toHaveText('teaser')
    // The static frontend renders a single paragraph in teaser.
    await expect(frame.locator('.para')).toHaveCount(1)
    await expect(frame.locator('.para')).toHaveText(EDITED)
  })

  test("the Drupal tab shows core's preview", async ({ page }) => {
    await editAndPreview(page)
    await page.getByRole('tab', { name: 'Drupal' }).click()
    await expect(page.locator('#consumer-node-preview-drupal')).toBeVisible()
    await expect(page.locator('#consumer-node-preview-drupal')).toContainText(
      EDITED
    )
  })
})

test.describe('druxt frontend', () => {
  test.skip(!DRUXT, 'FRONTEND_DRUXT_URL is not set')

  // nuxt dev renders each page on the server, and the Druxt layout first
  // fetches its blocks and menus from Drupal. That takes five or six seconds,
  // more than the default expect timeout, before the frame has any content.
  const frameExpect = expect.configure({ timeout: 30000 })

  test('renders the unsaved paragraphs through DruxtEntity', async ({
    page,
  }) => {
    await editAndPreview(page)
    const frame = await pickFrontend(page, 'E2E Druxt', DRUXT)

    const root = frame.locator('.druxt-node-preview')
    await frameExpect(root).toHaveAttribute(
      'data-entity-type',
      'node--e2e_article'
    )
    await expect(root).toContainText(EDITED)
    await expect(root).toContainText(ADDED)
  })

  test('the view mode reaches the Druxt page', async ({ page }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Druxt', DRUXT)
    await page.locator(VIEW_MODES).selectOption('teaser')
    await expect(page).toHaveURL(/preview\/[0-9a-f-]+\/teaser/)

    const frame = page.frameLocator(FRAME)
    await frameExpect(frame.locator('.druxt-node-preview')).toHaveAttribute(
      'data-view-mode',
      'teaser'
    )
  })

  test('the Layout select renders the preview in a listed layout', async ({
    page,
  }) => {
    await editAndPreview(page)
    await pickFrontend(page, 'E2E Druxt', DRUXT)

    // The target lists "default" first, so the preview opens in the site's
    // own layout.
    let frame = page.frameLocator(FRAME)
    await frameExpect(frame.locator('.druxt-node-preview')).toContainText(
      EDITED
    )
    await expect(frame.locator('.layout-preview')).toHaveCount(0)

    await page.locator(LAYOUTS).selectOption('preview')
    await expect(page.locator(FRAME)).toHaveAttribute('src', /layout=preview/)
    frame = page.frameLocator(FRAME)
    // The page sets the layout itself once mounted, and the new layout's page
    // loads the preview.
    await frameExpect(
      frame.locator('.layout-preview .druxt-node-preview')
    ).toContainText(EDITED)
    await expect(
      frame.locator('.layout-preview .druxt-node-preview')
    ).toContainText(ADDED)
  })

  test.describe('automatic registration', () => {
    // run.sh starts the Druxt frontend with the register options and the
    // e2e consumer's secret. The frontend registers its target on start,
    // before the stack counts as up.
    const LABEL = new URL(DRUXT).host
    const URL_TEMPLATE = `${DRUXT}/druxt/node/preview?vm=[view_mode]&layout=[layout]#[jsonapi_node_preview_path]`

    test("the consumer has the frontend's target, and keeps its own", async ({
      page,
    }) => {
      // The admin session reads the consumer over Consumer Node Preview's
      // API. A GET needs no CSRF token.
      const response = await page.request.get(
        `${DRUPAL}/api/consumer-node-preview/targets?consumerId=e2e_druxt`
      )
      expect(response.status()).toBe(200)
      expect(await response.json()).toMatchObject({
        targets: [
          {
            label: 'Kept',
            url: 'https://kept.example.com/preview?vm=[view_mode]#[jsonapi_node_preview]',
          },
          { label: LABEL, url: URL_TEMPLATE },
        ],
        // The example frontend lists its layouts, so they replaced the
        // consumer's own list.
        layouts: ['default', 'preview'],
      })
    })

    test('the registered target renders the unsaved paragraphs', async ({
      page,
    }) => {
      await editAndPreview(page)
      // The Frontend picker names a consumer's target "<consumer>: <target>".
      const frame = await pickFrontend(
        page,
        `E2E Druxt frontend: ${LABEL}`,
        DRUXT
      )
      // The registered layouts reached Drupal, so the preview opens in the
      // first one.
      await expect(page.locator(FRAME)).toHaveAttribute('src', /layout=default/)
      // The registered target sends the endpoint as a path. The Druxt client
      // resolves it against druxt.baseUrl.
      await expect(page.locator(FRAME)).toHaveAttribute('src', /#\/jsonapi\//)

      const root = frame.locator('.druxt-node-preview')
      await frameExpect(root).toContainText(EDITED)
      await expect(root).toContainText(ADDED)
    })
  })
})
