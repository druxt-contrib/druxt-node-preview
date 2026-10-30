import { resolve } from 'path'

/**
 * Returns the strings in an option list that match a pattern.
 *
 * Anything else is left out, so the plugin template only gets plain values.
 *
 * @param {*} list - The option value.
 * @param {RegExp} pattern - The pattern each value must match.
 *
 * @returns {string[]} The values.
 */
const only = (list, pattern) => (Array.isArray(list) ? list : [])
  .filter((item) => typeof item === 'string' && pattern.test(item))

/**
 * Returns a URL's origin, or null when it is not an http(s) URL.
 *
 * @param {*} url - The URL.
 *
 * @returns {string|null} The origin.
 */
const toOrigin = (url) => {
  try {
    const { origin, protocol } = new URL(url)
    return ['http:', 'https:'].includes(protocol) ? origin : null
  }
  catch {
    return null
  }
}

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
 * The route is named `druxt-node-preview`. The name is public: a site may
 * hook it, so it does not change.
 *
 * @param {object} moduleOptions - Nuxt module options.
 */
const NuxtModule = function (moduleOptions = {}) {
  const druxt = (this.options || {}).druxt || {}
  const options = {
    path: '/druxt/node/preview',
    include: [],
    origins: [],
    ...druxt.nodePreview || {},
    ...moduleOptions,
  }

  // Enable the Vuex store, required by the Druxt store.
  this.options.store = true

  // Add the themeable preview component. The page imports it by this name.
  this.addTemplate({
    src: resolve(__dirname, '../templates/DruxtNodePreview.vue'),
    fileName: 'components/druxt-node-preview.vue',
  })

  // Add the page component template.
  const { dst } = this.addTemplate({
    src: resolve(__dirname, '../templates/DruxtNodePreviewPage.vue'),
    fileName: 'components/druxt-node-preview-page.vue',
  })

  // Register the preview route first, so a site's catch-all or dynamic page
  // cannot shadow it.
  this.extendRoutes((routes, resolveRoute) => {
    routes.unshift({
      name: 'druxt-node-preview',
      path: options.path,
      component: resolveRoute(this.options.buildDir, dst),
    })
  })

  // An origin the site lists must be a full http(s) URL. Say so, rather than
  // leave the site to find out from a refused preview.
  if (!Array.isArray(options.origins)) {
    console.warn('[druxt-node-preview] Ignored the origins option. Use a list of full http(s) URLs, such as [\'https://cms.example.com\'].')
  }
  const listed = (Array.isArray(options.origins) ? options.origins : []).filter((url) => {
    if (toOrigin(url)) return true
    console.warn(`[druxt-node-preview] Ignored the origin "${url}". Use a full http(s) URL, such as "https://cms.example.com".`)
    return false
  })

  const pluginOptions = {
    include: only(options.include, /^[A-Za-z0-9_.-]+$/),
    origins: [],
  }

  // The page fetches a preview only from its own origin, Druxt's Drupal site,
  // or an origin the site lists. druxt-site sets druxt.baseUrl from its own
  // module options, and Nuxt can run it after this module. So the origins are
  // read again once every module has run. The template reads them at build.
  const setOrigins = () => {
    const baseUrl = ((this.options || {}).druxt || {}).baseUrl
    pluginOptions.origins = [...new Set([baseUrl, ...listed].map(toOrigin).filter(Boolean))]
  }
  setOrigins()
  if (this.nuxt) this.nuxt.hook('modules:done', setOrigins)

  // Add the plugin that fetches and seeds the preview.
  this.addPlugin({
    src: resolve(__dirname, '../templates/plugin.js'),
    fileName: 'druxt-node-preview.js',
    options: pluginOptions,
  })
}

export default NuxtModule
