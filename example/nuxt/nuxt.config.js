import { existsSync } from 'fs'
import { resolve } from 'path'

/*
 * The module under test, from the repository's own source when there is one.
 *
 * A checkout of the whole repository gets the working tree, so the example
 * exercises what is being changed. A checkout of this directory alone has no
 * `src/` above it, and takes the published package instead: StackBlitz clones
 * the directory the URL names and nothing above it, so a path out of the
 * example resolves outside the checkout and Nuxt stops with `Cannot find
 * module '/home/src/index.js'`.
 */
const source = resolve(__dirname, '../../src/index.js')
const nodePreview = existsSync(source) ? source : '@druxt-contrib/node-preview'

export default {
  modules: [nodePreview, 'druxt-site'],
  druxt: {
    /*
     * The mock Drupal this example starts alongside Nuxt, so it runs with no
     * Drupal to install. Point this at a real site to use one instead.
     */
    baseUrl: process.env.DRUPAL_BASE_URL || 'http://127.0.0.1:3005',
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
