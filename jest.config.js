module.exports = {
  collectCoverage: true,
  // The module and the templates Nuxt loads from it. templates/plugin.js is
  // not listed: test/plugin.test.js fills in its Nuxt placeholders and runs it
  // through new Function, which Jest cannot instrument, so it would always
  // read as uncovered.
  collectCoverageFrom: ['src/**/*.{js,vue}', 'templates/**/*.vue'],
  coverageDirectory: './coverage/',
  // A floor, not a target. These are the measured baseline of the current
  // tests, rounded down: raise them as coverage genuinely improves, and never
  // lower them to make a merge request pass. Collecting coverage without a
  // threshold enforces nothing while looking like it does.
  //
  // Measured, not guessed: run `npm test` and read the table before changing
  // these.
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 81,
      functions: 100,
      lines: 94,
    },
  },
  coveragePathIgnorePatterns: ['/dist/', '/node_modules/'],
  moduleFileExtensions: ['js', 'json', 'vue'],
  // The page imports the preview component by the name Nuxt gives it.
  moduleNameMapper: {
    '^\\./druxt-node-preview\\.vue$':
      '<rootDir>/templates/DruxtNodePreview.vue',
  },
  modulePathIgnorePatterns: ['/example/', '/test/e2e/'],
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/example/', '/test/e2e/'],
  transform: {
    '^.+\\.(js)$': 'esbuild-jest',
    '^.+\\.(mjs)$': 'esbuild-jest',
    '^.+\\.(vue)$': 'vue-jest',
  },
  transformIgnorePatterns: ['/node_modules/(?!(druxt)/)'],
}
