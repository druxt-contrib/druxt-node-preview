import { resolve } from 'path'

export default {
  modules: [
    // The module under test, straight from the repo source.
    resolve(__dirname, '../../src/index.js'),
    'druxt-site',
  ],
  druxt: {
    baseUrl: process.env.DRUPAL_BASE_URL || 'http://localhost:8080',
    // Consumer Node Preview already includes a node's paragraphs, so the
    // example adds no include of its own.
    nodePreview: {},
  },
}
