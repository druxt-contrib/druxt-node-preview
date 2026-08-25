const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

/**
 * Logs in once with the one time admin link and saves the session.
 *
 * The login link can only be used once, so every test shares this storage
 * state instead of logging in itself.
 */
module.exports = async () => {
  const link = process.env.DRUPAL_LOGIN_LINK
  if (!link) throw new Error('DRUPAL_LOGIN_LINK must be set.')
  const dir = path.resolve(__dirname, 'reports')
  fs.mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(link)
  await page.context().storageState({ path: path.join(dir, 'state.json') })
  await browser.close()
}
