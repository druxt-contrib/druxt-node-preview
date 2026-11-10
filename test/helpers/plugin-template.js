const { createHash } = require('crypto')
const fs = require('fs')
const path = require('path')
const { template } = require('lodash')

// The options the plugin tests use, unless a test needs others.
const DEFAULTS = {
  include: ['field_body'],
  origins: ['https://example.com', 'https://backend.example.com'],
  drupal: 'https://example.com',
  layouts: ['default', 'preview'],
}

const ROOT = path.resolve(__dirname, '../..')
const SOURCE = path.join(ROOT, 'templates/plugin.js')
// jest.config.js measures coverage of this file. It is under coverage/, so
// git and the linters leave it alone.
const MEASURED = path.join(ROOT, 'coverage/templates/plugin.js')

/**
 * Renders templates/plugin.js as Nuxt does, and loads a fresh copy of it.
 *
 * Nuxt renders a plugin with lodash's template and these settings, from
 * @nuxt/builder. The file is written out and required, so Jest instruments it.
 *
 * Every test with the default options shares one file. Istanbul starts the
 * counts again when a file's code changes, so other options go to another
 * file that coverage does not measure.
 *
 * @param {object} [options] - Options that replace the defaults.
 *
 * @returns {object} The plugin module's exports.
 */
const loadPlugin = (options = {}) => {
  const values = { ...DEFAULTS, ...options }
  const rendered = template(fs.readFileSync(SOURCE, 'utf8'), {
    interpolate: /<%=([\s\S]+?)%>/g,
  })({ options: values })
  const same = JSON.stringify(values) === JSON.stringify(DEFAULTS)
  const file = same
    ? MEASURED
    : path.join(
        ROOT,
        'coverage/templates/other',
        createHash('sha1').update(JSON.stringify(values)).digest('hex') + '.js'
      )
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== rendered) {
    fs.writeFileSync(file, rendered)
  }
  let loaded
  jest.isolateModules(() => {
    loaded = require(file)
  })
  return loaded
}

module.exports = { loadPlugin }
