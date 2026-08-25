import { resolve } from 'path'

export default {
  modules: [
    // The module under test, straight from the repo source.
    resolve(__dirname, '../../src/index.js'),
    'druxt-site',
  ],
  druxt: {
    baseUrl: process.env.DRUPAL_BASE_URL || 'http://localhost:8080',
    nodePreview: {
      include: ['field_body'],
    },
  },
}
