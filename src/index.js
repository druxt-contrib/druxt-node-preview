import { resolve } from 'path'

/**
 * The DruxtNodePreview Nuxt module.
 *
 * Registers a client side page that renders a Drupal node preview. The page
 * reads the JSON:API Node Preview endpoint from the URL fragment, fetches it
 * with the editor's Drupal session, seeds the Druxt store with the preview
 * document, and renders the node through DruxtEntity.
 *
 * The Drupal site points a Consumer Node Preview target at the page:
 *
 *   https://frontend.example.com/druxt/node/preview?vm=[view_mode]#[jsonapi_node_preview]
 *
 * @param {object} moduleOptions - Nuxt module options.
 */
const NuxtModule = function (moduleOptions = {}) {
  const options = {
    path: '/druxt/node/preview',
    include: [],
    ...(this.options || {}).druxt?.nodePreview || {},
    ...moduleOptions,
  }

  // Enable the Vuex store, required by the Druxt store.
  this.options.store = true

  // Add the page component template.
  const { dst } = this.addTemplate({
    src: resolve(__dirname, '../templates/DruxtNodePreviewPage.vue'),
    fileName: 'components/druxt-node-preview-page.vue',
  })

  // Register the preview route.
  this.extendRoutes((routes, resolveRoute) => {
    routes.push({
      name: 'druxt-node-preview',
      path: options.path,
      component: resolveRoute(this.options.buildDir, dst),
    })
  })

  // Add the plugin that fetches and seeds the preview.
  this.addPlugin({
    src: resolve(__dirname, '../templates/plugin.js'),
    fileName: 'druxt-node-preview.js',
    options: {
      include: options.include,
    },
  })
}

export default NuxtModule
