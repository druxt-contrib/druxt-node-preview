// Playwright configuration for the end to end suite.
//
// The suite drives a real Drupal site and one or two frontends. Their URLs
// arrive through the environment, so the same specs run against a locally
// orchestrated stack (test/e2e/run.sh) or any existing environment:
//
//   DRUPAL_URL          The Drupal site. Required.
//   DRUPAL_LOGIN_LINK   A one-time admin login link. Required.
//   FRONTEND_STATIC_URL The static reference frontend. Required.
//   FRONTEND_DRUXT_URL  The Druxt frontend. Optional: its tests skip when
//                       unset, so the Drupal side workflow is still covered
//                       without a Nuxt build.
module.exports = {
  testDir: 'test/e2e/specs',
  globalSetup: './test/e2e/global-setup.js',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['junit', { outputFile: 'test/e2e/reports/junit.xml' }]],
  use: {
    storageState: 'test/e2e/reports/state.json',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
}
