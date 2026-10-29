module.exports = {
  env: { browser: true, es6: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:nuxt/recommended',
    'plugin:vue/recommended'
  ],
  overrides: [
    {
      files: ['test/**/*.js'],
      env: { jest: true },
    },
  ],
}
