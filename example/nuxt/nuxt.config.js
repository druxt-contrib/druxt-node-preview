export default {
  modules: [
    '../../src/index.js',
    'druxt-site',
  ],
  druxt: {
    baseUrl: process.env.DRUPAL_BASE_URL || 'http://localhost:8080',
    nodePreview: {
      include: ['field_body'],
    },
  },
}
