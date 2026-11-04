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
    nodePreview: {
      // Layouts a preview may render in, picked with ?layout=. A registered
      // target sends them to Drupal, and the first is the one a preview
      // opens in.
      layouts: ['default', 'preview'],
      // Registers this frontend as a preview target on its Drupal consumer
      // when it starts. It is on when the environment has the consumer's
      // secret, and DRUXT_NODE_PREVIEW_URL and DRUXT_NODE_PREVIEW_CLIENT_ID
      // give the rest. See "Automatic registration" in the README.
      register: !!process.env.DRUXT_NODE_PREVIEW_CLIENT_SECRET,
    },
  },
}
