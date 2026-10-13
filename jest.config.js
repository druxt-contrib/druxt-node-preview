module.exports = {
  collectCoverage: true,
  coverageDirectory: './coverage/',
  coveragePathIgnorePatterns: ['/dist/'],
  moduleFileExtensions: ['js', 'json', 'vue'],
  // The page imports the preview component by the name Nuxt gives it.
  moduleNameMapper: {
    '^\\./druxt-node-preview\\.vue$': '<rootDir>/templates/DruxtNodePreview.vue',
  },
  modulePathIgnorePatterns: ['/example/', '/test/e2e/'],
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/example/', '/test/e2e/'],
  transform: {
    '^.+\\.(js)$': 'esbuild-jest',
    '^.+\\.(mjs)$': 'esbuild-jest',
    '^.+\\.(vue)$': 'vue-jest'
  },
  transformIgnorePatterns: ["/node_modules/(?!(druxt)/)"]
}

